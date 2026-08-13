import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('note_folders')
    .select('id, user_id, name, parent_id, position, is_expanded, created_at, updated_at')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('name')

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao buscar pastas', data: error.message })
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    parentId: row.parent_id ?? null,
    position: (row.position as number) ?? 0,
    isExpanded: (row.is_expanded as boolean) ?? true,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }))
})
