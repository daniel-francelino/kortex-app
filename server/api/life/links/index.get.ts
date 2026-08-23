import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  sourceType: z.enum(['habit', 'goal', 'task', 'event', 'journal_entry']).optional(),
  sourceId: z.string().uuid().optional(),
  targetType: z.enum(['habit', 'goal', 'task', 'event', 'journal_entry']).optional(),
  targetId: z.string().uuid().optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const query = getQuery(event)
  const params = querySchema.parse(query)

  const supabase = getSupabaseAdminClient()

  const from = (params.page - 1) * params.pageSize
  const to = from + params.pageSize - 1

  let qb = supabase
    .from('entity_links')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (params.sourceType) {
    qb = qb.eq('source_type', params.sourceType)
  }

  if (params.sourceId) {
    qb = qb.eq('source_id', params.sourceId)
  }

  if (params.targetType) {
    qb = qb.eq('target_type', params.targetType)
  }

  if (params.targetId) {
    qb = qb.eq('target_id', params.targetId)
  }

  const { data, error, count } = await qb

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao buscar vínculos', data: error.message })
  }

  const rows = (data ?? []) as Record<string, unknown>[]
  const labelMap = await resolveEntityLabels(supabase, user.id, rows)

  return {
    data: rows.map((row) => {
      const sourceType = String(row.source_type)
      const sourceId = String(row.source_id)
      const targetType = String(row.target_type)
      const targetId = String(row.target_id)

      return {
        id: row.id,
        userId: row.user_id,
        sourceType: row.source_type,
        sourceId: row.source_id,
        targetType: row.target_type,
        targetId: row.target_id,
        createdAt: row.created_at,
        sourceLabel: labelMap.get(`${sourceType}:${sourceId}`) ?? null,
        targetLabel: labelMap.get(`${targetType}:${targetId}`) ?? null
      }
    }),
    total: count ?? 0,
    page: params.page,
    pageSize: params.pageSize
  }
})

function formatJournalDateLabel(dateStr: string): string {
  const parsed = new Date(`${dateStr}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return dateStr
  return parsed.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * Batch-resolves a human label for every distinct (type, id) referenced by
 * `rows`, one query per entity type — avoids N+1 across the link list.
 */
async function resolveEntityLabels(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  userId: string,
  rows: Record<string, unknown>[]
): Promise<Map<string, string>> {
  const idsByType = new Map<string, Set<string>>()

  function addId(type: string, id: string) {
    if (!idsByType.has(type)) idsByType.set(type, new Set())
    idsByType.get(type)!.add(id)
  }

  for (const row of rows) {
    addId(String(row.source_type), String(row.source_id))
    addId(String(row.target_type), String(row.target_id))
  }

  const labelMap = new Map<string, string>()

  const goalIds = [...(idsByType.get('goal') ?? [])]
  if (goalIds.length > 0) {
    const { data: goals } = await supabase.from('goals').select('id, title').eq('user_id', userId).in('id', goalIds)
    for (const goal of (goals ?? []) as Array<Record<string, unknown>>) {
      labelMap.set(`goal:${goal.id}`, String(goal.title))
    }
  }

  const habitIds = [...(idsByType.get('habit') ?? [])]
  if (habitIds.length > 0) {
    const { data: habits } = await supabase.from('habits').select('id, name').eq('user_id', userId).in('id', habitIds)
    for (const habit of (habits ?? []) as Array<Record<string, unknown>>) {
      labelMap.set(`habit:${habit.id}`, String(habit.name))
    }
  }

  const taskIds = [...(idsByType.get('task') ?? [])]
  if (taskIds.length > 0) {
    const { data: tasks } = await supabase.from('tasks').select('id, title').eq('user_id', userId).in('id', taskIds)
    for (const task of (tasks ?? []) as Array<Record<string, unknown>>) {
      labelMap.set(`task:${task.id}`, String(task.title))
    }
  }

  const eventIds = [...(idsByType.get('event') ?? [])]
  if (eventIds.length > 0) {
    const { data: events } = await supabase.from('events').select('id, title').eq('owner_user_id', userId).in('id', eventIds)
    for (const eventRow of (events ?? []) as Array<Record<string, unknown>>) {
      labelMap.set(`event:${eventRow.id}`, String(eventRow.title))
    }
  }

  const journalIds = [...(idsByType.get('journal_entry') ?? [])]
  if (journalIds.length > 0) {
    const { data: entries } = await supabase.from('journal_entries').select('id, entry_date').eq('user_id', userId).in('id', journalIds)
    for (const entry of (entries ?? []) as Array<Record<string, unknown>>) {
      labelMap.set(`journal_entry:${entry.id}`, formatJournalDateLabel(String(entry.entry_date)))
    }
  }

  return labelMap
}
