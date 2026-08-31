import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../utils/supabase'
import { requireAuthUser } from '../../../../utils/require-auth'
import { parseOrThrow } from '../../../../utils/validation'

const reminderSchema = z.object({
  type: z.enum(['popup', 'email', 'push']).default('popup'),
  minutesBefore: z.number().int().min(0).max(10080)
})

const bodySchema = z.object({
  reminders: z.array(reminderSchema).max(5)
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

  // Verify event ownership
  const { data: eventData, error: eventError } = await supabase
    .from('events')
    .select('id')
    .eq('id', id)
    .eq('owner_user_id', user.id)
    .single()

  if (eventError || !eventData) {
    throw createError({ statusCode: 404, statusMessage: 'Evento não encontrado' })
  }

  // Delete existing reminders for this user+event
  await supabase
    .from('event_reminders')
    .delete()
    .eq('event_id', id)
    .eq('user_id', user.id)

  // Insert new reminders
  if (payload.reminders.length > 0) {
    const reminderRows = payload.reminders.map(r => ({
      event_id: id,
      user_id: user.id,
      type: r.type,
      minutes_before: r.minutesBefore
    }))

    const { error } = await supabase
      .from('event_reminders')
      .insert(reminderRows)

    if (error) {
      throw createError({ statusCode: 500, statusMessage: error.message })
    }
  }

  // Return updated reminders
  const { data: reminders } = await supabase
    .from('event_reminders')
    .select('*')
    .eq('event_id', id)
    .eq('user_id', user.id)

  return reminders ?? []
})
