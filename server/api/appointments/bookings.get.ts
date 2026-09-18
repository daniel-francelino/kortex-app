import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { mapBooking } from '../../utils/scheduling'

// All of the user's bookings across every scheduling page, for
// /app/appointments/bookings — the per-page list stays at
// scheduling-pages/[id]/bookings.get.ts.
export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const supabase = getSupabaseAdminClient()

  const { data: pageRows, error: pagesError } = await supabase
    .from('scheduling_pages')
    .select('id')
    .eq('user_id', user.id)

  if (pagesError) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao listar reservas', data: pagesError.message })
  }

  const pageIds = (pageRows ?? []).map(row => row.id as string)
  if (pageIds.length === 0) return []

  const { data, error } = await supabase
    .from('bookings')
    .select('*, event:events(start_at, end_at)')
    .in('scheduling_page_id', pageIds)
    .order('created_at', { ascending: false })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao listar reservas', data: error.message })
  }

  return (data ?? []).map(row => mapBooking(row as Record<string, unknown>))
})
