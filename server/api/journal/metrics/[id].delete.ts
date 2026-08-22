import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = z.string().uuid().parse(getRouterParam(event, 'id'))
  const supabase = getSupabaseAdminClient()

  // metric_values has ON DELETE CASCADE on metric_definition_id — deleting a
  // definition also permanently deletes every value ever recorded for it,
  // not just the definition itself. The client confirms this explicitly
  // before calling here.
  const { error } = await supabase
    .from('metric_definitions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao excluir métrica', data: error.message })
  }

  return { success: true }
})
