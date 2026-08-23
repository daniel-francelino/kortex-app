import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'

const paramsSchema = z.object({
  id: z.string().uuid()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const { id: milestoneId } = paramsSchema.parse(getRouterParams(event))

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

  // Tasks under this milestone stay — only unlinked (ON DELETE SET NULL)
  const { error } = await supabase
    .from('goal_milestones')
    .delete()
    .eq('id', milestoneId)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao excluir marco', data: error.message })
  }

  return { success: true }
})
