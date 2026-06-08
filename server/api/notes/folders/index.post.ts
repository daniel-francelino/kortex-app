import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'

const bodySchema = z.object({
  name: z.string().min(1).max(200),
  parentId: z.string().uuid().nullable().optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody(event)
  const payload = bodySchema.parse(body)
  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('note_folders')
    .insert({ user_id: user.id, name: payload.name, parent_id: payload.parentId ?? null })
    .select()
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao criar pasta', data: error.message })
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
