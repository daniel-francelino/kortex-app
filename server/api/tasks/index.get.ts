import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { resolveUserTimezone } from '../../utils/user-timezone'
import { todayInZone } from '#shared/utils/dateTime'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['pending', 'in_progress', 'completed', 'archived']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  listId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  dueBefore: z.string().optional(),
  tz: z.string().optional(),
  overdue: z.preprocess((value) => {
    if (value === undefined) return undefined
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (['true', '1', 'yes', 'on'].includes(normalized)) return true
      if (['false', '0', 'no', 'off'].includes(normalized)) return false
    }
    return value
  }, z.boolean()).optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const query = getQuery(event)
  const params = querySchema.parse(query)

  const supabase = getSupabaseAdminClient()

  const from = (params.page - 1) * params.pageSize
  const to = from + params.pageSize - 1

  let qb = supabase
    .from('tasks')
    .select('*, list:task_lists(*)', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (params.status) {
    qb = qb.eq('status', params.status)
  } else {
    // Default: exclude archived
    qb = qb.neq('status', 'archived')
  }

  if (params.priority) {
    qb = qb.eq('priority', params.priority)
  }

  if (params.listId) {
    qb = qb.eq('list_id', params.listId)
  }

  if (params.search) {
    qb = qb.ilike('title', `%${params.search}%`)
  }

  if (params.dueBefore) {
    qb = qb.lte('due_date', params.dueBefore)
  }

  if (params.overdue) {
    const timezone = await resolveUserTimezone(supabase, user.id, params.tz)
    const today = todayInZone(timezone)
    qb = qb.lt('due_date', today).neq('status', 'completed')
  }

  const { data, error, count } = await qb

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao buscar tarefas', data: error.message })
  }

  return {
    data: data ?? [],
    total: count ?? 0,
    page: params.page,
    pageSize: params.pageSize
  }
})
