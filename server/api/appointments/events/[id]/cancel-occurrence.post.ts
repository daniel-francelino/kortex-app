import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../utils/supabase'
import { requireAuthUser } from '../../../../utils/require-auth'
import { resolveCalendarForWrite } from '../../../../utils/calendar-access'
import { parseOrThrow } from '../../../../utils/validation'

const bodySchema = z.object({
  recurrenceId: z.string().min(1)
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID do evento é obrigatório' })
  }

  const body = await readBody(event)
  const payload = parseOrThrow(bodySchema, body)

  const supabase = getSupabaseAdminClient()

  // Verify event access and that it's recurring
  const { data: eventData, error: eventError } = await supabase
    .from('events')
    .select('id, rrule, calendar_id')
    .eq('id', id)
    .single()

  if (eventError || !eventData) {
    throw createError({ statusCode: 404, statusMessage: 'Evento não encontrado' })
  }

  const evtObj = eventData as Record<string, unknown>

  // Same access rule as the plain PATCH (events/[id].patch.ts): owner or an
  // accepted edit-permission collaborator — this endpoint used to check only
  // `owner_user_id`, so a shared-calendar collaborator could edit the whole
  // series via PATCH but got a 404 trying to cancel a single occurrence.
  const access = await resolveCalendarForWrite(supabase, evtObj.calendar_id as string, user.id)
  if (!access) {
    throw createError({ statusCode: 404, statusMessage: 'Evento não encontrado' })
  }

  if (!evtObj.rrule) {
    throw createError({ statusCode: 400, statusMessage: 'Este evento não é recorrente' })
  }

  // Create cancelled exception
  const { data, error } = await supabase
    .from('event_exceptions')
    .upsert(
      {
        event_id: id,
        type: 'cancelled',
        recurrence_id: payload.recurrenceId
      },
      { onConflict: 'event_id,recurrence_id' }
    )
    .select()
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return data
})
