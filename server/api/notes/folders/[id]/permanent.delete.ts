import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../utils/supabase'
import { requireAuthUser } from '../../../../utils/require-auth'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = z.string().uuid().parse(getRouterParam(event, 'id'))
  const supabase = getSupabaseAdminClient()

  // Only callable from the trash — a folder must already be soft-deleted
  // before it can be removed for good.
  const { data: target } = await supabase
    .from('note_folders')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .not('deleted_at', 'is', null)
    .maybeSingle()

  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'Pasta não encontrada na lixeira' })
  }

  // Subfolders (parent_id ON DELETE CASCADE) and notes inside them
  // (folder_id ON DELETE CASCADE) are removed automatically.
  const { error } = await supabase
    .from('note_folders')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao excluir pasta permanentemente', data: error.message })
  }

  return { success: true }
})
