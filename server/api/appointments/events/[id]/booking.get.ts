import { getSupabaseAdminClient } from '../../../../utils/supabase'
import { requireAuthUser } from '../../../../utils/require-auth'

/**
 * Surfaces the scheduling-link booking behind a calendar event, if any — the
 * gap flagged in docs/appointments/AUDITORIA_LINK_AGENDAMENTO_UX.md §1.3
 * item 1: a guest's form answers were only ever visible in
 * /app/scheduling-bookings/[id], never from the Agenda itself, even though
 * the Agenda is exactly where a host is already looking at the meeting.
 *
 * Deliberately owner-only (not the broader "owner OR shared-calendar viewer
 * OR invited participant" access `events/[id].get.ts` allows) — guest email
 * and free-text answers are more sensitive than an event's title/location,
 * and only the scheduling page's owner configured that form in the first
 * place.
 */
export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID do evento é obrigatório' })
  }

  const supabase = getSupabaseAdminClient()

  const { data: booking } = await supabase
    .from('bookings')
    .select(`
      id, guest_name, guest_email, status, answers, scheduling_page_id,
      page:scheduling_pages(
        id, user_id, title,
        questions:scheduling_questions(id, label, sort_order)
      )
    `)
    .eq('event_id', id)
    .maybeSingle()

  if (!booking) return null

  const pageRaw = booking.page as Record<string, unknown> | Record<string, unknown>[] | null
  const page = Array.isArray(pageRaw) ? pageRaw[0] : pageRaw

  // No scheduling page (shouldn't happen — FK is NOT NULL) or a page owned by
  // someone else (shouldn't happen either, since the event itself belongs to
  // this user's calendar) — either way, nothing to show.
  if (!page || page.user_id !== user.id) return null

  const questions = ((page.questions as Record<string, unknown>[] | null) ?? [])
    .slice()
    .sort((a, b) => (a.sort_order as number) - (b.sort_order as number))

  const answersRaw = (booking.answers as Record<string, string>) ?? {}
  const answers = questions.map(q => ({
    label: q.label as string,
    value: answersRaw[q.id as string]?.trim() || '—'
  }))

  return {
    bookingId: booking.id,
    guestName: booking.guest_name,
    guestEmail: booking.guest_email,
    status: booking.status,
    schedulingPageId: page.id,
    schedulingPageTitle: page.title,
    answers
  }
})
