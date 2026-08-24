import { getTimeZoneParts, zonedDateTimeToUtcIso } from './timezone'

const HABITS_CALENDAR_NAME = 'Hábitos'
const HABITS_CALENDAR_DESCRIPTION = 'Agendamentos gerados automaticamente a partir de hábitos com horário definido.'
const HABITS_CALENDAR_COLOR = '#10b981'
const DEFAULT_HABIT_EVENT_DURATION_MINUTES = 30
const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const
const WEEKLY_HABIT_DAY = 1

type SupabaseClient = ReturnType<typeof import('./supabase').getSupabaseAdminClient>

interface LinkedHabitEvent {
  linkId: string | null
  eventId: string
  archivedAt: string | null
  startAt: string
}

function getRowValue<T = unknown>(row: Record<string, unknown>, camelKey: string, snakeKey: string): T | null {
  return (row[camelKey] ?? row[snakeKey] ?? null) as T | null
}

function getHabitId(habit: Record<string, unknown>): string {
  return String(getRowValue(habit, 'id', 'id') ?? '')
}

function getHabitName(habit: Record<string, unknown>): string {
  return String(getRowValue(habit, 'name', 'name') ?? '')
}

function getHabitDescription(habit: Record<string, unknown>): string | null {
  return getRowValue<string>(habit, 'description', 'description')
}

function getHabitFrequency(habit: Record<string, unknown>): 'daily' | 'weekly' | 'custom' {
  return String(getRowValue(habit, 'frequency', 'frequency') ?? 'daily') as 'daily' | 'weekly' | 'custom'
}

function getHabitCustomDays(habit: Record<string, unknown>): number[] {
  const value = getRowValue<number[]>(habit, 'customDays', 'custom_days')
  return Array.isArray(value) ? value : []
}

function getHabitScheduledTime(habit: Record<string, unknown>): string | null {
  return getRowValue<string>(habit, 'scheduledTime', 'scheduled_time')
}

function getHabitScheduledEndTime(habit: Record<string, unknown>): string | null {
  return getRowValue<string>(habit, 'scheduledEndTime', 'scheduled_end_time')
}

function getHabitTimezone(habit: Record<string, unknown>): string | null {
  return getRowValue<string>(habit, 'timezone', 'timezone')
}

function getHabitCalendarId(habit: Record<string, unknown>): string | null {
  return getRowValue<string>(habit, 'calendarId', 'calendar_id')
}

function stripHtml(value: string | null | undefined): string | null {
  if (!value) return null

  const normalized = value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return normalized || null
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().split('T')[0] ?? dateStr
}

function getTodayInTimeZone(timeZone: string): { date: string, weekday: number } {
  const parts = getTimeZoneParts(new Date(), timeZone)
  const date = `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`

  return {
    date,
    weekday: parts.weekday
  }
}

function getDateInTimeZone(isoDateTime: string, timeZone: string): string {
  const parts = getTimeZoneParts(new Date(isoDateTime), timeZone)
  return `${String(parts.year).padStart(4, '0')}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

function getScheduledDays(frequency: 'daily' | 'weekly' | 'custom', customDays: number[]): number[] {
  if (frequency === 'daily') {
    return [0, 1, 2, 3, 4, 5, 6]
  }

  if (frequency === 'weekly') {
    return [WEEKLY_HABIT_DAY]
  }

  return [...new Set(customDays)].sort((left, right) => left - right)
}

function getFirstOccurrenceDate(frequency: 'daily' | 'weekly' | 'custom', customDays: number[], timeZone: string): string {
  const today = getTodayInTimeZone(timeZone)
  const scheduledDays = getScheduledDays(frequency, customDays)

  if (frequency === 'daily' || scheduledDays.length === 0) {
    return today.date
  }

  for (let offset = 0; offset < 7; offset += 1) {
    const weekday = (today.weekday + offset) % 7
    if (scheduledDays.includes(weekday)) {
      return addDays(today.date, offset)
    }
  }

  return today.date
}

function buildHabitRRule(frequency: 'daily' | 'weekly' | 'custom', customDays: number[]): string | null {
  if (frequency === 'daily') {
    return 'FREQ=DAILY'
  }

  const scheduledDays = getScheduledDays(frequency, customDays)

  if (scheduledDays.length === 0) {
    return null
  }

  if (scheduledDays.length === 7) {
    return 'FREQ=DAILY'
  }

  return `FREQ=WEEKLY;BYDAY=${scheduledDays.map(day => DAY_CODES[day]).join(',')}`
}

function buildHabitEventPayload(habit: Record<string, unknown>, timeZone: string, calendarId: string, anchorDate?: string) {
  const scheduledTime = getHabitScheduledTime(habit)
  if (!scheduledTime) return null

  const frequency = getHabitFrequency(habit)
  const customDays = getHabitCustomDays(habit)
  // Reuses the linked event's existing start date on re-sync (anchorDate) rather than
  // recomputing it to "today" — otherwise every habit edit would push DTSTART forward
  // and the recurrence expansion (which never generates occurrences before DTSTART)
  // would silently drop everything before today from past calendar views.
  const firstOccurrenceDate = anchorDate ?? getFirstOccurrenceDate(frequency, customDays, timeZone)
  const startAt = zonedDateTimeToUtcIso(firstOccurrenceDate, scheduledTime, timeZone)

  const scheduledEndTime = getHabitScheduledEndTime(habit)
  let endAt = scheduledEndTime
    ? zonedDateTimeToUtcIso(firstOccurrenceDate, scheduledEndTime, timeZone)
    : new Date(new Date(startAt).getTime() + DEFAULT_HABIT_EVENT_DURATION_MINUTES * 60 * 1000).toISOString()

  if (new Date(endAt) <= new Date(startAt)) {
    endAt = new Date(new Date(startAt).getTime() + DEFAULT_HABIT_EVENT_DURATION_MINUTES * 60 * 1000).toISOString()
  }

  return {
    calendar_id: calendarId,
    title: getHabitName(habit),
    description: stripHtml(getHabitDescription(habit)),
    location: null,
    start_at: startAt,
    end_at: endAt,
    event_timezone: timeZone,
    all_day: false,
    rrule: buildHabitRRule(frequency, customDays)
  }
}

async function getUserTimezone(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('user_preferences')
    .select('timezone')
    .eq('user_id', userId)
    .single()

  if (error && error.code !== 'PGRST116') {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível carregar o timezone do usuário', data: error.message })
  }

  return data?.timezone ?? 'UTC'
}

async function getOrCreateHabitsCalendar(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data: existing, error: existingError } = await supabase
    .from('calendars')
    .select('id')
    .eq('owner_user_id', userId)
    .eq('name', HABITS_CALENDAR_NAME)
    .is('archived_at', null)
    .order('created_at', { ascending: true })
    .limit(1)

  if (existingError) {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível localizar o calendário de hábitos', data: existingError.message })
  }

  const existingId = existing?.[0]?.id as string | undefined
  if (existingId) return existingId

  const { data: created, error: createErrorResult } = await supabase
    .from('calendars')
    .insert({
      owner_user_id: userId,
      name: HABITS_CALENDAR_NAME,
      description: HABITS_CALENDAR_DESCRIPTION,
      color: HABITS_CALENDAR_COLOR,
      visibility: 'private'
    })
    .select('id')
    .single()

  if (createErrorResult || !created?.id) {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível criar o calendário de hábitos', data: createErrorResult?.message })
  }

  return created.id as string
}

async function getExistingUserCalendarIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('calendars')
    .select('id')
    .eq('owner_user_id', userId)
    .is('archived_at', null)
    .order('created_at', { ascending: true })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível carregar os calendários do usuário', data: error.message })
  }

  return (data ?? []).map(calendar => String(calendar.id ?? '')).filter(Boolean)
}

async function resolveTargetCalendarId(
  supabase: SupabaseClient,
  userId: string,
  preferredCalendarId: string | null
): Promise<string> {
  const calendarIds = await getExistingUserCalendarIds(supabase, userId)

  if (preferredCalendarId && calendarIds.includes(preferredCalendarId)) {
    return preferredCalendarId
  }

  if (calendarIds.length > 0) {
    return calendarIds[0]!
  }

  return getOrCreateHabitsCalendar(supabase, userId)
}

async function getLinkedHabitEvents(supabase: SupabaseClient, userId: string, habitId: string): Promise<LinkedHabitEvent[]> {
  const { data: links, error: linksError } = await supabase
    .from('entity_links')
    .select('id, target_id')
    .eq('user_id', userId)
    .eq('source_type', 'habit')
    .eq('source_id', habitId)
    .eq('target_type', 'event')
    .order('created_at', { ascending: false })

  if (linksError) {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível carregar os vínculos do hábito com eventos', data: linksError.message })
  }

  const eventIds = (links ?? []).map(link => String(link.target_id ?? '')).filter(Boolean)
  if (eventIds.length === 0) return []

  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('id, archived_at, start_at')
    .in('id', eventIds)
    .eq('owner_user_id', userId)

  if (eventsError) {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível carregar os eventos vinculados ao hábito', data: eventsError.message })
  }

  const eventMap = new Map(
    (events ?? []).map(event => [
      String(event.id),
      {
        eventId: String(event.id),
        archivedAt: (event.archived_at as string | null) ?? null,
        startAt: String(event.start_at ?? '')
      }
    ])
  )

  const resolvedLinks: Array<LinkedHabitEvent | null> = (links ?? []).map((link) => {
    const event = eventMap.get(String(link.target_id ?? ''))
    if (!event) return null

    return {
      linkId: link.id ? String(link.id) : null,
      eventId: event.eventId,
      archivedAt: event.archivedAt,
      startAt: event.startAt
    }
  })

  return resolvedLinks.filter((item): item is LinkedHabitEvent => item !== null)
}

async function createEventHistorySnapshot(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
  eventData: Record<string, unknown>,
  changeType: 'update' | 'archive'
) {
  const { error } = await supabase.from('event_history').insert({
    event_id: eventId,
    changed_by: userId,
    title: eventData.title,
    description: eventData.description,
    location: eventData.location,
    start_at: eventData.start_at,
    end_at: eventData.end_at,
    event_timezone: eventData.event_timezone,
    all_day: eventData.all_day,
    rrule: eventData.rrule,
    calendar_id: eventData.calendar_id,
    change_type: changeType
  })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível registrar o histórico do evento do hábito', data: error.message })
  }
}

async function archiveEventById(supabase: SupabaseClient, userId: string, eventId: string): Promise<void> {
  const { data: current, error: currentError } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .eq('owner_user_id', userId)
    .is('archived_at', null)
    .single()

  if (currentError || !current) {
    if (currentError?.code === 'PGRST116') return
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível localizar o evento do hábito para arquivar', data: currentError?.message })
  }

  await createEventHistorySnapshot(supabase, userId, eventId, current as Record<string, unknown>, 'archive')

  const { error } = await supabase
    .from('events')
    .update({
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', eventId)
    .eq('owner_user_id', userId)
    .is('archived_at', null)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível arquivar o evento vinculado ao hábito', data: error.message })
  }
}

async function updateEventById(
  supabase: SupabaseClient,
  userId: string,
  eventId: string,
  updateData: Record<string, unknown>
): Promise<void> {
  const { data: current, error: currentError } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .eq('owner_user_id', userId)
    .is('archived_at', null)
    .single()

  if (currentError || !current) {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível localizar o evento vinculado ao hábito', data: currentError?.message })
  }

  await createEventHistorySnapshot(supabase, userId, eventId, current as Record<string, unknown>, 'update')

  const { error } = await supabase
    .from('events')
    .update({
      ...updateData,
      updated_at: new Date().toISOString()
    })
    .eq('id', eventId)
    .eq('owner_user_id', userId)
    .is('archived_at', null)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível atualizar o evento vinculado ao hábito', data: error.message })
  }
}

async function upsertHabitEventLink(
  supabase: SupabaseClient,
  userId: string,
  habitId: string,
  eventId: string,
  existingLinkId: string | null
): Promise<void> {
  if (existingLinkId) {
    const { error } = await supabase
      .from('entity_links')
      .update({
        target_id: eventId
      })
      .eq('id', existingLinkId)
      .eq('user_id', userId)

    if (error) {
      throw createError({ statusCode: 500, statusMessage: 'Não foi possível atualizar o vínculo entre hábito e evento', data: error.message })
    }

    return
  }

  const { error } = await supabase
    .from('entity_links')
    .insert({
      user_id: userId,
      source_type: 'habit',
      source_id: habitId,
      target_type: 'event',
      target_id: eventId
    })

  if (error && error.code !== '23505') {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível criar o vínculo entre hábito e evento', data: error.message })
  }
}

export async function syncHabitLinkedEvent(
  supabase: SupabaseClient,
  userId: string,
  habit: Record<string, unknown>
): Promise<void> {
  const habitId = getHabitId(habit)
  if (!habitId) return

  const linkedEvents = await getLinkedHabitEvents(supabase, userId, habitId)
  const activeEvent = linkedEvents.find(item => !item.archivedAt) ?? null
  const latestLinkedEvent = linkedEvents[0] ?? null
  const scheduledTime = getHabitScheduledTime(habit)

  if (!scheduledTime) {
    if (activeEvent) {
      await archiveEventById(supabase, userId, activeEvent.eventId)
    }
    return
  }

  const timeZone = getHabitTimezone(habit) ?? await getUserTimezone(supabase, userId)
  const calendarId = await resolveTargetCalendarId(supabase, userId, getHabitCalendarId(habit))
  const anchorDate = activeEvent?.startAt ? getDateInTimeZone(activeEvent.startAt, timeZone) : undefined
  const payload = buildHabitEventPayload(habit, timeZone, calendarId, anchorDate)

  if (!payload) return

  if (activeEvent) {
    await updateEventById(supabase, userId, activeEvent.eventId, payload)
    return
  }

  const { data: createdEvent, error: createErrorResult } = await supabase
    .from('events')
    .insert({
      owner_user_id: userId,
      ...payload
    })
    .select('id')
    .single()

  if (createErrorResult || !createdEvent?.id) {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível criar o evento automático do hábito', data: createErrorResult?.message })
  }

  await upsertHabitEventLink(supabase, userId, habitId, String(createdEvent.id), latestLinkedEvent?.linkId ?? null)
}

export async function archiveHabitLinkedEvent(
  supabase: SupabaseClient,
  userId: string,
  habitId: string
): Promise<void> {
  const linkedEvents = await getLinkedHabitEvents(supabase, userId, habitId)
  const activeEvent = linkedEvents.find(item => !item.archivedAt)

  if (!activeEvent) return

  await archiveEventById(supabase, userId, activeEvent.eventId)
}
