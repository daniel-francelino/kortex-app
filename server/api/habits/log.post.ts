import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { resolveHabitVersionIdForDate } from '../../utils/habit-versions'
import { resolveUserTimezone } from '../../utils/user-timezone'
import { computeStreak, MAX_STREAK_LOOKBACK_DAYS } from '../../utils/habits'
import { todayInZone } from '#shared/utils/dateTime'

const bodySchema = z.object({
  habitId: z.string().uuid(),
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
  completed: z.boolean(),
  status: z.enum(['done', 'done_later', 'skipped', 'frozen']).optional(),
  note: z.string().max(500).optional(),
  tz: z.string().optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody(event)
  const parsedBody = bodySchema.safeParse(body)

  if (!parsedBody.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Payload inválido para registrar hábito',
      data: parsedBody.error.flatten()
    })
  }

  const parsed = parsedBody.data

  const supabase = getSupabaseAdminClient()

  // Verify habit ownership
  const { data: habit, error: habitError } = await supabase
    .from('habits')
    .select('id, frequency, custom_days')
    .eq('id', parsed.habitId)
    .eq('user_id', user.id)
    .single()

  if (habitError || !habit) {
    throw createError({ statusCode: 404, statusMessage: 'Hábito não encontrado' })
  }

  const habitVersionId = await resolveHabitVersionIdForDate(supabase, parsed.habitId, user.id, parsed.logDate)

  const logStatus = parsed.status ?? (parsed.completed ? 'done' : 'skipped')
  const isCompleted = logStatus === 'done' || logStatus === 'done_later'

  if (logStatus === 'frozen') {
    const { data: existingLog } = await supabase
      .from('habit_logs')
      .select('status')
      .eq('habit_id', parsed.habitId)
      .eq('log_date', parsed.logDate)
      .maybeSingle()

    if (existingLog?.status !== 'frozen') {
      const monthStart = `${parsed.logDate.slice(0, 7)}-01`
      const nextMonthDate = new Date(`${monthStart}T00:00:00Z`)
      nextMonthDate.setUTCMonth(nextMonthDate.getUTCMonth() + 1)
      const nextMonthStart = nextMonthDate.toISOString().split('T')[0]!

      const FREEZE_MONTHLY_CAP = 3
      const { count: frozenThisMonth } = await supabase
        .from('habit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('habit_id', parsed.habitId)
        .eq('status', 'frozen')
        .gte('log_date', monthStart)
        .lt('log_date', nextMonthStart)

      if ((frozenThisMonth ?? 0) >= FREEZE_MONTHLY_CAP) {
        throw createError({ statusCode: 409, statusMessage: 'Limite de congelamentos do mês atingido' })
      }
    }
  }

  // Upsert log (idempotent per habit+date)
  const { data: log, error: logError } = await supabase
    .from('habit_logs')
    .upsert(
      {
        user_id: user.id,
        habit_id: parsed.habitId,
        habit_version_id: habitVersionId,
        log_date: parsed.logDate,
        completed: isCompleted,
        status: logStatus,
        note: parsed.note ?? null,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'habit_id,log_date' }
    )
    .select('*')
    .single()

  if (logError) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao registrar hábito', data: logError.message })
  }

  // Keep the log action successful even if the cache refresh fails — `streak`
  // just stays null in the response, and the client keeps whatever streak
  // badge it already had instead of updating it.
  let streak: { currentStreak: number, longestStreak: number, status: 'active' | 'frozen' | 'broken' } | null = null
  try {
    const timezone = await resolveUserTimezone(supabase, user.id, parsed.tz)
    streak = await updateStreakCache(
      supabase,
      user.id,
      parsed.habitId,
      timezone,
      (habit as Record<string, unknown>).frequency,
      (habit as Record<string, unknown>).custom_days
    )
  } catch (error) {
    console.error('[habits/log] streak cache update failed', {
      habitId: parsed.habitId,
      userId: user.id,
      error
    })
  }

  return { ...log, streak }
})

async function updateStreakCache(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  userId: string,
  habitId: string,
  timezone: string,
  frequency: unknown,
  customDays: unknown
): Promise<{ currentStreak: number, longestStreak: number, status: 'active' | 'frozen' | 'broken' } | null> {
  // Get recent logs (completed or frozen) ordered by date desc. Capped at
  // MAX_STREAK_LOOKBACK_DAYS, not an arbitrary number — computeStreak never
  // looks further back than that, so nothing beyond it could change the
  // result (see docs/habits/ANALISE_STREAK.md, item 4).
  const { data: logs } = await supabase
    .from('habit_logs')
    .select('log_date, status')
    .eq('habit_id', habitId)
    .eq('user_id', userId)
    .in('status', ['done', 'done_later', 'frozen'])
    .order('log_date', { ascending: false })
    .limit(MAX_STREAK_LOOKBACK_DAYS)

  const streakLogs = (logs ?? []).map((l: Record<string, unknown>) => ({
    logDate: l.log_date as string,
    status: l.status as 'done' | 'done_later' | 'frozen'
  }))

  const today = todayInZone(timezone)
  const { currentStreak, longestStreak, lastCompletedDate, status } = computeStreak(streakLogs, frequency, customDays, today)

  await supabase.from('habit_streaks').upsert({
    habit_id: habitId,
    user_id: userId,
    current_streak: currentStreak,
    longest_streak: longestStreak,
    last_completed_date: lastCompletedDate,
    status,
    updated_at: new Date().toISOString()
  }, { onConflict: 'habit_id' })

  return { currentStreak, longestStreak, status }
}
