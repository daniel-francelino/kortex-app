import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../utils/supabase'
import { requireAuthUser } from '../../../../utils/require-auth'
import { mapSchedulingPage } from '../../../../utils/scheduling'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = z.string().uuid().parse(getRouterParam(event, 'id'))
  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('scheduling_pages')
    .update({
      is_active: false,
      archived_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error || !data) {
    throw createError({ statusCode: 404, statusMessage: 'Página de agendamento não encontrada' })
  }

  return mapSchedulingPage(data as Record<string, unknown>)
})
