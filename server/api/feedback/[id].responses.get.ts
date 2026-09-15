import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50)
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID é obrigatório' })
  }

  const query = getQuery(event)
  const params = querySchema.parse(query)

  const supabase = getSupabaseAdminClient()

  const { data: owner } = await supabase.from('feedbacks').select('id').eq('id', id).eq('user_id', user.id).single()
  if (!owner) throw createError({ statusCode: 404, message: 'Feedback não encontrado.' })

  const from = (params.page - 1) * params.pageSize
  const to = from + params.pageSize - 1

  const { data, error, count } = await supabase
    .from('feedback_responses')
    .select('*', { count: 'exact' })
    .eq('feedback_id', id)
    .order('created_at', { ascending: true })
    .range(from, to)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao buscar respostas', data: error.message })
  }

  return {
    data: data ?? [],
    total: count ?? 0,
    page: params.page,
    pageSize: params.pageSize
  }
})
