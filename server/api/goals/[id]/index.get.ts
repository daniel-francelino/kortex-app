import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'
import { mapGoal } from '../../../utils/goals'
import { calculateHabitConsistency } from '../../../utils/habits'
import { resolveUserTimezone } from '../../../utils/user-timezone'
import { todayInZone } from '#shared/utils/dateTime'

const paramsSchema = z.object({
  id: z.string().uuid()
})

const querySchema = z.object({
  tz: z.string().optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const { id } = paramsSchema.parse(getRouterParams(event))
  const params = querySchema.parse(getQuery(event))

  const supabase = getSupabaseAdminClient()

  // Fetch goal
  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (goalError || !goal) {
    throw createError({ statusCode: 404, statusMessage: 'Meta não encontrada' })
  }

  // Fetch tasks
  const { data: tasks } = await supabase
    .from('goal_tasks')
    .select('*')
    .eq('goal_id', id)
    .order('sort_order', { ascending: true })

  // Fetch milestones
  const { data: milestones } = await supabase
    .from('goal_milestones')
    .select('*')
    .eq('goal_id', id)
    .order('sort_order', { ascending: true })

  // Fetch habit links with habit names
  const { data: habitLinks } = await supabase
    .from('goal_habits')
    .select('*, habit:habits(name, archived_at, frequency, custom_days, created_at)')
    .eq('goal_id', id)

  const taskProgress = Number(goal.progress ?? 0)
  const hasTasks = (tasks ?? []).length > 0
  let habitProgress: number | undefined
  let combinedProgress = taskProgress

  if ((habitLinks ?? []).length > 0) {
    const timezone = await resolveUserTimezone(supabase, user.id, params.tz)
    const today = todayInZone(timezone)

    const rates = await Promise.all((habitLinks ?? []).map(async (link: Record<string, unknown>) => {
      const habit = link.habit as Record<string, unknown> | null
      if (!habit) return null

      const habitCreatedAt = String(habit.created_at ?? today).split('T')[0]!
      const linkCreatedAt = String(link.created_at ?? today).split('T')[0]!
      const fromDate = habitCreatedAt > linkCreatedAt ? habitCreatedAt : linkCreatedAt

      const consistency = await calculateHabitConsistency(
        supabase,
        String(link.habit_id),
        habit.frequency,
        habit.custom_days as number[] | null,
        fromDate,
        today
      )

      return consistency.dueDays > 0 ? consistency.rate : null
    }))

    const validRates = rates.filter((rate): rate is number => rate !== null)
    habitProgress = validRates.length > 0
      ? Math.round((validRates.reduce((sum, rate) => sum + rate, 0) / validRates.length) * 100)
      : 0

    combinedProgress = hasTasks ? Math.round((taskProgress + habitProgress) / 2) : habitProgress
  }

  return mapGoal({
    ...goal,
    taskProgress,
    habitProgress,
    combinedProgress,
    tasks: tasks ?? [],
    milestones: milestones ?? [],
    habitLinks: (habitLinks ?? []).map((link: Record<string, unknown>) => ({
      ...link,
      habitName: (link.habit as Record<string, unknown> | null)?.name ?? null
    }))
  } as Record<string, unknown>)
})
