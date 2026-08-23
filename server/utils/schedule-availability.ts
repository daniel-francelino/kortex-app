import type { SupabaseClient } from '@supabase/supabase-js'
import { expandRecurrence } from './recurrence'
import { getTimeZoneParts, zonedDateTimeToUtcIso } from './timezone'

export interface BusyInterval {
  start: Date
  end: Date
}

export interface FreeRange {
  start: Date
  end: Date
}

export interface AvailabilityRuleRow {
  dayOfWeek: number
  startTime: string
  endTime: string
}

export interface SchedulingPageForAvailability {
  id: string
  userId: string
  timezone: string
  durationMinutes: number
  bufferBeforeMinutes: number
  bufferAfterMinutes: number
  slotIncrementMinutes: number
  minNoticeHours: number
  maxAdvanceDays: number
  maxBookingsPerDay: number | null
}

function* iterateDates(fromDateStr: string, toDateStr: string): Generator<string> {
  const cursor = new Date(`${fromDateStr}T00:00:00Z`)
  const end = new Date(`${toDateStr}T00:00:00Z`)
  while (cursor <= end) {
    yield cursor.toISOString().split('T')[0]!
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
}

/**
 * Fetches every busy interval (real events, recurrence expanded, exceptions
 * applied) across ALL of the host's non-archived calendars in [rangeStart,
 * rangeEnd] — a personal commitment in an unrelated calendar still blocks the
 * slot, same requirement as Google/Calendly. Mirrors the expansion logic in
 * server/api/appointments/events.get.ts, trimmed to just start/end pairs.
 */
export async function resolveBusyIntervals(
  supabase: SupabaseClient,
  hostUserId: string,
  rangeStart: Date,
  rangeEnd: Date
): Promise<BusyInterval[]> {
  const { data: calendars } = await supabase
    .from('calendars')
    .select('id')
    .eq('owner_user_id', hostUserId)
    .is('archived_at', null)

  const calendarIds = (calendars ?? []).map((c: Record<string, unknown>) => c.id as string)
  if (calendarIds.length === 0) return []

  const rangeStartIso = rangeStart.toISOString()
  const rangeEndIso = rangeEnd.toISOString()

  const { data: events } = await supabase
    .from('events')
    .select('id, start_at, end_at, event_timezone, rrule')
    .in('calendar_id', calendarIds)
    .is('archived_at', null)
    .or([
      `and(rrule.is.null,end_at.gte.${rangeStartIso},start_at.lte.${rangeEndIso})`,
      `and(rrule.not.is.null,start_at.lte.${rangeEndIso})`
    ].join(','))

  const rows = (events ?? []) as Array<Record<string, unknown>>
  const recurringIds = rows.filter(e => e.rrule).map(e => e.id as string)

  let exceptions: Array<Record<string, unknown>> = []
  if (recurringIds.length > 0) {
    const { data: exData } = await supabase
      .from('event_exceptions')
      .select('event_id, type, recurrence_id, override_start_at, override_end_at')
      .in('event_id', recurringIds)

    exceptions = exData ?? []
  }

  const busy: BusyInterval[] = []

  for (const evt of rows) {
    const startAt = evt.start_at as string
    const endAt = evt.end_at as string
    const rrule = evt.rrule as string | null

    if (!rrule) {
      busy.push({ start: new Date(startAt), end: new Date(endAt) })
      continue
    }

    const duration = new Date(endAt).getTime() - new Date(startAt).getTime()
    const expandRangeStart = new Date(rangeStart.getTime() - duration)
    const occurrences = expandRecurrence(startAt, rrule, expandRangeStart, rangeEnd, evt.event_timezone as string)
    const eventExceptions = exceptions.filter(ex => ex.event_id === evt.id)

    for (const occ of occurrences) {
      const recurrenceId = occ.toISOString()
      const exception = eventExceptions.find(ex => ex.recurrence_id === recurrenceId)
      const isCancelled = exception ? exception.type === 'cancelled' : false
      if (isCancelled) continue

      const occStart = exception?.override_start_at ? new Date(exception.override_start_at as string) : occ
      const occEnd = exception?.override_end_at
        ? new Date(exception.override_end_at as string)
        : new Date(occ.getTime() + duration)

      busy.push({ start: occStart, end: occEnd })
    }
  }

  return busy
}

function subtractBusyFromWindow(windowStart: Date, windowEnd: Date, busy: BusyInterval[]): FreeRange[] {
  const relevant = busy
    .filter(b => b.end > windowStart && b.start < windowEnd)
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  const free: FreeRange[] = []
  let cursor = windowStart

  for (const b of relevant) {
    const bStart = b.start < windowStart ? windowStart : b.start
    const bEnd = b.end > windowEnd ? windowEnd : b.end
    if (bStart > cursor) free.push({ start: cursor, end: bStart })
    if (bEnd > cursor) cursor = bEnd
  }

  if (cursor < windowEnd) free.push({ start: cursor, end: windowEnd })

  return free
}

function sliceIntoSlots(freeRanges: FreeRange[], durationMinutes: number, incrementMinutes: number): FreeRange[] {
  const durationMs = durationMinutes * 60000
  const incrementMs = incrementMinutes * 60000
  const slots: FreeRange[] = []

  for (const range of freeRanges) {
    let cursor = range.start.getTime()
    while (cursor + durationMs <= range.end.getTime()) {
      slots.push({ start: new Date(cursor), end: new Date(cursor + durationMs) })
      cursor += incrementMs
    }
  }

  return slots
}

/**
 * Computes every open slot for a scheduling page in [fromDateStr, toDateStr]
 * (inclusive, host-local calendar dates). See docs/appointments/PLANO_LINK_AGENDAMENTO.md
 * section 5.3 for the algorithm this implements.
 */
export async function computeAvailableSlots(
  supabase: SupabaseClient,
  page: SchedulingPageForAvailability,
  availabilityRules: AvailabilityRuleRow[],
  fromDateStr: string,
  toDateStr: string
): Promise<FreeRange[]> {
  const rangeStart = new Date(zonedDateTimeToUtcIso(fromDateStr, '00:00', page.timezone))
  const rangeEndExclusive = new Date(zonedDateTimeToUtcIso(toDateStr, '00:00', page.timezone))
  rangeEndExclusive.setUTCDate(rangeEndExclusive.getUTCDate() + 1)

  const rawBusy = await resolveBusyIntervals(supabase, page.userId, rangeStart, rangeEndExclusive)

  // Buffers expand each busy block before slicing free time out of it.
  const bufferedBusy: BusyInterval[] = rawBusy.map(b => ({
    start: new Date(b.start.getTime() - page.bufferBeforeMinutes * 60000),
    end: new Date(b.end.getTime() + page.bufferAfterMinutes * 60000)
  }))

  let confirmedByDay = new Map<string, number>()
  if (page.maxBookingsPerDay) {
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, status, event:events(start_at)')
      .eq('scheduling_page_id', page.id)
      .eq('status', 'confirmed')

    const counts = new Map<string, number>()
    for (const row of (bookings ?? []) as Array<Record<string, unknown>>) {
      const evt = row.event as Record<string, unknown> | Record<string, unknown>[] | null
      const eventRow = Array.isArray(evt) ? evt[0] : evt
      const startAt = eventRow?.start_at as string | undefined
      if (!startAt) continue
      const parts = getTimeZoneParts(new Date(startAt), page.timezone)
      const dayStr = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
      counts.set(dayStr, (counts.get(dayStr) ?? 0) + 1)
    }
    confirmedByDay = counts
  }

  const now = new Date()
  const noticeThreshold = new Date(now.getTime() + page.minNoticeHours * 3600000)
  const advanceThreshold = new Date(now.getTime() + page.maxAdvanceDays * 86400000)

  const allSlots: FreeRange[] = []

  for (const dateStr of iterateDates(fromDateStr, toDateStr)) {
    if (page.maxBookingsPerDay && (confirmedByDay.get(dateStr) ?? 0) >= page.maxBookingsPerDay) {
      continue
    }

    const dayOfWeek = new Date(`${dateStr}T12:00:00Z`).getUTCDay()
    const rulesForDay = availabilityRules.filter(r => r.dayOfWeek === dayOfWeek)

    for (const rule of rulesForDay) {
      const windowStart = new Date(zonedDateTimeToUtcIso(dateStr, rule.startTime, page.timezone))
      const windowEnd = new Date(zonedDateTimeToUtcIso(dateStr, rule.endTime, page.timezone))

      const freeRanges = subtractBusyFromWindow(windowStart, windowEnd, bufferedBusy)
      const slots = sliceIntoSlots(freeRanges, page.durationMinutes, page.slotIncrementMinutes)

      for (const slot of slots) {
        if (slot.start < noticeThreshold) continue
        if (slot.start > advanceThreshold) continue
        allSlots.push(slot)
      }
    }
  }

  allSlots.sort((a, b) => a.start.getTime() - b.start.getTime())

  return allSlots
}
