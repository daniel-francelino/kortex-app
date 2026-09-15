import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'

const bodySchema = z.object({
  content: z.string().trim().min(1, 'Conteúdo é obrigatório').max(5000)
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID é obrigatório' })
  }

  const body = await readBody(event)
  const parsed = bodySchema.parse(body)

  const supabase = getSupabaseAdminClient()

  // Verify feedback belongs to user
  const { data: feedback, error: fetchError } = await supabase
    .from('feedbacks')
    .select('id, user_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !feedback) {
    throw createError({ statusCode: 404, statusMessage: 'Feedback não encontrado' })
  }


  const { data, error } = await supabase
    .from('feedback_responses')
    .insert({
      feedback_id: id,
      user_id: user.id,
      content: parsed.content,
      is_admin: false
    })
    .select()
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao adicionar resposta', data: error.message })
  }

  return data
})
