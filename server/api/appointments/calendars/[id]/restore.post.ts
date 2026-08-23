import { getSupabaseAdminClient } from '../../../../utils/supabase'
import { requireAuthUser } from '../../../../utils/require-auth'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID do calendário é obrigatório' })
  }

  const supabase = getSupabaseAdminClient()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('calendars')
    .update({
      archived_at: null,
      updated_at: now
    })
    .eq('id', id)
    .eq('owner_user_id', user.id)
    .not('archived_at', 'is', null)
    .select()
    .single()

  if (error || !data) {
    throw createError({ statusCode: 404, statusMessage: 'Calendário arquivado não encontrado' })
  }

  return data
})
