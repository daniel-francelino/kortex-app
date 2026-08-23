import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../utils/supabase'
import { requireAuthUser } from '../../../../utils/require-auth'
import { expandRecurrence, formatRRuleUntil, parseRRule } from '../../../../utils/recurrence'

const bodySchema = z.object({
  recurrenceId: z.string().min(1),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  location: z.string().max(500).nullable().optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional()
})

/**
 * Edits "this occurrence and all following ones" of a recurring event. There
 * is no native iCalendar concept for a mid-series split — the standard
 * approach (and what Google/Outlook do under the hood) is:
 *   1. Truncate the original series' rrule so it ends right before the split.
 *   2. Create a new event row starting at the split occurrence, carrying the
 *      edited fields, with its own (possibly recalculated) rrule.
 *   3. Re-point any exceptions from the split point onward to the new event.
 *   4. Copy reminders onto the new event (they're keyed by event_id).
 */
export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID do evento é obrigatório' })
  }

  const body = await readBody(event)
  const payload = bodySchema.parse(body)

  const supabase = getSupabaseAdminClient()

  const { data: original, error: fetchError } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .eq('owner_user_id', user.id)
    .single()

  if (fetchError || !original) {
    throw createError({ statusCode: 404, statusMessage: 'Evento não encontrado' })
  }

  const originalRow = original as Record<string, unknown>
  const originalRrule = originalRow.rrule as string | null

  if (!originalRrule) {
    throw createError({ statusCode: 400, statusMessage: 'Este evento não é recorrente' })
  }

  const splitAt = new Date(payload.recurrenceId)
  if (Number.isNaN(splitAt.getTime())) {
    throw createError({ statusCode: 400, statusMessage: 'recurrenceId inválido' })
  }

  const parsedOriginal = parseRRule(originalRrule)
  const untilBeforeSplit = formatRRuleUntil(new Date(splitAt.getTime() - 1000))

  // ─── 1. Truncate the original series to end right before the split ────────
  const truncatedRrule = rebuildRRule(originalRrule, { until: untilBeforeSplit, count: undefined })

  const { error: truncateError } = await supabase
    .from('events')
    .update({ rrule: truncatedRrule, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (truncateError) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao truncar série original', data: truncateError.message })
  }

  // ─── 2. Build the new series' rrule (carry UNTIL, recompute COUNT) ────────
  let newRrule: string | null = originalRrule

  if (parsedOriginal.count) {
    const consumedBeforeSplit = expandRecurrence(
      originalRow.start_at as string,
      originalRrule,
      new Date(originalRow.start_at as string),
      new Date(splitAt.getTime() - 1000),
      originalRow.event_timezone as string,
      parsedOriginal.count
    ).length

    const remaining = parsedOriginal.count - consumedBeforeSplit
    newRrule = remaining > 0
      ? rebuildRRule(originalRrule, { count: remaining, until: undefined })
      : null
  }

  const newStartAt = payload.startAt ?? splitAt.toISOString()
  const originalDuration = new Date(originalRow.end_at as string).getTime() - new Date(originalRow.start_at as string).getTime()
  const newEndAt = payload.endAt ?? new Date(new Date(newStartAt).getTime() + originalDuration).toISOString()

  const { data: newEvent, error: insertError } = await supabase
    .from('events')
    .insert({
      calendar_id: originalRow.calendar_id,
      owner_user_id: user.id,
      title: payload.title ?? originalRow.title,
      description: payload.description !== undefined ? payload.description : originalRow.description,
      location: payload.location !== undefined ? payload.location : originalRow.location,
      start_at: newStartAt,
      end_at: newEndAt,
      event_timezone: originalRow.event_timezone,
      all_day: originalRow.all_day,
      rrule: newRrule
    })
    .select()
    .single()

  if (insertError || !newEvent) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao criar a nova série', data: insertError?.message })
  }

  const newEventId = (newEvent as Record<string, unknown>).id as string

  // ─── 3. Re-point exceptions from the split point onward ───────────────────
  const { error: repointError } = await supabase
    .from('event_exceptions')
    .update({ event_id: newEventId })
    .eq('event_id', id)
    .gte('recurrence_id', payload.recurrenceId)

  if (repointError) {
    console.error('[split-series] failed to repoint exceptions', repointError.message)
  }

  // ─── 4. Copy reminders onto the new event ──────────────────────────────────
  const { data: reminders } = await supabase
    .from('event_reminders')
    .select('user_id, type, minutes_before')
    .eq('event_id', id)

  if (reminders && reminders.length > 0) {
    const { error: reminderCopyError } = await supabase
      .from('event_reminders')
      .insert(
        reminders.map((r: Record<string, unknown>) => ({
          event_id: newEventId,
          user_id: r.user_id,
          type: r.type,
          minutes_before: r.minutes_before
        }))
      )

    if (reminderCopyError) {
      console.error('[split-series] failed to copy reminders', reminderCopyError.message)
    }
  }

  return newEvent
})

/**
 * Rebuilds an RRULE string dropping any existing COUNT/UNTIL and applying the
 * given replacements (undefined means "omit this component").
 */
function rebuildRRule(rrule: string, replace: { count?: number, until?: string }): string {
  const parts = rrule.split(';').filter((part) => {
    const key = part.split('=')[0]
    return key !== 'COUNT' && key !== 'UNTIL'
  })

  if (replace.count !== undefined) parts.push(`COUNT=${replace.count}`)
  if (replace.until !== undefined) parts.push(`UNTIL=${replace.until}`)

  return parts.join(';')
}
