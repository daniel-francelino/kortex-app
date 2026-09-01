/**
 * Materializes a goal task's due date as an all-day calendar event, same
 * philosophy as server/utils/habit-event-sync.ts for habits — a task is
 * simpler (no recurrence, no scheduled time-of-day), so this is a smaller,
 * dedicated version rather than trying to generalize the habit one.
 */

import { resolveUserTimezone } from './user-timezone'

const GOALS_CALENDAR_NAME = 'Metas'
const GOALS_CALENDAR_DESCRIPTION = 'Agendamentos gerados automaticamente a partir de tarefas de metas com data definida.'
const GOALS_CALENDAR_COLOR = '#8b5cf6'

type SupabaseClient = ReturnType<typeof import('./supabase').getSupabaseAdminClient>

interface LinkedTaskEvent {
  linkId: string | null
  eventId: string
  archivedAt: string | null
}

export interface GoalTaskForSync {
  id: string
  title: string
  description: string | null
  dueDate: string | null
  completed: boolean
}

async function getOrCreateGoalsCalendar(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data: existing, error: existingError } = await supabase
    .from('calendars')
    .select('id')
    .eq('owner_user_id', userId)
    .eq('name', GOALS_CALENDAR_NAME)
    .is('archived_at', null)
    .order('created_at', { ascending: true })
    .limit(1)

  if (existingError) {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível localizar o calendário de metas', data: existingError.message })
  }

  const existingId = existing?.[0]?.id as string | undefined
  if (existingId) return existingId

  const { data: created, error: createErrorResult } = await supabase
    .from('calendars')
    .insert({
      owner_user_id: userId,
      name: GOALS_CALENDAR_NAME,
      description: GOALS_CALENDAR_DESCRIPTION,
      color: GOALS_CALENDAR_COLOR,
      visibility: 'private'
    })
    .select('id')
    .single()

  if (createErrorResult || !created?.id) {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível criar o calendário de metas', data: createErrorResult?.message })
  }

  return created.id as string
}

async function getLinkedTaskEvents(supabase: SupabaseClient, userId: string, taskId: string): Promise<LinkedTaskEvent[]> {
  const { data: links, error: linksError } = await supabase
    .from('entity_links')
    .select('id, target_id')
    .eq('user_id', userId)
    .eq('source_type', 'goal_task')
    .eq('source_id', taskId)
    .eq('target_type', 'event')
    .order('created_at', { ascending: false })

  if (linksError) {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível carregar os vínculos da tarefa com eventos', data: linksError.message })
  }

  const eventIds = (links ?? []).map(link => String(link.target_id ?? '')).filter(Boolean)
  if (eventIds.length === 0) return []

  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('id, archived_at')
    .in('id', eventIds)
    .eq('owner_user_id', userId)

  if (eventsError) {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível carregar os eventos vinculados à tarefa', data: eventsError.message })
  }

  const eventMap = new Map(
    (events ?? []).map(event => [
      String(event.id),
      { eventId: String(event.id), archivedAt: (event.archived_at as string | null) ?? null }
    ])
  )

  const resolvedLinks: Array<LinkedTaskEvent | null> = (links ?? []).map((link) => {
    const event = eventMap.get(String(link.target_id ?? ''))
    if (!event) return null

    return { linkId: link.id ? String(link.id) : null, eventId: event.eventId, archivedAt: event.archivedAt }
  })

  return resolvedLinks.filter((item): item is LinkedTaskEvent => item !== null)
}

async function archiveEventById(supabase: SupabaseClient, userId: string, eventId: string): Promise<void> {
  const { error } = await supabase
    .from('events')
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('owner_user_id', userId)
    .is('archived_at', null)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível arquivar o evento vinculado à tarefa', data: error.message })
  }
}

async function updateEventById(supabase: SupabaseClient, userId: string, eventId: string, updateData: Record<string, unknown>): Promise<void> {
  const { error } = await supabase
    .from('events')
    .update({ ...updateData, updated_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('owner_user_id', userId)
    .is('archived_at', null)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível atualizar o evento vinculado à tarefa', data: error.message })
  }
}

async function upsertTaskEventLink(
  supabase: SupabaseClient,
  userId: string,
  taskId: string,
  eventId: string,
  existingLinkId: string | null
): Promise<void> {
  if (existingLinkId) {
    const { error } = await supabase
      .from('entity_links')
      .update({ target_id: eventId })
      .eq('id', existingLinkId)
      .eq('user_id', userId)

    if (error) {
      throw createError({ statusCode: 500, statusMessage: 'Não foi possível atualizar o vínculo entre tarefa e evento', data: error.message })
    }

    return
  }

  const { error } = await supabase
    .from('entity_links')
    .insert({
      user_id: userId,
      source_type: 'goal_task',
      source_id: taskId,
      target_type: 'event',
      target_id: eventId
    })

  if (error && error.code !== '23505') {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível criar o vínculo entre tarefa e evento', data: error.message })
  }
}

export async function syncGoalTaskLinkedEvent(
  supabase: SupabaseClient,
  userId: string,
  task: GoalTaskForSync
): Promise<void> {
  const linkedEvents = await getLinkedTaskEvents(supabase, userId, task.id)
  const activeEvent = linkedEvents.find(item => !item.archivedAt) ?? null
  const latestLinkedEvent = linkedEvents[0] ?? null

  if (!task.dueDate || task.completed) {
    if (activeEvent) {
      await archiveEventById(supabase, userId, activeEvent.eventId)
    }
    return
  }

  const calendarId = await getOrCreateGoalsCalendar(supabase, userId)
  // Regra 1 (docs/timezone/ANALISE_TIMEZONE.md): this runs server-side with
  // no request-scoped client timezone to read, so it resolves straight to
  // the user's stored fallback — was hardcoded 'UTC' before, same class of
  // bug as the Dashboard's hardcoded Fortaleza.
  const eventTimezone = await resolveUserTimezone(supabase, userId)
  const payload = {
    calendar_id: calendarId,
    title: task.title,
    description: task.description,
    location: null,
    start_at: `${task.dueDate}T00:00:00.000Z`,
    end_at: `${task.dueDate}T23:59:59.000Z`,
    event_timezone: eventTimezone,
    all_day: true,
    rrule: null
  }

  if (activeEvent) {
    await updateEventById(supabase, userId, activeEvent.eventId, payload)
    return
  }

  const { data: createdEvent, error: createErrorResult } = await supabase
    .from('events')
    .insert({ owner_user_id: userId, ...payload })
    .select('id')
    .single()

  if (createErrorResult || !createdEvent?.id) {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível criar o evento automático da tarefa', data: createErrorResult?.message })
  }

  await upsertTaskEventLink(supabase, userId, task.id, String(createdEvent.id), latestLinkedEvent?.linkId ?? null)
}

export async function archiveGoalTaskLinkedEvent(supabase: SupabaseClient, userId: string, taskId: string): Promise<void> {
  const linkedEvents = await getLinkedTaskEvents(supabase, userId, taskId)
  const activeEvent = linkedEvents.find(item => !item.archivedAt)

  if (!activeEvent) return

  await archiveEventById(supabase, userId, activeEvent.eventId)
}
