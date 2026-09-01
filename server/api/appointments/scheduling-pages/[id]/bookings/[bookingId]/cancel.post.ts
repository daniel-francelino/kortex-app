import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../../../utils/supabase'
import { requireAuthUser } from '../../../../../../utils/require-auth'
import { mapBooking, archiveBookingEvent } from '../../../../../../utils/scheduling'
import { parseOrThrow } from '../../../../../../utils/validation'

const paramsSchema = z.object({
  id: z.string().uuid(),
  bookingId: z.string().uuid()
})

const bodySchema = z.object({
  reason: z.string().max(1000).optional()
})

/**
 * Host-initiated cancel — unlike manage/[manageToken]/cancel.post.ts (the
 * guest-facing one), this never checks `cancellationEnabled`/notice-window
 * policies: those exist to constrain the guest, not the host. Doubles as
 * "decline" for a pending booking (docs/appointments/AUDITORIA_LINK_AGENDAMENTO_UX.md §3.3)
 * — declining just means cancelling before it was ever approved.
 */
export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const { id, bookingId } = parseOrThrow(paramsSchema, getRouterParams(event))
  const body = await readBody(event).catch(() => ({}))
  const payload = parseOrThrow(bodySchema, body ?? {})
  const supabase = getSupabaseAdminClient()

  const { data: page } = await supabase
    .from('scheduling_pages')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!page) {
    throw createError({ statusCode: 404, statusMessage: 'Página de agendamento não encontrada' })
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, event_id, status')
    .eq('id', bookingId)
    .eq('scheduling_page_id', id)
    .maybeSingle()

  if (!booking) {
    throw createError({ statusCode: 404, statusMessage: 'Reserva não encontrada' })
  }

  if (booking.status === 'cancelled') {
    return mapBooking(booking as Record<string, unknown>)
  }

  await archiveBookingEvent(supabase, booking.event_id as string, user.id)

  const { data: updated, error } = await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: payload.reason?.trim() || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', bookingId)
    .select('*, event:events(start_at, end_at)')
    .single()

  if (error || !updated) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao cancelar reserva', data: error?.message })
  }

  return mapBooking(updated as Record<string, unknown>)
})
