import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('knowledge_tags')
    .select('*')
    .eq('user_id', user.id)
    .order('name', { ascending: true })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao buscar tags', data: error.message })
  }

  return (data ?? []).map((t: Record<string, unknown>) => ({
    id: t.id,
    userId: t.user_id,
    name: t.name,
    color: t.color ?? null,
    createdAt: t.created_at
  }))
})
