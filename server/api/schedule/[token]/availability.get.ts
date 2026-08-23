import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { computeAvailableSlots } from '../../../utils/schedule-availability'

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
})

export default eventHandler(async (event) => {
  const token = z.string().min(1).parse(getRouterParam(event, 'token'))
  const { from, to } = querySchema.parse(getQuery(event))
  const supabase = getSupabaseAdminClient()

  const { data: page } = await supabase
    .from('scheduling_pages')
    .select('id, user_id, timezone, duration_minutes, buffer_before_minutes, buffer_after_minutes, slot_increment_minutes, min_notice_hours, max_advance_days, max_bookings_per_day, is_active, archived_at')
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

  const slots = await computeAvailableSlots(
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
    from,
    to
  )

  return {
    slots: slots.map(s => ({ startAt: s.start.toISOString(), endAt: s.end.toISOString() }))
  }
})
