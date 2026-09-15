import { mapFeedback } from '../../utils/feedback-mappers'
import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  type: z.enum(['bug', 'suggestion', 'improvement', 'praise']).optional(),
  status: z.enum(['submitted', 'in_review', 'resolved', 'closed']).optional(),
  search: z.string().optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const query = getQuery(event)
  const params = querySchema.parse(query)

  const supabase = getSupabaseAdminClient()

  const from = (params.page - 1) * params.pageSize
  const to = from + params.pageSize - 1

  let qb = supabase
    .from('feedbacks')
    .select('*, feedback_attachments(*), feedback_responses(count)', { count: 'exact' })
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (params.type) qb = qb.eq('type', params.type)
  if (params.status) qb = qb.eq('status', params.status)
  if (params.search) qb = qb.or(`title.ilike.%${params.search}%,description.ilike.%${params.search}%`)

  const { data, error, count } = await qb

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao buscar feedbacks', data: error.message })
  }

  return {
    data: (data ?? []).map(mapFeedback),
    total: count ?? 0,
    page: params.page,
    pageSize: params.pageSize
  }
})
