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

  const pageIds = (data ?? []).map(row => row.id as string)
  const countsByPage = new Map<string, number>()

  if (pageIds.length > 0) {
    const { data: bookingRows } = await supabase
      .from('bookings')
      .select('scheduling_page_id')
      .in('scheduling_page_id', pageIds)
      .neq('status', 'cancelled')

    for (const row of bookingRows ?? []) {
      const pageId = row.scheduling_page_id as string
      countsByPage.set(pageId, (countsByPage.get(pageId) ?? 0) + 1)
    }
  }

  return (data ?? []).map(row => mapSchedulingPage({
    ...(row as Record<string, unknown>),
    bookingsCount: countsByPage.get(row.id as string) ?? 0
  }))
})
