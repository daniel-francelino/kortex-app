import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'
import { mapGoalHabitLink } from '../../../utils/goals'

const paramsSchema = z.object({
  id: z.string().uuid()
})

const bodySchema = z.object({
  habitId: z.string().uuid('Selecione um hábito válido')
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const { id: goalId } = paramsSchema.parse(getRouterParams(event))
  const body = await readBody(event)
  const parsed = bodySchema.parse(body)

  const supabase = getSupabaseAdminClient()

  // Verify goal ownership
  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .select('id')
    .eq('id', goalId)
    .eq('user_id', user.id)
    .single()

  if (goalError || !goal) {
    throw createError({ statusCode: 404, statusMessage: 'Meta não encontrada' })
  }

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

  // Um hábito só pode sustentar uma meta por vez — avisar com o nome da meta atual
  const { data: existingLink } = await supabase
    .from('goal_habits')
    .select('goal_id, goal:goals(title)')
    .eq('habit_id', parsed.habitId)
    .maybeSingle()

  if (existingLink) {
    const linkedGoal = (existingLink as Record<string, unknown>).goal as { title: string } | null
    throw createError({
      statusCode: 409,
      statusMessage: `Este hábito já está vinculado à meta "${linkedGoal?.title ?? ''}"`
    })
  }

  const { data, error } = await supabase
    .from('goal_habits')
    .insert({
      goal_id: goalId,
      habit_id: parsed.habitId
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'Este hábito já está vinculado a esta meta' })
    }
    throw createError({ statusCode: 500, statusMessage: 'Falha ao vincular hábito', data: error.message })
  }

  return mapGoalHabitLink(data as Record<string, unknown>)
})
