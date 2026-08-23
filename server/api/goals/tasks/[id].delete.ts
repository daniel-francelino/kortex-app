import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'
import { archiveGoalTaskLinkedEvent } from '../../../utils/goal-task-event-sync'

const paramsSchema = z.object({
  id: z.string().uuid()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const { id: taskId } = paramsSchema.parse(getRouterParams(event))

  const supabase = getSupabaseAdminClient()

  // Verify task ownership via goal
  const { data: task, error: taskError } = await supabase
    .from('goal_tasks')
    .select('id, goal_id, goals!inner(user_id)')
    .eq('id', taskId)
    .single()

  if (taskError || !task) {
    throw createError({ statusCode: 404, statusMessage: 'Tarefa não encontrada' })
  }

  const goalData = (task as Record<string, unknown>).goals as Record<string, unknown>
  if (goalData.user_id !== user.id) {
    throw createError({ statusCode: 403, statusMessage: 'Acesso negado' })
  }

  const { error } = await supabase
    .from('goal_tasks')
    .delete()
    .eq('id', taskId)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao excluir tarefa', data: error.message })
  }

  await archiveGoalTaskLinkedEvent(supabase, user.id, taskId)

  return { success: true }
})
