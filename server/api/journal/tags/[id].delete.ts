import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = z.string().uuid().parse(getRouterParam(event, 'id'))
  const supabase = getSupabaseAdminClient()

  // journal_entry_tags has ON DELETE CASCADE on tag_id — this only removes
  // the tag and its links to entries, entry content is untouched.
  const { error } = await supabase
    .from('journal_tags')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao excluir tag', data: error.message })
  }

  return { success: true }
})
