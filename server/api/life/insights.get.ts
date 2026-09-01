import { z } from 'zod'
import { subDays } from 'date-fns'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { resolveUserTimezone } from '../../utils/user-timezone'
import { subCalendarDays, todayInZone } from '#shared/utils/dateTime'

const querySchema = z.object({
  tz: z.string().optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const params = querySchema.parse(getQuery(event))

  const supabase = getSupabaseAdminClient()

  const timezone = await resolveUserTimezone(supabase, user.id, params.tz)
  const today = todayInZone(timezone)

  // ─── Habits insights ─────────────────────────────────────────────────────
  const { data: activeHabits } = await supabase
    .from('habits')
    .select('id')
    .eq('user_id', user.id)
    .is('archived_at', null)

  const totalActiveHabits = activeHabits?.length ?? 0

  // Last 7/30 calendar days (date-key windows, for log_date/entry_date range
  // filters below) and their real-instant equivalents (for updated_at, which
  // is a timestamp, not a calendar-day key).
  const date7 = subCalendarDays(today, 7)
  const date30 = subCalendarDays(today, 30)
  const instant7 = subDays(new Date(), 7)
  const instant30 = subDays(new Date(), 30)

  const { data: logs7d } = await supabase
    .from('habit_logs')
    .select('completed')
    .eq('user_id', user.id)
    .gte('log_date', date7)
    .lte('log_date', today)

  const total7d = logs7d?.length ?? 0
  const completed7d = logs7d?.filter((l: Record<string, unknown>) => l.completed).length ?? 0
  const completionRate7d = total7d > 0 ? Math.round((completed7d / total7d) * 100) : 0

  const { data: logs30d } = await supabase
    .from('habit_logs')
    .select('completed')
    .eq('user_id', user.id)
    .gte('log_date', date30)
    .lte('log_date', today)

  const total30d = logs30d?.length ?? 0
  const completed30d = logs30d?.filter((l: Record<string, unknown>) => l.completed).length ?? 0
  const completionRate30d = total30d > 0 ? Math.round((completed30d / total30d) * 100) : 0

  // Average streak
  const { data: streaks } = await supabase
    .from('habit_streaks')
    .select('current_streak')
    .eq('user_id', user.id)

  const streakValues = (streaks ?? []).map((s: Record<string, unknown>) => s.current_streak as number)
  const averageStreak = streakValues.length > 0
    ? Math.round(streakValues.reduce((a, b) => a + b, 0) / streakValues.length)
    : 0

  // ─── Tasks insights ───────────────────────────────────────────────────────
  const { data: completedTasks7d } = await supabase
    .from('tasks')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .gte('updated_at', instant7.toISOString())

  const { data: completedTasks30d } = await supabase
    .from('tasks')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .gte('updated_at', instant30.toISOString())

  const { data: pendingTasks } = await supabase
    .from('tasks')
    .select('id, due_date')
    .eq('user_id', user.id)
    .in('status', ['pending', 'in_progress'])

  const tasksPending = pendingTasks?.length ?? 0
  const tasksOverdue = (pendingTasks ?? []).filter(
    (t: Record<string, unknown>) => t.due_date && (t.due_date as string) < today
  ).length

  // ─── Goals insights ───────────────────────────────────────────────────────
  const { data: activeGoals } = await supabase
    .from('goals')
    .select('id, progress, status')
    .eq('user_id', user.id)
    .is('archived_at', null)

  const goalsActive = (activeGoals ?? []).filter(
    (g: Record<string, unknown>) => g.status === 'active'
  ).length
  const goalsCompleted = (activeGoals ?? []).filter(
    (g: Record<string, unknown>) => g.status === 'completed'
  ).length
  const goalsProgress = (activeGoals ?? [])
    .filter((g: Record<string, unknown>) => g.status === 'active')
    .map((g: Record<string, unknown>) => g.progress as number)
  const avgGoalProgress = goalsProgress.length > 0
    ? Math.round(goalsProgress.reduce((a, b) => a + b, 0) / goalsProgress.length)
    : 0

  // ─── Journal insights ─────────────────────────────────────────────────────
  const { data: entries7d } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('user_id', user.id)
    .gte('entry_date', date7)
    .lte('entry_date', today)

  const { data: entries30d } = await supabase
    .from('journal_entries')
    .select('id')
    .eq('user_id', user.id)
    .gte('entry_date', date30)
    .lte('entry_date', today)

  // Journal streak: count consecutive days backwards
  const { data: recentEntries } = await supabase
    .from('journal_entries')
    .select('entry_date')
    .eq('user_id', user.id)
    .order('entry_date', { ascending: false })
    .limit(60)

  let journalStreak = 0
  if (recentEntries && recentEntries.length > 0) {
    const entryDates = new Set(
      recentEntries.map((e: Record<string, unknown>) => e.entry_date as string)
    )
    let cursor = today
    while (entryDates.has(cursor)) {
      journalStreak++
      cursor = subCalendarDays(cursor, 1)
    }
  }

  return {
    period: `${date30} – ${today}`,
    habits: {
      completionRate7d,
      completionRate30d,
      averageStreak,
      totalActive: totalActiveHabits
    },
    tasks: {
      completedLast7d: completedTasks7d?.length ?? 0,
      completedLast30d: completedTasks30d?.length ?? 0,
      pendingCount: tasksPending,
      overdueCount: tasksOverdue
    },
    goals: {
      totalActive: goalsActive,
      averageProgress: avgGoalProgress,
      completedCount: goalsCompleted
    },
    journal: {
      entriesLast7d: entries7d?.length ?? 0,
      entriesLast30d: entries30d?.length ?? 0,
      currentStreak: journalStreak
    }
  }
})
