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

  // New folders are placed at the top of the custom order among their siblings.
  let lowestQuery = supabase
    .from('note_folders')
    .select('position')
    .eq('user_id', user.id)

  lowestQuery = payload.parentId
    ? lowestQuery.eq('parent_id', payload.parentId)
    : lowestQuery.is('parent_id', null)

  const { data: lowest } = await lowestQuery
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle()

  const position = lowest ? (lowest.position as number) - 1000 : 0

  const { data, error } = await supabase
    .from('note_folders')
    .insert({ user_id: user.id, name: payload.name, parent_id: payload.parentId ?? null, position })
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
    position: data.position ?? 0,
    isExpanded: data.is_expanded ?? true,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  }
})
