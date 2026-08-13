import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = z.string().uuid().parse(getRouterParam(event, 'id'))
  const supabase = getSupabaseAdminClient()

  const { data: note } = await supabase
    .from('notes')
    .select('id, folder_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .not('deleted_at', 'is', null)
    .maybeSingle()

  if (!note) {
    throw createError({ statusCode: 404, statusMessage: 'Nota não encontrada na lixeira' })
  }

  // If the folder it lived in is also still deleted, restore to the root
  // instead of leaving the note stuck inside an invisible folder.
  let folderId = note.folder_id as string | null
  if (folderId) {
    const { data: folder } = await supabase
      .from('note_folders')
      .select('id')
      .eq('id', folderId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!folder) folderId = null
  }

  const { data, error } = await supabase
    .from('notes')
    .update({ deleted_at: null, folder_id: folderId, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao restaurar nota', data: error.message })
  }

  return {
    id: data.id,
    userId: data.user_id,
    title: data.title,
    content: data.content ?? null,
    type: data.type,
    pinned: data.pinned,
    pinnedAt: data.pinned_at ?? null,
    icon: data.icon ?? null,
    position: data.position ?? 0,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    folderId: data.folder_id ?? null,
    visibility: data.visibility ?? 'private',
    shareToken: data.share_token ?? null
  }
})
