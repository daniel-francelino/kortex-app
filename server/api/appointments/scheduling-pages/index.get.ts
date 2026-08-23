import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'
import { mapSchedulingPage } from '../../../utils/scheduling'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('scheduling_pages')
    .select('*')
    .eq('user_id', user.id)
    .is('archived_at', null)
    .order('created_at', { ascending: false })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao listar páginas de agendamento', data: error.message })
  }

  return (data ?? []).map(row => mapSchedulingPage(row as Record<string, unknown>))
})
