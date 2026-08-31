import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../utils/supabase'
import { requireAuthUser } from '../../../../utils/require-auth'
import { resolveCalendarForWrite } from '../../../../utils/calendar-access'
import { parseOrThrow } from '../../../../utils/validation'

const bodySchema = z.object({
  recurrenceId: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  location: z.string().max(500).nullable().optional(),
  startAt: z.string().datetime({ offset: true }).optional(),
  endAt: z.string().datetime({ offset: true }).optional()
})

/**
 * Edits a single occurrence of a recurring event ("this event only" scope) —
 * upserts an event_exceptions row with type='modified' and the overridden
 * fields. The read path (events.get.ts) already merges these overrides onto
 * the expanded occurrence; this is the write side that was missing.
 */
export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID do evento é obrigatório' })
  }

  const body = await readBody(event)
  const payload = parseOrThrow(bodySchema, body)

  const supabase = getSupabaseAdminClient()

  const { data: eventData, error: eventError } = await supabase
    .from('events')
    .select('id, rrule, calendar_id')
    .eq('id', id)
    .single()

  if (eventError || !eventData) {
    throw createError({ statusCode: 404, statusMessage: 'Evento não encontrado' })
  }

  // Same access rule as the plain PATCH (events/[id].patch.ts): owner or an
  // accepted edit-permission collaborator — this endpoint used to check only
  // `owner_user_id`, so a shared-calendar collaborator could edit the whole
  // series via PATCH but got a 404 trying to edit a single occurrence.
  const access = await resolveCalendarForWrite(supabase, (eventData as Record<string, unknown>).calendar_id as string, user.id)
  if (!access) {
    throw createError({ statusCode: 404, statusMessage: 'Evento não encontrado' })
  }

  if (!(eventData as Record<string, unknown>).rrule) {
    throw createError({ statusCode: 400, statusMessage: 'Este evento não é recorrente' })
  }

  const { data, error } = await supabase
    .from('event_exceptions')
    .upsert(
      {
        event_id: id,
        type: 'modified',
        recurrence_id: payload.recurrenceId,
        override_title: payload.title ?? null,
        override_description: payload.description ?? null,
        override_location: payload.location ?? null,
        override_start_at: payload.startAt ?? null,
        override_end_at: payload.endAt ?? null,
        updated_at: new Date().toISOString()
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
