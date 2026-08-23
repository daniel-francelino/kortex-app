import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'
import { mapGoalTask } from '../../../utils/goals'
import { syncGoalTaskLinkedEvent } from '../../../utils/goal-task-event-sync'

const paramsSchema = z.object({
  id: z.string().uuid()
})

const bodySchema = z.object({
  title: z.string().min(1, 'Título é obrigatório').max(200),
  description: z.string().max(1000).optional(),
  milestoneId: z.string().uuid().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD').optional()
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

  if (parsed.milestoneId) {
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

  // Get max sort_order for this goal
  const { data: existing } = await supabase
    .from('goal_tasks')
    .select('sort_order')
    .eq('goal_id', goalId)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextOrder = existing && existing.length > 0
    ? (existing[0] as Record<string, unknown>).sort_order as number + 1
    : 0

  const { data, error } = await supabase
    .from('goal_tasks')
    .insert({
      goal_id: goalId,
      title: parsed.title,
      description: parsed.description ?? null,
      sort_order: nextOrder,
      milestone_id: parsed.milestoneId ?? null,
      due_date: parsed.dueDate ?? null
    })
    .select('*')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao criar tarefa', data: error.message })
  }

  const taskRow = data as Record<string, unknown>

  if (parsed.dueDate) {
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
