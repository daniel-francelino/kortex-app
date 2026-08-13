import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = z.string().uuid().parse(getRouterParam(event, 'id'))
  const supabase = getSupabaseAdminClient()

  // Soft delete — moves the note to the trash instead of removing it for
  // good. Permanent removal only happens from the trash (see
  // /api/notes/[id]/permanent.delete.ts).
  const { error } = await supabase
    .from('notes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .is('deleted_at', null)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao excluir nota', data: error.message })
  }

  return { success: true }
})
