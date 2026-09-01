import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { resolveUserTimezone } from '../../utils/user-timezone'
import { todayInZone } from '#shared/utils/dateTime'

const querySchema = z.object({
  tz: z.string().optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const supabase = getSupabaseAdminClient()
  const params = querySchema.parse(getQuery(event))

  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('*, list:task_lists(id, name)')
    .eq('user_id', user.id)
    .neq('status', 'archived')

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao buscar insights', data: error.message })
  }

  const all = tasks ?? []
  const timezone = await resolveUserTimezone(supabase, user.id, params.tz)
  const today = todayInZone(timezone)

  const pending = all.filter((t: Record<string, unknown>) => t.status === 'pending')
  const inProgress = all.filter((t: Record<string, unknown>) => t.status === 'in_progress')
  const completed = all.filter((t: Record<string, unknown>) => t.status === 'completed')
  const overdue = all.filter((t: Record<string, unknown>) =>
    t.due_date && (t.due_date as string) < today && t.status !== 'completed'
  )

  const totalTasks = all.length
  const completionRate = totalTasks > 0
    ? Math.round((completed.length / totalTasks) * 100)
    : 0

  // Group by priority
  const priorityLabels: Record<string, string> = {
    low: 'Baixa',
    medium: 'Média',
    high: 'Alta',
    critical: 'Crítica'
  }

  const priorityStats = all.reduce<Record<string, { count: number, completedCount: number }>>((acc, t: Record<string, unknown>) => {
    const p = t.priority as string
    if (!acc[p]) acc[p] = { count: 0, completedCount: 0 }
    acc[p].count++
    if (t.status === 'completed') acc[p].completedCount++
    return acc
  }, {})

  const byPriority = Object.entries(priorityStats).map(([priority, stats]) => ({
    priority,
    label: priorityLabels[priority] ?? priority,
    count: stats.count,
    completedCount: stats.completedCount
  }))

  // Group by list
  const listStats = all.reduce<Record<string, { listName: string, count: number, completedCount: number }>>((acc, t: Record<string, unknown>) => {
    const list = t.list as Record<string, unknown> | null
    const listId = list?.id as string ?? '_none'
    const listName = list?.name as string ?? 'Sem lista'
    if (!acc[listId]) acc[listId] = { listName, count: 0, completedCount: 0 }
    acc[listId].count++
    if (t.status === 'completed') acc[listId].completedCount++
    return acc
  }, {})

  const byList = Object.entries(listStats).map(([listId, stats]) => ({
    listId: listId === '_none' ? null : listId,
    listName: stats.listName,
    count: stats.count,
    completedCount: stats.completedCount
  }))

  return {
    totalTasks,
    pendingTasks: pending.length,
    inProgressTasks: inProgress.length,
    completedTasks: completed.length,
    overdueTasks: overdue.length,
    completionRate,
    byPriority,
    byList
  }
})
