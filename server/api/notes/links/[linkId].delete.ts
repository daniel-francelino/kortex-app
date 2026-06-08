import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const linkId = z.string().uuid().parse(getRouterParam(event, 'linkId'))
  const supabase = getSupabaseAdminClient()

  // Verify link belongs to user's note
  const { data: link } = await supabase
    .from('note_links')
    .select('id, source_note_id')
    .eq('id', linkId)
    .single()

  if (!link) {
    throw createError({ statusCode: 404, statusMessage: 'Vínculo não encontrado' })
  }

  const { data: note } = await supabase
    .from('knowledge_notes')
    .select('id')
    .eq('id', link.source_note_id)
    .eq('user_id', user.id)
    .single()

  if (!note) {
    throw createError({ statusCode: 403, statusMessage: 'Sem permissão para remover este vínculo' })
  }

  const { error } = await supabase
    .from('note_links')
    .delete()
    .eq('id', linkId)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao remover vínculo', data: error.message })
  }

  return { success: true }
})
