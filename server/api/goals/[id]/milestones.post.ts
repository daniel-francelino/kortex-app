import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'
import { mapGoalMilestone } from '../../../utils/goals'

const paramsSchema = z.object({
  id: z.string().uuid()
})

const bodySchema = z.object({
  title: z.string().min(1, 'Título é obrigatório').max(200),
  description: z.string().max(1000).optional()
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

  // Get max sort_order for this goal
  const { data: existing } = await supabase
    .from('goal_milestones')
    .select('sort_order')
    .eq('goal_id', goalId)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextOrder = existing && existing.length > 0
    ? (existing[0] as Record<string, unknown>).sort_order as number + 1
    : 0

  const { data, error } = await supabase
    .from('goal_milestones')
    .insert({
      goal_id: goalId,
      title: parsed.title,
      description: parsed.description ?? null,
      sort_order: nextOrder
    })
    .select('*')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao criar marco', data: error.message })
  }

  return mapGoalMilestone(data as Record<string, unknown>)
})
