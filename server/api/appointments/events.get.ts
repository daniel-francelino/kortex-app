import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { expandRecurrence } from '../../utils/recurrence'
import { parseOrThrow } from '../../utils/validation'

const querySchema = z.object({
  calendarId: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}/).optional(),
  q: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100)
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const query = getQuery(event)
  const params = parseOrThrow(querySchema, query)
  const rangeStart = params.from ? new Date(`${params.from}T00:00:00.000`) : null
  const rangeEnd = params.to ? new Date(`${params.to}T23:59:59.999`) : null
  const rangeStartIso = rangeStart?.toISOString()
  const rangeEndIso = rangeEnd?.toISOString()
  const shouldExpandRange = Boolean(rangeStart && rangeEnd)
  // `,`, `.`, `(`, `)` are PostgREST .or()-filter syntax — a raw `params.q`
  // containing any of those breaks out of the intended ilike pattern (extra
  // clauses, malformed filter). Replacing with spaces keeps the search
  // usable (word boundaries survive) without letting user input reshape the
  // filter's structure.
  const sanitizedQ = params.q?.replace(/[,().]/g, ' ').trim() || undefined

  const supabase = getSupabaseAdminClient()

  // Always resolve the user's own calendar IDs (own + shared-and-accepted) first —
  // getSupabaseAdminClient() uses the service-role key (bypasses RLS), so this
  // membership check is the *only* thing standing between a `calendarId` query
  // param and reading a stranger's events. Never trust `params.calendarId` on
  // its own, even though it's a plain UUID: it must always be a subset of what
  // this user can actually see.
  const [{ data: cals }, { data: shares }] = await Promise.all([
    supabase
      .from('calendars')
      .select('id')
      .eq('owner_user_id', user.id)
      .is('archived_at', null),
    supabase
      .from('calendar_shares')
      .select('calendar_id')
      .eq('invited_user_id', user.id)
      .eq('status', 'accepted')
  ])

  const ownIds = (cals ?? []).map((c: Record<string, unknown>) => c.id as string)
  const sharedIds = (shares ?? []).map((s: Record<string, unknown>) => s.calendar_id as string)
  const accessibleCalendarIds = new Set([...ownIds, ...sharedIds])

  let calendarIds: string[] = []
  if (params.calendarId) {
    if (!accessibleCalendarIds.has(params.calendarId)) {
      throw createError({ statusCode: 403, statusMessage: 'Você não tem acesso a este calendário' })
    }
    calendarIds = [params.calendarId]
  } else {
    calendarIds = [...accessibleCalendarIds]
  }

  // Events the user was invited to (as a participant, not an owner) also show
  // up in the unfiltered "all calendars" view — but not when the user asked
  // to see one specific calendar of their own, since an invited event isn't
  // "in" any calendar they own.
  let invitedEventIds: string[] = []
  if (!params.calendarId) {
    const { data: participations } = await supabase
      .from('event_participants')
      .select('event_id')
      .eq('invited_user_id', user.id)

    invitedEventIds = [...new Set((participations ?? []).map((p: Record<string, unknown>) => p.event_id as string))]
  }

  if (calendarIds.length === 0 && invitedEventIds.length === 0) {
    return { data: [], total: 0, page: params.page, pageSize: params.pageSize }
  }

  const { page, pageSize } = params
  const pageFrom = (page - 1) * pageSize
  const pageTo = pageFrom + pageSize - 1

  let ownedData: Record<string, unknown>[] = []
  let count: number | null = null

  if (calendarIds.length > 0) {
    let queryBuilder = supabase
      .from('events')
      .select('*, calendars!inner(id, name, color)', { count: shouldExpandRange ? undefined : 'exact' })
      .in('calendar_id', calendarIds)
      .is('archived_at', null)

    if (rangeStartIso && rangeEndIso) {
      queryBuilder = queryBuilder.or([
        `and(rrule.is.null,end_at.gte.${rangeStartIso},start_at.lte.${rangeEndIso})`,
        `and(rrule.not.is.null,start_at.lte.${rangeEndIso})`
      ].join(','))
    } else if (rangeStartIso) {
      queryBuilder = queryBuilder.or([
        `and(rrule.is.null,end_at.gte.${rangeStartIso})`,
        'rrule.not.is.null'
      ].join(','))
    } else if (rangeEndIso) {
      queryBuilder = queryBuilder.or([
        `and(rrule.is.null,start_at.lte.${rangeEndIso})`,
        `and(rrule.not.is.null,start_at.lte.${rangeEndIso})`
      ].join(','))
    }
    if (sanitizedQ) {
      queryBuilder = queryBuilder.or(`title.ilike.%${sanitizedQ}%,description.ilike.%${sanitizedQ}%,location.ilike.%${sanitizedQ}%`)
    }

    queryBuilder = queryBuilder.order('start_at', { ascending: true })

    if (!shouldExpandRange) {
      queryBuilder = queryBuilder.range(pageFrom, pageTo)
    }

    const { data, count: ownedCount, error } = await queryBuilder

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }

    ownedData = data ?? []
    count = ownedCount
  }

  let invitedData: Record<string, unknown>[] = []
  if (invitedEventIds.length > 0) {
    let invitedQueryBuilder = supabase
      .from('events')
      .select('*, calendars(id, name, color)')
      .in('id', invitedEventIds)
      .is('archived_at', null)

    if (rangeStartIso && rangeEndIso) {
      invitedQueryBuilder = invitedQueryBuilder.or([
        `and(rrule.is.null,end_at.gte.${rangeStartIso},start_at.lte.${rangeEndIso})`,
        `and(rrule.not.is.null,start_at.lte.${rangeEndIso})`
      ].join(','))
    } else if (rangeStartIso) {
      invitedQueryBuilder = invitedQueryBuilder.or([
        `and(rrule.is.null,end_at.gte.${rangeStartIso})`,
        'rrule.not.is.null'
      ].join(','))
    } else if (rangeEndIso) {
      invitedQueryBuilder = invitedQueryBuilder.or([
        `and(rrule.is.null,start_at.lte.${rangeEndIso})`,
        `and(rrule.not.is.null,start_at.lte.${rangeEndIso})`
      ].join(','))
    }
    if (sanitizedQ) {
      invitedQueryBuilder = invitedQueryBuilder.or(`title.ilike.%${sanitizedQ}%,description.ilike.%${sanitizedQ}%,location.ilike.%${sanitizedQ}%`)
    }

    invitedQueryBuilder = invitedQueryBuilder.order('start_at', { ascending: true })

    const { data, error } = await invitedQueryBuilder

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }

    invitedData = data ?? []
  }

  const seenIds = new Set<string>()
  const events: Record<string, unknown>[] = []
  for (const row of [...ownedData, ...invitedData]) {
    const id = row.id as string
    if (seenIds.has(id)) continue
    seenIds.add(id)
    events.push(row)
  }
  const recurringEventIds = events
    .filter((e: Record<string, unknown>) => e.rrule)
    .map((e: Record<string, unknown>) => e.id as string)

  let exceptions: Record<string, unknown>[] = []
  if (recurringEventIds.length > 0) {
    const { data: exData } = await supabase
      .from('event_exceptions')
      .select('*')
      .in('event_id', recurringEventIds)

    exceptions = exData ?? []
  }

  // Expand recurring events within date range if from/to provided
  interface ExpandedEvent {
    id: string
    calendar_id: string
    owner_user_id: string
    title: string
    description: string | null
    location: string | null
    start_at: string
    end_at: string
    event_timezone: string
    all_day: boolean
    rrule: string | null
    is_recurring: boolean
    recurrence_id: string | null
    is_cancelled: boolean
    calendars: Record<string, unknown>
  }

  const expandedEvents: ExpandedEvent[] = []

  for (const evt of events) {
    const e = evt as Record<string, unknown>
    if (!e.rrule && rangeStartIso && rangeEndIso) {
      expandedEvents.push({
        ...(e as unknown as ExpandedEvent),
        is_recurring: false,
        recurrence_id: null,
        is_cancelled: false
      })
    } else if (e.rrule && rangeStart && rangeEnd) {
      const duration = new Date(e.end_at as string).getTime() - new Date(e.start_at as string).getTime()
      const recurrenceRangeStart = new Date(rangeStart.getTime() - duration)

      const occurrences = expandRecurrence(
        e.start_at as string,
        e.rrule as string,
        recurrenceRangeStart,
        rangeEnd,
        e.event_timezone as string
      )

      const eventExceptions = exceptions.filter(
        (ex: Record<string, unknown>) => ex.event_id === e.id
      )

      for (const occ of occurrences) {
        const recurrenceId = occ.toISOString()
        const exception = eventExceptions.find(
          (ex: Record<string, unknown>) => ex.recurrence_id === recurrenceId
        )

        const isCancelled = exception
          ? (exception.type as string) === 'cancelled'
          : false

        if (!isCancelled) {
          const occEnd = new Date(occ.getTime() + duration)

          // Apply the per-occurrence override (if any) *before* deciding
          // range membership — an occurrence moved outside its original slot
          // (via "somente esta ocorrência") must be included/excluded based
          // on where it actually ended up, not on the recurrence math's
          // unmodified original slot. Using the unmodified `occ`/`occEnd`
          // here made a moved occurrence vanish from the range it moved into,
          // or linger in the range it moved out of.
          const effectiveStart = (exception && (exception.override_start_at as string | null))
            ? new Date(exception.override_start_at as string)
            : occ
          const effectiveEnd = (exception && (exception.override_end_at as string | null))
            ? new Date(exception.override_end_at as string)
            : occEnd

          if (effectiveEnd < rangeStart || effectiveStart > rangeEnd) {
            continue
          }

          expandedEvents.push({
            id: e.id as string,
            calendar_id: e.calendar_id as string,
            owner_user_id: e.owner_user_id as string,
            title: (exception && (exception.override_title as string | null))
              ? (exception.override_title as string)
              : (e.title as string),
            description: (exception && (exception.override_description as string | null))
              ? (exception.override_description as string)
              : (e.description as string | null),
            location: (exception && (exception.override_location as string | null))
              ? (exception.override_location as string)
              : (e.location as string | null),
            start_at: effectiveStart.toISOString(),
            end_at: effectiveEnd.toISOString(),
            event_timezone: e.event_timezone as string,
            all_day: e.all_day as boolean,
            rrule: e.rrule as string,
            is_recurring: true,
            recurrence_id: recurrenceId,
            is_cancelled: false,
            calendars: e.calendars as Record<string, unknown>
          })
        }
      }
    } else {
      expandedEvents.push({
        ...(e as unknown as ExpandedEvent),
        is_recurring: Boolean(e.rrule),
        recurrence_id: null,
        is_cancelled: false
      })
    }
  }

  // Sort expanded events by start_at
  expandedEvents.sort((a, b) =>
    new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  )

  const paginatedEvents = shouldExpandRange
    ? expandedEvents.slice(pageFrom, pageFrom + pageSize)
    : expandedEvents

  return {
    data: paginatedEvents,
    total: shouldExpandRange ? expandedEvents.length : count ?? 0,
    page,
    pageSize
  }
})
