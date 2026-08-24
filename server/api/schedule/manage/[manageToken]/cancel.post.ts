import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../utils/supabase'
import { mapBooking } from '../../../../utils/scheduling'

const paramsSchema = z.object({
  manageToken: z.string().min(1)
})

const bodySchema = z.object({
  reason: z.string().max(1000).optional()
})

export default eventHandler(async (event) => {
  const { manageToken } = paramsSchema.parse(getRouterParams(event))
  const body = await readBody(event).catch(() => ({}))
  const payload = bodySchema.parse(body ?? {})
  const supabase = getSupabaseAdminClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, page:scheduling_pages(user_id, cancellation_enabled, cancellation_min_notice_hours, cancellation_reason_required), event:events(start_at)')
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

  if (pageRow?.cancellation_enabled === false) {
    throw createError({ statusCode: 403, statusMessage: 'O cancelamento está desabilitado para este tipo de reserva.' })
  }

  if (pageRow?.cancellation_reason_required && !payload.reason?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Informe um motivo para cancelar.' })
  }

  const minNoticeHours = pageRow?.cancellation_min_notice_hours as number | null
  const eventRaw = booking.event as Record<string, unknown> | Record<string, unknown>[] | null
  const eventStartAt = (Array.isArray(eventRaw) ? eventRaw[0] : eventRaw)?.start_at as string | undefined
  if (minNoticeHours && eventStartAt) {
    const hoursUntilStart = (new Date(eventStartAt).getTime() - Date.now()) / 3600000
    if (hoursUntilStart < minNoticeHours) {
      throw createError({ statusCode: 403, statusMessage: `Cancelamentos exigem ao menos ${minNoticeHours}h de antecedência.` })
    }
  }

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
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancellation_reason: payload.reason?.trim() || null,
      updated_at: new Date().toISOString()
    })
    .eq('id', booking.id)
    .select('*')
    .single()

  if (error || !updated) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao cancelar reserva', data: error?.message })
  }

  return mapBooking(updated as Record<string, unknown>)
})
