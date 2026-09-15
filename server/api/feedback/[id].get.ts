import { mapFeedback } from '../../utils/feedback-mappers'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID é obrigatório' })
  }

  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('feedbacks')
    .select('*, feedback_attachments(*), feedback_responses(*), feedback_entity_links(*)')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !data) {
    throw createError({ statusCode: 404, statusMessage: 'Feedback não encontrado' })
  }

  return mapFeedback(data)
})
