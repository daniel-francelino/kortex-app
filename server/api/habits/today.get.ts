import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { mapHabit, mapHabitFromVersion, fetchHabitTagMap, fetchHabitGoalMap, isDueOnDay } from '../../utils/habits'
import { resolveHabitsForDate } from '../../utils/habit-versions'
import { resolveHabitStacksForDate } from '../../utils/habit-stacks'

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD').optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const query = getQuery(event)
  const params = querySchema.parse(query)

  const todayStr = new Date().toISOString().split('T')[0]!
  const date = params.date ?? todayStr
  const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay()
  const isCurrentDay = date === todayStr

  const supabase = getSupabaseAdminClient()

  let todayHabitsMapped: Record<string, unknown>[]

  if (isCurrentDay) {
    // Current day — read directly from habits table (always up-to-date)
    const { data: habits, error: habitsError } = await supabase
      .from('habits')
      .select('*, identity:identities(*), streak:habit_streaks(*)')
      .eq('user_id', user.id)
      .is('archived_at', null)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })

    if (habitsError) {
      throw createError({ statusCode: 500, statusMessage: 'Falha ao buscar hábitos', data: habitsError.message })
    }

    const dueHabits = (habits ?? [])
      .filter((h: Record<string, unknown>) => isDueOnDay(h.frequency, h.custom_days, dayOfWeek))

    const dueIds = dueHabits.map((h: Record<string, unknown>) => String(h.id))
    const [tagMap, goalMap] = await Promise.all([
      fetchHabitTagMap(supabase, dueIds),
      fetchHabitGoalMap(supabase, dueIds)
    ])

    todayHabitsMapped = dueHabits
      .map((h: Record<string, unknown>) => mapHabit(h, tagMap.get(String(h.id)), goalMap.get(String(h.id))))
  } else {
    // Past/future date — use habit_versions for historical accuracy
    const resolved = await resolveHabitsForDate(supabase, user.id, date)

    const dueResolved = resolved
      .filter(({ version }) => isDueOnDay(version.frequency, version.custom_days, dayOfWeek))

    const dueIds = dueResolved.map(({ version }) => String(version.habit_id))
    const [tagMap, goalMap] = await Promise.all([
      fetchHabitTagMap(supabase, dueIds),
      fetchHabitGoalMap(supabase, dueIds)
    ])

    todayHabitsMapped = dueResolved
      .map(({ version, identity, streak, archivedAt }) =>
        mapHabitFromVersion(version, identity, streak, archivedAt, tagMap.get(String(version.habit_id)), goalMap.get(String(version.habit_id)))
      )
  }

  // Fetch logs for the date
  const habitIds = todayHabitsMapped.map(h => h.id as string)

  let logs: Record<string, { completed: boolean, status: string, note: string | null, id: string }> = {}

  if (habitIds.length > 0) {
    const { data: logsData } = await supabase
      .from('habit_logs')
      .select('id, habit_id, completed, status, note')
      .eq('user_id', user.id)
      .eq('log_date', date)
      .in('habit_id', habitIds)

    if (logsData) {
      logs = Object.fromEntries(
        logsData.map((l: Record<string, unknown>) => [l.habit_id, {
          completed: l.completed as boolean,
          status: (l.status as string) ?? (l.completed ? 'done' : 'skipped'),
          note: l.note as string | null,
          id: l.id as string
        }])
      )
    }
  }

  const result = todayHabitsMapped.map(habit => ({
    ...habit,
    log: logs[habit.id as string] ?? null
  }))

  const completedCount = result.filter(h => (h.log as Record<string, unknown> | null)?.completed).length
  const stacks = await resolveHabitStacksForDate(supabase, user.id, date)

  return {
    habits: result,
    stacks,
    completedCount,
    totalCount: result.length
  }
})
