import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'
import { mapGoalTask } from '../../../utils/goals'
import { syncGoalTaskLinkedEvent } from '../../../utils/goal-task-event-sync'

const paramsSchema = z.object({
  id: z.string().uuid()
})

const bodySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  completed: z.boolean().optional(),
  milestoneId: z.string().uuid().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD').nullable().optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const { id: taskId } = paramsSchema.parse(getRouterParams(event))
  const body = await readBody(event)
  const parsed = bodySchema.parse(body)

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

  if (parsed.milestoneId) {
    const goalId = (task as Record<string, unknown>).goal_id as string
    const { data: milestone } = await supabase
      .from('goal_milestones')
      .select('id')
      .eq('id', parsed.milestoneId)
      .eq('goal_id', goalId)
      .maybeSingle()

    if (!milestone) {
      throw createError({ statusCode: 404, statusMessage: 'Marco não encontrado' })
    }
  }

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (parsed.title !== undefined) updateData.title = parsed.title
  if (parsed.description !== undefined) updateData.description = parsed.description
  if (parsed.completed !== undefined) updateData.completed = parsed.completed
  if (parsed.milestoneId !== undefined) updateData.milestone_id = parsed.milestoneId
  if (parsed.dueDate !== undefined) updateData.due_date = parsed.dueDate

  const { data, error } = await supabase
    .from('goal_tasks')
    .update(updateData)
    .eq('id', taskId)
    .select('*')
    .single()

  if (error || !data) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao atualizar tarefa', data: error?.message })
  }

  const taskRow = data as Record<string, unknown>

  if (parsed.dueDate !== undefined || parsed.completed !== undefined || parsed.title !== undefined || parsed.description !== undefined) {
    await syncGoalTaskLinkedEvent(supabase, user.id, {
      id: taskRow.id as string,
      title: taskRow.title as string,
      description: taskRow.description as string | null,
      dueDate: taskRow.due_date as string | null,
      completed: Boolean(taskRow.completed)
    })
  }

  return mapGoalTask(taskRow)
})
