import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireCronSecret } from '../../utils/require-cron-secret'
import { createNotification } from '../../utils/notifications'
import { expandRecurrence } from '../../utils/recurrence'

/**
 * Scans `event_reminders` for reminders due in the next `windowMinutes` and
 * delivers them via the in-app notification channel (the only one actually
 * wired to send today — see server/utils/notifications.ts). Intended to be
 * called every few minutes by an external scheduler, same pattern as
 * server/api/habits/cron-skip.post.ts.
 *
 * Requires a shared secret via the `x-cron-secret` header (requireCronSecret).
 */

const DEFAULT_WINDOW_MINUTES = 15

const querySchema = z.object({
  windowMinutes: z.coerce.number().int().min(1).max(120).default(DEFAULT_WINDOW_MINUTES)
})

export default eventHandler(async (event) => {
  requireCronSecret(event)

  const { windowMinutes } = querySchema.parse(getQuery(event))
  const supabase = getSupabaseAdminClient()

  const now = new Date()
  const windowEnd = new Date(now.getTime() + windowMinutes * 60000)

  const { data: reminders, error } = await supabase
    .from('event_reminders')
    .select('id, event_id, user_id, minutes_before, event:events(id, owner_user_id, title, start_at, end_at, rrule, event_timezone, archived_at, calendar:calendars(archived_at))')

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao buscar lembretes', data: error.message })
  }

  let notified = 0

  for (const reminder of (reminders ?? []) as Array<Record<string, unknown>>) {
    const evtRaw = reminder.event as Record<string, unknown> | Record<string, unknown>[] | null
    const evt = Array.isArray(evtRaw) ? evtRaw[0] : evtRaw
    if (!evt || evt.archived_at) continue

    const calendarRaw = evt.calendar as Record<string, unknown> | Record<string, unknown>[] | null
    const calendar = Array.isArray(calendarRaw) ? calendarRaw[0] : calendarRaw
    if (calendar?.archived_at) continue

    const minutesBefore = reminder.minutes_before as number
    const reminderId = reminder.id as string
    const eventId = evt.id as string
    const userId = evt.owner_user_id as string
    const title = evt.title as string

    if (!evt.rrule) {
      const startAt = new Date(evt.start_at as string)
      const reminderAt = new Date(startAt.getTime() - minutesBefore * 60000)

      if (reminderAt >= now && reminderAt < windowEnd) {
        const sent = await notifyReminder(supabase, {
          userId,
          title,
          startAt,
          eventId,
          reminderId,
          recurrenceId: null,
          minutesBefore
        })
        if (sent) notified++
      }
      continue
    }

    // Recurring event — find occurrences whose reminder falls inside the scan window.
    const expandRangeEnd = new Date(windowEnd.getTime() + minutesBefore * 60000)
    const occurrences = expandRecurrence(
      evt.start_at as string,
      evt.rrule as string,
      now,
      expandRangeEnd,
      evt.event_timezone as string
    )

    if (occurrences.length === 0) continue

    const { data: exceptions } = await supabase
      .from('event_exceptions')
      .select('recurrence_id, type')
      .eq('event_id', eventId)

    const cancelledIds = new Set(
      (exceptions ?? [])
        .filter((ex: Record<string, unknown>) => ex.type === 'cancelled')
        .map((ex: Record<string, unknown>) => ex.recurrence_id as string)
    )

    for (const occ of occurrences) {
      const recurrenceId = occ.toISOString()
      if (cancelledIds.has(recurrenceId)) continue

      const reminderAt = new Date(occ.getTime() - minutesBefore * 60000)
      if (reminderAt >= now && reminderAt < windowEnd) {
        const sent = await notifyReminder(supabase, {
          userId,
          title,
          startAt: occ,
          eventId,
          reminderId,
          recurrenceId,
          minutesBefore
        })
        if (sent) notified++
      }
    }
  }

  return { notified }
})

async function notifyReminder(
  supabase: SupabaseClient,
  params: {
    userId: string
    title: string
    startAt: Date
    eventId: string
    reminderId: string
    recurrenceId: string | null
    minutesBefore: number
  }
): Promise<boolean> {
  const timeLabel = params.minutesBefore >= 60
    ? `${Math.round(params.minutesBefore / 60)}h`
    : `${params.minutesBefore} min`

  const result = await createNotification(supabase, {
    userId: params.userId,
    body: `Lembrete: "${params.title}" começa em ${timeLabel}.`,
    type: 'system',
    category: 'appointment_reminder',
    linkPath: '/app/appointments',
    externalId: `event-reminder-${params.eventId}-${params.recurrenceId ?? 'single'}-${params.reminderId}`
  })

  return result !== null
}
