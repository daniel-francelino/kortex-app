import type { SupabaseClient } from '@supabase/supabase-js'

export interface CreateEventInternalPayload {
  calendarId: string
  title: string
  description?: string | null
  location?: string | null
  startAt: string
  endAt: string
  eventTimezone: string
  allDay?: boolean
  rrule?: string | null
  reminders?: Array<{ type: 'popup' | 'email' | 'push', minutesBefore: number }>
}

/**
 * Core "create an event" logic, extracted out of server/api/appointments/events.post.ts
 * so the public booking flow (server/api/schedule/[token]/book.post.ts) can create a
 * real event without going through an authenticated HTTP round-trip — same
 * ownership/validation guarantees, just called as a function instead of a route.
 * Does NOT re-validate calendar ownership — callers that don't already know the
 * calendar belongs to ownerUserId must check that themselves first.
 */
export async function createEventInternal(
  supabase: SupabaseClient,
  ownerUserId: string,
  payload: CreateEventInternalPayload
): Promise<Record<string, unknown>> {
  if (new Date(payload.endAt) <= new Date(payload.startAt)) {
    throw createError({ statusCode: 400, statusMessage: 'A data de término deve ser posterior à data de início' })
  }

  const { data: newEvent, error: eventError } = await supabase
    .from('events')
    .insert({
      calendar_id: payload.calendarId,
      owner_user_id: ownerUserId,
      title: payload.title,
      description: payload.description ?? null,
      location: payload.location ?? null,
      start_at: payload.startAt,
      end_at: payload.endAt,
      event_timezone: payload.eventTimezone,
      all_day: payload.allDay ?? false,
      rrule: payload.rrule ?? null
    })
    .select()
    .single()

  if (eventError || !newEvent) {
    throw createError({ statusCode: 500, statusMessage: eventError?.message ?? 'Erro ao criar evento' })
  }

  const eventObj = newEvent as Record<string, unknown>

  if (payload.reminders && payload.reminders.length > 0) {
    const reminderRows = payload.reminders.map(r => ({
      event_id: eventObj.id as string,
      user_id: ownerUserId,
      type: r.type,
      minutes_before: r.minutesBefore
    }))

    await supabase.from('event_reminders').insert(reminderRows)
  }

  return eventObj
}
