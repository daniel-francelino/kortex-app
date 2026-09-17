import type { SupabaseClient } from '@supabase/supabase-js'
import { createEventInternal } from './appointments-events'
import { computeAvailableSlots, type SchedulingPageForAvailability } from './schedule-availability'
import { mapBooking, mapSchedulingQuestion } from './scheduling'
import { createShareToken } from './share-token'
import { getTimeZoneParts } from './timezone'

/**
 * Shared business logic behind every public entry point into a scheduling
 * page — today that's the opaque-token routes (`/api/schedule/[token]/*`)
 * and the username+slug routes (`/api/profile/[username]/[slug]/*`). Both
 * only differ in *how the `scheduling_pages` row gets resolved*; everything
 * after that (building the public payload, computing availability, revalidating
 * and creating a booking) has to stay in exactly one place — see
 * docs/appointments/PLANO_USERNAME_PERFIL_PUBLICO.md §7.2 for why duplicating
 * it was rejected (it's exactly the kind of logic the timezone audit in
 * AUDITORIA_TIMEZONE_CAPA_AGENDAMENTO.md had to fix once already).
 */

export interface BookingInput {
  startAt: string
  guestName: string
  guestEmail: string
  guestTimezone: string
  answers?: Record<string, string>
}

function assertPageBookable(page: Record<string, unknown> | null): asserts page is Record<string, unknown> {
  if (!page || !page.is_active || page.archived_at) {
    throw createError({ statusCode: 404, statusMessage: 'Página de agendamento não encontrada' })
  }
}

export async function requireActiveSchedulingPageByToken(
  supabase: SupabaseClient,
  token: string
): Promise<Record<string, unknown>> {
  const { data: page } = await supabase
    .from('scheduling_pages')
    .select('*')
    .eq('share_token', token)
    .maybeSingle()

  assertPageBookable(page)
  return page
}

export async function requireActiveSchedulingPageByUsernameSlug(
  supabase: SupabaseClient,
  username: string,
  slug: string
): Promise<Record<string, unknown>> {
  const { data: pref } = await supabase
    .from('user_preferences')
    .select('user_id')
    .eq('username', username)
    .maybeSingle()

  if (!pref) {
    throw createError({ statusCode: 404, statusMessage: 'Página de agendamento não encontrada' })
  }

  const { data: page } = await supabase
    .from('scheduling_pages')
    .select('*')
    .eq('user_id', pref.user_id as string)
    .eq('slug', slug)
    .maybeSingle()

  assertPageBookable(page)
  return page
}

export async function buildPublicSchedulingPagePayload(
  supabase: SupabaseClient,
  page: Record<string, unknown>
) {
  const { data: questionsData } = await supabase
    .from('scheduling_questions')
    .select('*')
    .eq('scheduling_page_id', page.id as string)
    .eq('is_hidden', false)
    .order('sort_order', { ascending: true })

  const { data: hostData } = await supabase.auth.admin.getUserById(page.user_id as string)
  const hostMeta = (hostData?.user?.user_metadata ?? {}) as Record<string, unknown>
  const hostName = (hostMeta.name as string | undefined) || hostData?.user?.email || 'Anfitrião'
  const hostAvatarUrl = (hostMeta.avatar_url as string | undefined) || null

  return {
    title: page.title,
    description: page.description ?? null,
    durationMinutes: page.duration_minutes,
    locationType: page.location_type,
    locationDetails: page.location_details ?? null,
    coverImageUrl: page.cover_image_url ?? null,
    hostName,
    hostAvatarUrl,
    maxAdvanceDays: page.max_advance_days,
    requiresConfirmation: Boolean(page.requires_confirmation),
    questions: (questionsData ?? []).map(row => mapSchedulingQuestion(row as Record<string, unknown>))
  }
}

async function getAvailabilityRules(supabase: SupabaseClient, pageId: string) {
  const { data: rulesData } = await supabase
    .from('scheduling_availability_rules')
    .select('day_of_week, start_time, end_time')
    .eq('scheduling_page_id', pageId)

  return (rulesData ?? []).map((r: Record<string, unknown>) => ({
    dayOfWeek: r.day_of_week as number,
    startTime: r.start_time as string,
    endTime: r.end_time as string
  }))
}

function toAvailabilityInput(page: Record<string, unknown>): SchedulingPageForAvailability {
  return {
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
  }
}

export async function listAvailableSlots(
  supabase: SupabaseClient,
  page: Record<string, unknown>,
  from: string,
  to: string
) {
  const rules = await getAvailabilityRules(supabase, page.id as string)
  const slots = await computeAvailableSlots(supabase, toAvailabilityInput(page), rules, from, to)
  return slots.map(s => ({ startAt: s.start.toISOString(), endAt: s.end.toISOString() }))
}

export async function bookSlotForPage(
  supabase: SupabaseClient,
  page: Record<string, unknown>,
  payload: BookingInput
) {
  const rules = await getAvailabilityRules(supabase, page.id as string)

  // Revalidate this exact slot is still free — narrow re-check of the same
  // algorithm the guest's UI used to display availability in the first place,
  // scoped to just the requested day, to close (not fully eliminate — see
  // docs/appointments/PLANO_LINK_AGENDAMENTO.md section 6) the race window
  // between the guest loading the page and clicking "Confirmar". Day-string
  // derived in the page's own timezone, not UTC — see AUDITORIA_TIMEZONE_
  // CAPA_AGENDAMENTO.md §1.3 achado 1 for why that distinction matters.
  const requestedStart = new Date(payload.startAt)
  const requestedStartParts = getTimeZoneParts(requestedStart, page.timezone as string)
  const dayStr = `${requestedStartParts.year}-${String(requestedStartParts.month).padStart(2, '0')}-${String(requestedStartParts.day).padStart(2, '0')}`
  const slotsForDay = await computeAvailableSlots(supabase, toAvailabilityInput(page), rules, dayStr, dayStr)

  const stillFree = slotsForDay.some(s => s.start.getTime() === requestedStart.getTime())
  if (!stillFree) {
    throw createError({ statusCode: 409, statusMessage: 'Esse horário acabou de ser reservado por outra pessoa. Escolha outro horário.' })
  }

  const endAt = new Date(requestedStart.getTime() + (page.duration_minutes as number) * 60000).toISOString()

  const titleTemplate = (page.calendar_event_title_template as string | null) || '{titulo} com {convidado}'
  const eventTitle = titleTemplate
    .replaceAll('{titulo}', page.title as string)
    .replaceAll('{convidado}', payload.guestName)
    .replaceAll('{email}', payload.guestEmail)

  const newEvent = await createEventInternal(supabase, page.user_id as string, {
    calendarId: page.calendar_id as string,
    title: eventTitle,
    location: page.location_details as string | null,
    startAt: payload.startAt,
    endAt,
    eventTimezone: page.timezone as string,
    allDay: false
  })

  // The event above is created either way — it already blocks the slot for
  // everyone else. `requires_confirmation` only affects whether the booking
  // itself starts as 'pending' (awaiting host approval) or 'confirmed'; see
  // docs/appointments/AUDITORIA_LINK_AGENDAMENTO_UX.md §3.3.
  const initialStatus = page.requires_confirmation ? 'pending' : 'confirmed'

  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .insert({
      scheduling_page_id: page.id,
      event_id: newEvent.id,
      guest_name: payload.guestName,
      guest_email: payload.guestEmail,
      guest_timezone: payload.guestTimezone,
      answers: payload.answers ?? {},
      manage_token: createShareToken(),
      status: initialStatus
    })
    .select('*')
    .single()

  if (bookingError || !booking) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao criar reserva', data: bookingError?.message })
  }

  return {
    booking: mapBooking(booking as Record<string, unknown>),
    manageUrl: `/agendar/gerenciar/${booking.manage_token as string}`
  }
}
