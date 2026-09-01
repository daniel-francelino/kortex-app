import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../../../utils/supabase'
import { requireAuthUser } from '../../../../../../utils/require-auth'
import { mapBooking } from '../../../../../../utils/scheduling'
import { parseOrThrow } from '../../../../../../utils/validation'

const paramsSchema = z.object({
  id: z.string().uuid(),
  bookingId: z.string().uuid()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const { id, bookingId } = parseOrThrow(paramsSchema, getRouterParams(event))
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
    .select('id, status')
    .eq('id', bookingId)
    .eq('scheduling_page_id', id)
    .maybeSingle()

  if (!booking) {
    throw createError({ statusCode: 404, statusMessage: 'Reserva não encontrada' })
  }

  if (booking.status !== 'pending') {
    throw createError({ statusCode: 409, statusMessage: 'Essa reserva não está aguardando confirmação.' })
  }

  const { data: updated, error } = await supabase
    .from('bookings')
    .update({ status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('id', bookingId)
    .select('*, event:events(start_at, end_at)')
    .single()

  if (error || !updated) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao aprovar reserva', data: error?.message })
  }

  return mapBooking(updated as Record<string, unknown>)
})
