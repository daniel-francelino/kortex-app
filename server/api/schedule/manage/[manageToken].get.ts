import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'

const paramsSchema = z.object({
  manageToken: z.string().min(1)
})

export default eventHandler(async (event) => {
  const { manageToken } = paramsSchema.parse(getRouterParams(event))
  const supabase = getSupabaseAdminClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select(`
      *,
      page:scheduling_pages(
        title, user_id, location_type, location_details, share_token,
        cancellation_enabled, reschedule_enabled, cancellation_min_notice_hours,
        cancellation_reason_required, hide_details_on_manage_page
      ),
      event:events(start_at, end_at)
    `)
    .eq('manage_token', manageToken)
    .maybeSingle()

  if (!booking) {
    throw createError({ statusCode: 404, statusMessage: 'Reserva não encontrada' })
  }

  const pageRaw = booking.page as Record<string, unknown> | Record<string, unknown>[] | null
  const page = Array.isArray(pageRaw) ? pageRaw[0] : pageRaw
  const eventRaw = booking.event as Record<string, unknown> | Record<string, unknown>[] | null
  const eventRow = Array.isArray(eventRaw) ? eventRaw[0] : eventRaw

  const { data: hostData } = page?.user_id
    ? await supabase.auth.admin.getUserById(page.user_id as string)
    : { data: null }
  const hostMeta = (hostData?.user?.user_metadata ?? {}) as Record<string, unknown>
  const hostName = (hostMeta.name as string | undefined) || hostData?.user?.email || 'Anfitrião'

  return {
    guestName: booking.guest_name,
    guestEmail: booking.guest_email,
    guestTimezone: booking.guest_timezone,
    status: booking.status,
    startAt: eventRow?.start_at ?? null,
    endAt: eventRow?.end_at ?? null,
    pageTitle: page?.title ?? '',
    hostName,
    locationType: page?.location_type ?? 'video_link',
    locationDetails: page?.hide_details_on_manage_page ? null : (page?.location_details ?? null),
    schedulingPageToken: page?.share_token ?? '',
    cancellationEnabled: page?.cancellation_enabled ?? true,
    rescheduleEnabled: page?.reschedule_enabled ?? true,
    cancellationMinNoticeHours: page?.cancellation_min_notice_hours ?? null,
    cancellationReasonRequired: Boolean(page?.cancellation_reason_required),
    hideDetailsOnManagePage: Boolean(page?.hide_details_on_manage_page)
  }
})
