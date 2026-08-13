import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../utils/supabase'
import { requireAuthUser } from '../../../../utils/require-auth'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = z.string().uuid().parse(getRouterParam(event, 'id'))
  const supabase = getSupabaseAdminClient()

  const { data: target } = await supabase
    .from('note_folders')
    .select('id, parent_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .not('deleted_at', 'is', null)
    .maybeSingle()

  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'Pasta não encontrada na lixeira' })
  }

  // If the parent it lived in is also still deleted, restore to the root
  // instead of leaving it nested inside an invisible parent.
  let parentId = target.parent_id as string | null
  if (parentId) {
    const { data: parent } = await supabase
      .from('note_folders')
      .select('id')
      .eq('id', parentId)
      .is('deleted_at', null)
      .maybeSingle()
    if (!parent) parentId = null
  }

  // Restore the folder and every deleted descendant subfolder/note together —
  // mirrors the cascade used when soft-deleting (see folders/[id].delete.ts).
  const { data: allFolders } = await supabase
    .from('note_folders')
    .select('id, parent_id')
    .eq('user_id', user.id)

  const descendantFolderIds = collectDescendantFolderIds(id, allFolders ?? [])
  const restoredFolderIds = [id, ...descendantFolderIds]
  const now = new Date().toISOString()

  const { error: folderUpdateError } = await supabase
    .from('note_folders')
    .update({ deleted_at: null, parent_id: parentId, updated_at: now })
    .eq('id', id)
    .eq('user_id', user.id)

  if (folderUpdateError) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao restaurar pasta', data: folderUpdateError.message })
  }

  if (descendantFolderIds.length > 0) {
    const { error: descendantsError } = await supabase
      .from('note_folders')
      .update({ deleted_at: null, updated_at: now })
      .in('id', descendantFolderIds)
      .eq('user_id', user.id)

    if (descendantsError) {
      throw createError({ statusCode: 500, statusMessage: 'Erro ao restaurar subpastas', data: descendantsError.message })
    }
  }

  const { error: notesError } = await supabase
    .from('notes')
    .update({ deleted_at: null, updated_at: now })
    .in('folder_id', restoredFolderIds)
    .eq('user_id', user.id)
    .not('deleted_at', 'is', null)

  if (notesError) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao restaurar notas da pasta', data: notesError.message })
  }

  return { success: true }
})

function collectDescendantFolderIds(
  folderId: string,
  folders: { id: string, parent_id: string | null }[]
): string[] {
  const result: string[] = []
  const stack = [folderId]

  while (stack.length > 0) {
    const current = stack.pop() as string
    for (const folder of folders) {
      if (folder.parent_id === current) {
        result.push(folder.id)
        stack.push(folder.id)
      }
    }
  }

  return result
}
