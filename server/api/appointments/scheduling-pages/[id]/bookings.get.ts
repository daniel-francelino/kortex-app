import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../utils/supabase'
import { requireAuthUser } from '../../../../utils/require-auth'
import { mapBooking } from '../../../../utils/scheduling'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = z.string().uuid().parse(getRouterParam(event, 'id'))
  const supabase = getSupabaseAdminClient()

  const { data: page } = await supabase
    .from('scheduling_pages')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!page) {
    throw createError({ statusCode: 404, statusMessage: 'Página de agendamento não encontrada' })
  }

  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('scheduling_page_id', id)
    .order('created_at', { ascending: false })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao listar reservas', data: error.message })
  }

  return (data ?? []).map(row => mapBooking(row as Record<string, unknown>))
})
