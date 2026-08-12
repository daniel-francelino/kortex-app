import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../utils/supabase'
import { requireAuthUser } from '../../../../utils/require-auth'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const noteId = z.string().uuid().parse(getRouterParam(event, 'id'))
  const shareId = z.string().uuid().parse(getRouterParam(event, 'shareId'))
  const supabase = getSupabaseAdminClient()

  const { error } = await supabase
    .from('note_shares')
    .delete()
    .eq('id', shareId)
    .eq('note_id', noteId)
    .eq('owner_id', user.id)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao remover acesso', data: error.message })
  }

  return { success: true }
})
