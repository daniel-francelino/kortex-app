import { getSupabaseAdminClient } from '../../utils/supabase'
import { resolveHabitVersionIdForDate } from '../../utils/habit-versions'
import { requireCronSecret } from '../../utils/require-cron-secret'
import { isDueOnDay } from '../../utils/habits'

/**
 * Marks all habits that were not logged for a given date as "skipped".
 * Intended to be called by a daily cron job (e.g. at midnight or early morning).
 *
 * Requires a shared secret via the `x-cron-secret` header to prevent unauthorized access.
 * The expected secret is stored in `runtimeConfig.cronSecret`.
 */
export default eventHandler(async (event) => {
  requireCronSecret(event)

  const query = getQuery(event)
  const targetDate = typeof query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query.date)
    ? query.date
    : getYesterday()

  const supabase = getSupabaseAdminClient()

  // 1. Get all active (non-archived) daily habits
  const { data: habits, error: habitsError } = await supabase
    .from('habits')
    .select('id, user_id, frequency, custom_days')
    .is('archived_at', null)

  if (habitsError) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao buscar hábitos', data: habitsError.message })
  }

  if (!habits || habits.length === 0) {
    return { skipped: 0, date: targetDate }
  }

  const targetDayOfWeek = new Date(`${targetDate}T12:00:00`).getDay()

  // 2. Filter habits that should have been done on the target date
  const applicableHabits = habits.filter((habit: Record<string, unknown>) =>
    isDueOnDay(habit.frequency, habit.custom_days, targetDayOfWeek)
  )

  if (applicableHabits.length === 0) {
    return { skipped: 0, date: targetDate }
  }

  // 3. Get existing logs for that date
  const habitIds = applicableHabits.map((h: Record<string, unknown>) => h.id as string)

  const { data: existingLogs, error: logsError } = await supabase
    .from('habit_logs')
    .select('habit_id')
    .in('habit_id', habitIds)
    .eq('log_date', targetDate)

  if (logsError) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao buscar logs', data: logsError.message })
  }

  const loggedHabitIds = new Set((existingLogs ?? []).map((l: Record<string, unknown>) => l.habit_id as string))

  // 4. Find habits with no log for the target date
  const unloggedHabits = applicableHabits.filter(
    (h: Record<string, unknown>) => !loggedHabitIds.has(h.id as string)
  )

  if (unloggedHabits.length === 0) {
    return { skipped: 0, date: targetDate }
  }

  // 5. Insert skipped logs
  const rows: Record<string, unknown>[] = []
  for (const habit of unloggedHabits) {
    const habitId = habit.id as string
    const userId = habit.user_id as string

    let habitVersionId: string
    try {
      habitVersionId = await resolveHabitVersionIdForDate(supabase, habitId, userId, targetDate)
    } catch {
      continue
    }

    rows.push({
      user_id: userId,
      habit_id: habitId,
      habit_version_id: habitVersionId,
      log_date: targetDate,
      completed: false,
      status: 'skipped',
      note: null,
      updated_at: new Date().toISOString()
    })
  }

  if (rows.length === 0) {
    return { skipped: 0, date: targetDate }
  }

  const { error: insertError } = await supabase
    .from('habit_logs')
    .upsert(rows, { onConflict: 'habit_id,log_date' })

  if (insertError) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao inserir logs de skip', data: insertError.message })
  }

  return { skipped: rows.length, date: targetDate }
})

function getYesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]!
}
