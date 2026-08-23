import { getSupabaseAdminClient } from '../../../../utils/supabase'
import { requireAuthUser } from '../../../../utils/require-auth'
import { buildIcsCalendar, type IcsEventRow, type IcsExceptionRow } from '../../../../utils/ics'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID do calendário é obrigatório' })
  }

  const supabase = getSupabaseAdminClient()

  const { data: calendar } = await supabase
    .from('calendars')
    .select('id, name')
    .eq('id', id)
    .eq('owner_user_id', user.id)
    .single()

  if (!calendar) {
    throw createError({ statusCode: 404, statusMessage: 'Calendário não encontrado' })
  }

  const { data: events } = await supabase
    .from('events')
    .select('id, title, description, location, start_at, end_at, all_day, rrule, exdate, updated_at')
    .eq('calendar_id', id)
    .is('archived_at', null)

  const eventIds = (events ?? []).map((e: Record<string, unknown>) => e.id as string)

  let exceptions: Record<string, unknown>[] = []
  if (eventIds.length > 0) {
    const { data: exData } = await supabase
      .from('event_exceptions')
      .select('event_id, type, recurrence_id, override_title, override_description, override_location, override_start_at, override_end_at')
      .in('event_id', eventIds)

    exceptions = exData ?? []
  }

  const ics = buildIcsCalendar(
    calendar.name,
    (events ?? []) as unknown as IcsEventRow[],
    exceptions as unknown as IcsExceptionRow[]
  )

  setHeader(event, 'Content-Type', 'text/calendar; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="${calendar.name.replace(/[^\w.-]+/g, '_')}.ics"`)

  return ics
})
