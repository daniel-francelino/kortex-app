import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'

const bodySchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(100),
  color: z.string().max(20).optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody(event)
  const payload = bodySchema.parse(body)
  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('knowledge_tags')
    .insert({
      user_id: user.id,
      name: payload.name,
      color: payload.color ?? null
    })
    .select()
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao criar tag', data: error.message })
  }

  return {
    id: data.id,
    userId: data.user_id,
    name: data.name,
    color: data.color ?? null,
    createdAt: data.created_at
  }
})
