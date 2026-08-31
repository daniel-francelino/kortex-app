import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'
import { resolveCalendarForRead } from '../../../utils/calendar-access'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID do evento é obrigatório' })
  }

  const supabase = getSupabaseAdminClient()

  // Get event with calendar info — no owner filter here (unlike before):
  // an invited participant or a shared-calendar collaborator (even
  // view-only) needs to read this too. Access is verified below instead,
  // once we know the event's calendar_id.
  const { data: eventData, error: eventError } = await supabase
    .from('events')
    .select('*, calendars!inner(id, name, color)')
    .eq('id', id)
    .single()

  if (eventError || !eventData) {
    throw createError({ statusCode: 404, statusMessage: 'Evento não encontrado' })
  }

  const eventOwnerId = (eventData as Record<string, unknown>).owner_user_id as string
  const eventCalendarId = (eventData as Record<string, unknown>).calendar_id as string

  if (eventOwnerId !== user.id) {
    const [calendarAccess, participation] = await Promise.all([
      resolveCalendarForRead(supabase, eventCalendarId, user.id),
      supabase
        .from('event_participants')
        .select('id')
        .eq('event_id', id)
        .eq('invited_user_id', user.id)
        .maybeSingle()
    ])

    if (!calendarAccess && !participation.data) {
      throw createError({ statusCode: 404, statusMessage: 'Evento não encontrado' })
    }
  }

  // Get reminders
  const { data: reminders } = await supabase
    .from('event_reminders')
    .select('*')
    .eq('event_id', id)
    .eq('user_id', user.id)

  // Get exceptions (for recurring events)
  const evtObj = eventData as Record<string, unknown>
  let exceptions: Record<string, unknown>[] = []
  if (evtObj.rrule) {
    const { data: excData } = await supabase
      .from('event_exceptions')
      .select('*')
      .eq('event_id', id)

    exceptions = excData ?? []
  }

  const eventRecord = eventData as Record<string, unknown>

  return {
    ...eventRecord,
    reminders: reminders ?? [],
    exceptions
  }
})
