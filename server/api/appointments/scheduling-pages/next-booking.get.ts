import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'

/**
 * Dashboard widget support (docs/appointments/AUDITORIA_LINK_AGENDAMENTO_UX.md
 * §1.3, item 3) — the single soonest upcoming booking across every one of the
 * user's scheduling pages, or null. Deliberately its own tiny endpoint rather
 * than folded into GET /api/life/dashboard: that aggregate is about
 * habits/tasks/events/journal, scheduling pages are a different domain, and
 * this way a slow/failing query here can't take the whole dashboard down.
 */
export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const supabase = getSupabaseAdminClient()

  const { data: pages } = await supabase
    .from('scheduling_pages')
    .select('id, title')
    .eq('user_id', user.id)
    .is('archived_at', null)

  const pageIds = (pages ?? []).map(p => p.id as string)
  if (pageIds.length === 0) return null

  const titleByPage = new Map((pages ?? []).map(p => [p.id as string, p.title as string]))

  const { data: bookings } = await supabase
    .from('bookings')
    .select('id, guest_name, scheduling_page_id, status, event:events(start_at, end_at)')
    .in('scheduling_page_id', pageIds)
    .in('status', ['confirmed', 'pending'])

  const now = Date.now()
  let next: {
    bookingId: string
    schedulingPageId: string
    pageTitle: string
    guestName: string
    status: string
    startAt: string
    endAt: string
  } | null = null

  for (const row of (bookings ?? []) as Array<Record<string, unknown>>) {
    const eventRaw = row.event as Record<string, unknown> | Record<string, unknown>[] | null
    const eventRow = Array.isArray(eventRaw) ? eventRaw[0] : eventRaw
    const startAt = eventRow?.start_at as string | undefined
    const endAt = eventRow?.end_at as string | undefined
    if (!startAt || !endAt || new Date(startAt).getTime() < now) continue

    if (!next || new Date(startAt).getTime() < new Date(next.startAt).getTime()) {
      next = {
        bookingId: row.id as string,
        schedulingPageId: row.scheduling_page_id as string,
        pageTitle: titleByPage.get(row.scheduling_page_id as string) ?? '',
        guestName: row.guest_name as string,
        status: row.status as string,
        startAt,
        endAt
      }
    }
  }

  return next
})
