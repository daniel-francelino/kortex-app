import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../utils/supabase'
import { computeAvailableSlots } from '../../../../utils/schedule-availability'
import { mapBooking } from '../../../../utils/scheduling'

const paramsSchema = z.object({
  manageToken: z.string().min(1)
})

const bodySchema = z.object({
  newStartAt: z.string().datetime()
})

export default eventHandler(async (event) => {
  const { manageToken } = paramsSchema.parse(getRouterParams(event))
  const body = await readBody(event)
  const payload = bodySchema.parse(body)
  const supabase = getSupabaseAdminClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select('*, page:scheduling_pages(*)')
    .eq('manage_token', manageToken)
    .maybeSingle()

  if (!booking || booking.status === 'cancelled') {
    throw createError({ statusCode: 404, statusMessage: 'Reserva não encontrada' })
  }

  const pageRaw = booking.page as Record<string, unknown> | Record<string, unknown>[] | null
  const page = Array.isArray(pageRaw) ? pageRaw[0] : pageRaw

  if (!page) {
    throw createError({ statusCode: 404, statusMessage: 'Página de agendamento não encontrada' })
  }

  const { data: rulesData } = await supabase
    .from('scheduling_availability_rules')
    .select('day_of_week, start_time, end_time')
    .eq('scheduling_page_id', page.id)

  const rules = (rulesData ?? []).map((r: Record<string, unknown>) => ({
    dayOfWeek: r.day_of_week as number,
    startTime: r.start_time as string,
    endTime: r.end_time as string
  }))

  const newStart = new Date(payload.newStartAt)
  const dayStr = newStart.toISOString().split('T')[0]!

  const slotsForDay = await computeAvailableSlots(
    supabase,
    {
      id: page.id as string,
      userId: page.user_id as string,
      timezone: page.timezone as string,
      durationMinutes: page.duration_minutes as number,
      bufferBeforeMinutes: page.buffer_before_minutes as number,
      bufferAfterMinutes: page.buffer_after_minutes as number,
      slotIncrementMinutes: page.slot_increment_minutes as number,
      minNoticeHours: page.min_notice_hours as number,
      maxAdvanceDays: page.max_advance_days as number,
      maxBookingsPerDay: (page.max_bookings_per_day as number | null) ?? null
    },
    rules,
    dayStr,
    dayStr
  )

  const stillFree = slotsForDay.some(s => s.start.getTime() === newStart.getTime())
  if (!stillFree) {
    throw createError({ statusCode: 409, statusMessage: 'Esse horário não está disponível. Escolha outro.' })
  }

  const newEnd = new Date(newStart.getTime() + (page.duration_minutes as number) * 60000).toISOString()

  const { data: current } = await supabase
    .from('events')
    .select('*')
    .eq('id', booking.event_id)
    .single()

  if (current) {
    await supabase.from('event_history').insert({
      event_id: current.id,
      changed_by: page.user_id,
      title: current.title,
      description: current.description,
      location: current.location,
      start_at: current.start_at,
      end_at: current.end_at,
      event_timezone: current.event_timezone,
      all_day: current.all_day,
      rrule: current.rrule,
      calendar_id: current.calendar_id,
      change_type: 'update'
    })
  }

  const { error: eventError } = await supabase
    .from('events')
    .update({ start_at: payload.newStartAt, end_at: newEnd, updated_at: new Date().toISOString() })
    .eq('id', booking.event_id)

  if (eventError) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao reagendar evento', data: eventError.message })
  }

  const { data: updatedBooking, error: bookingError } = await supabase
    .from('bookings')
    .update({ status: 'confirmed', updated_at: new Date().toISOString() })
    .eq('id', booking.id)
    .select('*')
    .single()

  if (bookingError || !updatedBooking) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao atualizar reserva', data: bookingError?.message })
  }

  return mapBooking(updatedBooking as Record<string, unknown>)
})
