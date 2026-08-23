import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { resolveHabitVersionIdForDate } from '../../utils/habit-versions'

const bodySchema = z.object({
  habitId: z.string().uuid(),
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD'),
  completed: z.boolean(),
  status: z.enum(['done', 'done_later', 'skipped', 'frozen']).optional(),
  note: z.string().max(500).optional()
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
    .select('id')
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

  // Keep the log action successful even if the cache refresh fails.
  try {
    await updateStreakCache(supabase, user.id, parsed.habitId)
  } catch (error) {
    console.error('[habits/log] streak cache update failed', {
      habitId: parsed.habitId,
      userId: user.id,
      error
    })
  }

  return log
})

async function updateStreakCache(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  userId: string,
  habitId: string
): Promise<void> {
  // Get recent logs (completed or frozen) ordered by date desc
  const { data: logs } = await supabase
    .from('habit_logs')
    .select('log_date, status')
    .eq('habit_id', habitId)
    .eq('user_id', userId)
    .in('status', ['done', 'done_later', 'frozen'])
    .order('log_date', { ascending: false })
    .limit(400)

  if (!logs || logs.length === 0) {
    await supabase.from('habit_streaks').upsert({
      habit_id: habitId,
      user_id: userId,
      current_streak: 0,
      longest_streak: 0,
      last_completed_date: null,
      status: 'active',
      updated_at: new Date().toISOString()
    }, { onConflict: 'habit_id' })
    return
  }

  const completedDates = new Set(
    logs
      .filter((l: Record<string, unknown>) => l.status === 'done' || l.status === 'done_later')
      .map((l: Record<string, unknown>) => l.log_date as string)
  )
  const frozenDates = new Set(
    logs
      .filter((l: Record<string, unknown>) => l.status === 'frozen')
      .map((l: Record<string, unknown>) => l.log_date as string)
  )

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  // Determine streak start: today or yesterday (if today has no log yet).
  // A frozen day counts as "activity" for anchoring, same as a real completion.
  const mostRecentDateStr = [...completedDates, ...frozenDates].sort().reverse()[0]
  const mostRecentDate = mostRecentDateStr ? new Date(`${mostRecentDateStr}T00:00:00`) : null

  let streakAnchor: Date
  if (mostRecentDate && mostRecentDate.getTime() === today.getTime()) {
    streakAnchor = today
  } else if (mostRecentDate && mostRecentDate.getTime() === yesterday.getTime()) {
    streakAnchor = yesterday
  } else {
    // Last activity was before yesterday — streak is 0
    streakAnchor = today
  }

  // Walk backward day by day from the anchor. A completed day increments the
  // streak; a frozen day preserves it (doesn't increment, doesn't break it);
  // any other day breaks the walk.
  let currentStreak = 0
  let anchorIsFrozen = false
  const cursor = new Date(streakAnchor)

  for (let i = 0; ; i++) {
    const dateStr = cursor.toISOString().split('T')[0]!

    if (completedDates.has(dateStr)) {
      currentStreak++
    } else if (frozenDates.has(dateStr)) {
      if (i === 0) anchorIsFrozen = true
    } else {
      break
    }

    cursor.setDate(cursor.getDate() - 1)
  }

  // Calculate longest streak — real completions only, freezes don't inflate it.
  let longestStreak = 0
  let tempStreak = 1
  const sortedCompletedDates = [...completedDates].sort()

  for (let i = 1; i < sortedCompletedDates.length; i++) {
    const prev = new Date(`${sortedCompletedDates[i - 1]}T00:00:00`)
    const curr = new Date(`${sortedCompletedDates[i]}T00:00:00`)
    const diff = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24)

    if (diff === 1) {
      tempStreak++
    } else {
      longestStreak = Math.max(longestStreak, tempStreak)
      tempStreak = 1
    }
  }
  if (sortedCompletedDates.length > 0) {
    longestStreak = Math.max(longestStreak, tempStreak, currentStreak)
  }

  const lastCompletedDate = sortedCompletedDates.at(-1) ?? null

  await supabase.from('habit_streaks').upsert({
    habit_id: habitId,
    user_id: userId,
    current_streak: currentStreak,
    longest_streak: longestStreak,
    last_completed_date: lastCompletedDate,
    status: anchorIsFrozen ? 'frozen' : 'active',
    updated_at: new Date().toISOString()
  }, { onConflict: 'habit_id' })
}
