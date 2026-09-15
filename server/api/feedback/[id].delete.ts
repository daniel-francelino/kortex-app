import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID é obrigatório' })
  }

  const supabase = getSupabaseAdminClient()

  const { data: feedback } = await supabase.from('feedbacks').select('id, feedback_attachments(storage_path)').eq('id', id).eq('user_id', user.id).eq('status', 'submitted').single()
  if (!feedback) throw createError({ statusCode: 404, message: 'Feedback não encontrado ou já está em análise.' })
  const paths = (feedback.feedback_attachments ?? []).map((file: { storage_path: string | null }) => file.storage_path).filter((path: string | null): path is string => !!path)
  const { error, data: deleted } = await supabase
    .from('feedbacks')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)
    .eq('status', 'submitted')
    .select('id')

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao excluir feedback', data: error.message })
  }

  if (!deleted?.length) throw createError({ statusCode: 409, message: 'O feedback foi atualizado. Recarregue antes de excluir.' })
  if (paths.length) {
    const { error: cleanupError } = await supabase.storage.from('feedback-attachments').remove(paths)
    if (cleanupError) console.error('Feedback attachment cleanup failed', { id, cleanupError })
  }
  return { success: true }
})
