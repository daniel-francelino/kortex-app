import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = z.string().uuid().parse(getRouterParam(event, 'id'))
  const supabase = getSupabaseAdminClient()

  const { data: target } = await supabase
    .from('note_folders')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .maybeSingle()

  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'Pasta não encontrada' })
  }

  // Soft delete — the folder and every descendant subfolder/note move to the
  // trash together, mirroring the cascade the frontend already computes for
  // the "this will also delete N notes/subfolders" confirmation.
  const { data: allFolders } = await supabase
    .from('note_folders')
    .select('id, parent_id')
    .eq('user_id', user.id)
    .is('deleted_at', null)

  const descendantFolderIds = collectDescendantFolderIds(id, allFolders ?? [])
  const removedFolderIds = [id, ...descendantFolderIds]
  const now = new Date().toISOString()

  const { error: foldersError } = await supabase
    .from('note_folders')
    .update({ deleted_at: now })
    .in('id', removedFolderIds)
    .eq('user_id', user.id)

  if (foldersError) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao excluir pasta', data: foldersError.message })
  }

  const { error: notesError } = await supabase
    .from('notes')
    .update({ deleted_at: now })
    .in('folder_id', removedFolderIds)
    .eq('user_id', user.id)
    .is('deleted_at', null)

  if (notesError) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao excluir notas da pasta', data: notesError.message })
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
