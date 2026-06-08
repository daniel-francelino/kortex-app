import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'

const bodySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  color: z.string().max(20).optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = z.string().uuid().parse(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const payload = bodySchema.parse(body)
  const supabase = getSupabaseAdminClient()

  const updateData: Record<string, unknown> = {}
  if (payload.name !== undefined) updateData.name = payload.name
  if (payload.color !== undefined) updateData.color = payload.color

  const { data, error } = await supabase
    .from('knowledge_tags')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao atualizar tag', data: error.message })
  }

  return {
    id: data.id,
    userId: data.user_id,
    name: data.name,
    color: data.color ?? null,
    createdAt: data.created_at
  }
})
