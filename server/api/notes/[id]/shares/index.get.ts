import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../utils/supabase'
import { requireAuthUser } from '../../../../utils/require-auth'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const noteId = z.string().uuid().parse(getRouterParam(event, 'id'))
  const supabase = getSupabaseAdminClient()

  const { data: note } = await supabase
    .from('notes')
    .select('id')
    .eq('id', noteId)
    .eq('user_id', user.id)
    .single()

  if (!note) {
    throw createError({ statusCode: 404, statusMessage: 'Nota não encontrada' })
  }

  const { data, error } = await supabase
    .from('note_shares')
    .select('*')
    .eq('note_id', noteId)
    .order('created_at', { ascending: true })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao listar acessos', data: error.message })
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    noteId: row.note_id as string,
    ownerId: row.owner_id as string,
    sharedWithUserId: (row.shared_with_user_id as string) ?? null,
    sharedWithEmail: row.shared_with_email as string,
    permission: row.permission as string,
    status: row.status as string,
    createdAt: row.created_at as string
  }))
})
