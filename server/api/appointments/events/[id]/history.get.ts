import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../utils/supabase'
import { requireAuthUser } from '../../../../utils/require-auth'
import { parseOrThrow } from '../../../../utils/validation'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20)
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID do evento é obrigatório' })
  }

  const query = getQuery(event)
  const params = parseOrThrow(querySchema, query)

  const supabase = getSupabaseAdminClient()

  // Verify event ownership
  const { data: evt } = await supabase
    .from('events')
    .select('id')
    .eq('id', id)
    .eq('owner_user_id', user.id)
    .single()

  if (!evt) {
    throw createError({ statusCode: 404, statusMessage: 'Evento não encontrado' })
  }

  const from = (params.page - 1) * params.pageSize
  const to = from + params.pageSize - 1

  const { data, error, count } = await supabase
    .from('event_history')
    .select('*', { count: 'exact' })
    .eq('event_id', id)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return {
    data: data ?? [],
    total: count ?? 0,
    page: params.page,
    pageSize: params.pageSize
  }
})
