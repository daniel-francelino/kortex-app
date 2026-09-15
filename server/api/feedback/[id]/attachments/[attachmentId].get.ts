import { getSupabaseAdminClient } from '../../../../utils/supabase'
import { requireAuthUser } from '../../../../utils/require-auth'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = getRouterParam(event, 'id')
  const attachmentId = getRouterParam(event, 'attachmentId')
  const supabase = getSupabaseAdminClient()
  const { data: feedback } = await supabase.from('feedbacks').select('id').eq('id', id).eq('user_id', user.id).single()
  if (!feedback) throw createError({ statusCode: 404, message: 'Feedback não encontrado.' })
  const { data: file } = await supabase.from('feedback_attachments').select('storage_path, file_name').eq('id', attachmentId).eq('feedback_id', id).single()
  if (!file?.storage_path) throw createError({ statusCode: 404, message: 'Anexo não encontrado.' })
  const { data, error } = await supabase.storage.from('feedback-attachments').createSignedUrl(file.storage_path, 60, { download: file.file_name })
  if (error || !data) throw createError({ statusCode: 500, message: 'Não foi possível abrir o anexo.' })
  setHeader(event, 'Cache-Control', 'private, no-store')
  return sendRedirect(event, data.signedUrl, 302)
})
