import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = z.string().uuid().parse(getRouterParam(event, 'id'))
  const supabase = getSupabaseAdminClient()

  // Only callable from the trash — a note must already be soft-deleted before
  // it can be removed for good, so this can never be used to bypass the trash.
  const { data: target } = await supabase
    .from('notes')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .not('deleted_at', 'is', null)
    .maybeSingle()

  if (!target) {
    throw createError({ statusCode: 404, statusMessage: 'Nota não encontrada na lixeira' })
  }

  // Tags and links are removed via CASCADE
  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao excluir nota permanentemente', data: error.message })
  }

  return { success: true }
})
