import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'

const bodySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  parentId: z.string().uuid().nullable().optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = z.string().uuid().parse(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const payload = bodySchema.parse(body)
  const supabase = getSupabaseAdminClient()

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (payload.name !== undefined) updateData.name = payload.name
  if (payload.parentId !== undefined) updateData.parent_id = payload.parentId

  const { data, error } = await supabase
    .from('knowledge_folders')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao atualizar pasta', data: error.message })
  }

  return {
    id: data.id,
    userId: data.user_id,
    name: data.name,
    parentId: data.parent_id ?? null,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  }
})
