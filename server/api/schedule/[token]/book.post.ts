import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { createShareToken } from '../../../utils/share-token'
import { createEventInternal } from '../../../utils/appointments-events'
import { computeAvailableSlots } from '../../../utils/schedule-availability'
import { mapBooking } from '../../../utils/scheduling'

const bodySchema = z.object({
  startAt: z.string().datetime(),
  guestName: z.string().min(1).max(200),
  guestEmail: z.string().email().max(320),
  guestTimezone: z.string().min(1).max(100),
  answers: z.record(z.string(), z.string()).optional()
})

export default eventHandler(async (event) => {
  const token = z.string().min(1).parse(getRouterParam(event, 'token'))
  const body = await readBody(event)
  const payload = bodySchema.parse(body)
  const supabase = getSupabaseAdminClient()

  const { data: page } = await supabase
    .from('scheduling_pages')
    .select('*')
    .eq('share_token', token)
    .maybeSingle()

  if (!page || !page.is_active || page.archived_at) {
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

  // Revalidate this exact slot is still free — narrow re-check of the same
  // algorithm the guest's UI used to display availability in the first place,
  // scoped to just the requested day, to close (not fully eliminate — see
  // docs/appointments/PLANO_LINK_AGENDAMENTO.md section 6) the race window
  // between the guest loading the page and clicking "Confirmar".
  const requestedStart = new Date(payload.startAt)
  const dayStr = requestedStart.toISOString().split('T')[0]!
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

  const stillFree = slotsForDay.some(s => s.start.getTime() === requestedStart.getTime())
  if (!stillFree) {
    throw createError({ statusCode: 409, statusMessage: 'Esse horário acabou de ser reservado por outra pessoa. Escolha outro horário.' })
  }

  const endAt = new Date(requestedStart.getTime() + (page.duration_minutes as number) * 60000).toISOString()

  const newEvent = await createEventInternal(supabase, page.user_id as string, {
    calendarId: page.calendar_id as string,
    title: `${page.title as string} com ${payload.guestName}`,
    location: page.location_details as string | null,
    startAt: payload.startAt,
    endAt,
    eventTimezone: page.timezone as string,
    allDay: false
  })

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      scheduling_page_id: page.id,
      event_id: newEvent.id,
      guest_name: payload.guestName,
      guest_email: payload.guestEmail,
      guest_timezone: payload.guestTimezone,
      answers: payload.answers ?? {},
      manage_token: createShareToken()
    })
    .select('*')
    .single()

  if (bookingError || !booking) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao criar reserva', data: bookingError?.message })
  }

  setResponseStatus(event, 201)
  return {
    booking: mapBooking(booking as Record<string, unknown>),
    manageUrl: `/agendar/gerenciar/${booking.manage_token as string}`
  }
})
