import type { getSupabaseAdminClient } from './supabase'

export function mapAvailabilityRule(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time
  }
}

export function mapSchedulingQuestion(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    label: row.label,
    type: row.type,
    isRequired: Boolean(row.is_required),
    isHidden: Boolean(row.is_hidden),
    options: row.options ?? null,
    sortOrder: row.sort_order ?? 0
  }
}

export function mapSchedulingPage(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    userId: row.user_id,
    calendarId: row.calendar_id,
    title: row.title,
    description: row.description ?? null,
    durationMinutes: row.duration_minutes,
    locationType: row.location_type,
    locationDetails: row.location_details ?? null,
    timezone: row.timezone,
    color: row.color ?? null,
    bufferBeforeMinutes: row.buffer_before_minutes ?? 0,
    bufferAfterMinutes: row.buffer_after_minutes ?? 0,
    slotIncrementMinutes: row.slot_increment_minutes ?? 15,
    minNoticeHours: row.min_notice_hours ?? 4,
    maxAdvanceDays: row.max_advance_days ?? 60,
    maxBookingsPerDay: row.max_bookings_per_day ?? null,
    calendarEventTitleTemplate: row.calendar_event_title_template ?? null,
    cancellationEnabled: row.cancellation_enabled ?? true,
    rescheduleEnabled: row.reschedule_enabled ?? true,
    cancellationMinNoticeHours: row.cancellation_min_notice_hours ?? null,
    cancellationReasonRequired: Boolean(row.cancellation_reason_required),
    hideDetailsOnManagePage: Boolean(row.hide_details_on_manage_page),
    requiresConfirmation: Boolean(row.requires_confirmation),
    shareToken: row.share_token,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at ?? null,
    availabilityRules: Array.isArray(row.availabilityRules)
      ? (row.availabilityRules as Record<string, unknown>[]).map(mapAvailabilityRule)
      : undefined,
    questions: Array.isArray(row.questions)
      ? (row.questions as Record<string, unknown>[]).map(mapSchedulingQuestion)
      : undefined,
    bookingsCount: typeof row.bookingsCount === 'number' ? row.bookingsCount : undefined
  }
}

export function mapBooking(row: Record<string, unknown>): Record<string, unknown> {
  // `event` is present when the caller joined `bookings` against `events`
  // (server/api/appointments/scheduling-pages/[id]/bookings.get.ts) to expose
  // the real appointment time — Supabase returns a single related row as an
  // object, but as an array when the relationship is ambiguous, so handle both.
  const eventRaw = row.event as Record<string, unknown> | Record<string, unknown>[] | null | undefined
  const eventRow = Array.isArray(eventRaw) ? eventRaw[0] : eventRaw

  return {
    id: row.id,
    schedulingPageId: row.scheduling_page_id,
    eventId: row.event_id,
    guestName: row.guest_name,
    guestEmail: row.guest_email,
    guestTimezone: row.guest_timezone,
    answers: row.answers ?? {},
    status: row.status,
    manageToken: row.manage_token,
    cancellationReason: row.cancellation_reason ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    cancelledAt: row.cancelled_at ?? null,
    startAt: eventRow?.start_at ?? null,
    endAt: eventRow?.end_at ?? null
  }
}

/**
 * Archives the calendar event behind a booking (same snapshot-then-archive
 * dance as POST /api/appointments/events/[id]/archive) — shared by the
 * guest-facing cancel (manage/[manageToken]/cancel.post.ts) and the
 * host-facing cancel/decline (scheduling-pages/[id]/bookings/[bookingId]/cancel.post.ts)
 * so the two paths can't silently drift apart.
 */
export async function archiveBookingEvent(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  eventId: string,
  changedBy: string
): Promise<void> {
  const { data: current } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .is('archived_at', null)
    .maybeSingle()

  if (!current) return

  await supabase.from('event_history').insert({
    event_id: current.id,
    changed_by: changedBy,
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
