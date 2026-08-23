import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'
import { mapGoalMilestone } from '../../../utils/goals'

const paramsSchema = z.object({
  id: z.string().uuid()
})

const bodySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  completed: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const { id: milestoneId } = paramsSchema.parse(getRouterParams(event))
  const body = await readBody(event)
  const parsed = bodySchema.parse(body)

  const supabase = getSupabaseAdminClient()

  // Verify milestone ownership via goal
  const { data: milestone, error: milestoneError } = await supabase
    .from('goal_milestones')
    .select('id, goal_id, goals!inner(user_id)')
    .eq('id', milestoneId)
    .single()

  if (milestoneError || !milestone) {
    throw createError({ statusCode: 404, statusMessage: 'Marco não encontrado' })
  }

  const goalData = (milestone as Record<string, unknown>).goals as Record<string, unknown>
  if (goalData.user_id !== user.id) {
    throw createError({ statusCode: 403, statusMessage: 'Acesso negado' })
  }

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (parsed.title !== undefined) updateData.title = parsed.title
  if (parsed.description !== undefined) updateData.description = parsed.description
  if (parsed.completed !== undefined) updateData.completed = parsed.completed
  if (parsed.sortOrder !== undefined) updateData.sort_order = parsed.sortOrder

  const { data, error } = await supabase
    .from('goal_milestones')
    .update(updateData)
    .eq('id', milestoneId)
    .select('*')
    .single()

  if (error || !data) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao atualizar marco', data: error?.message })
  }

  return mapGoalMilestone(data as Record<string, unknown>)
})
