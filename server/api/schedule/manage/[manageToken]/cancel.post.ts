import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../utils/supabase'
import { mapBooking } from '../../../../utils/scheduling'

const paramsSchema = z.object({
  manageToken: z.string().min(1)
})

export default eventHandler(async (event) => {
  const { manageToken } = paramsSchema.parse(getRouterParams(event))
  const supabase = getSupabaseAdminClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, page:scheduling_pages(user_id)')
    .eq('manage_token', manageToken)
    .maybeSingle()

  if (!booking) {
    throw createError({ statusCode: 404, statusMessage: 'Reserva não encontrada' })
  }

  if (booking.status === 'cancelled') {
    return mapBooking(booking as Record<string, unknown>)
  }

  const pageRaw = booking.page as Record<string, unknown> | Record<string, unknown>[] | null
  const pageRow = Array.isArray(pageRaw) ? pageRaw[0] : pageRaw
  const hostUserId = pageRow?.user_id as string | undefined

  const { data: current } = await supabase
    .from('events')
    .select('*')
    .eq('id', booking.event_id)
    .is('archived_at', null)
    .maybeSingle()

  if (current && hostUserId) {
    await supabase.from('event_history').insert({
      event_id: current.id,
      changed_by: hostUserId,
      title: current.title,
      description: current.description,
      location: current.location,
      start_at: current.start_at,
      end_at: current.end_at,
      event_timezone: current.event_timezone,
      all_day: current.all_day,
      rrule: current.rrule,
      calendar_id: current.calendar_id,
      change_type: 'archive'
    })

    await supabase
      .from('events')
      .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', current.id)
  }

  const { data: updated, error } = await supabase
    .from('bookings')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', booking.id)
    .select('*')
    .single()

  if (error || !updated) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao cancelar reserva', data: error?.message })
  }

  return mapBooking(updated as Record<string, unknown>)
})
