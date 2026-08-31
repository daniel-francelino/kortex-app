import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'
import { mapSchedulingPage } from '../../../utils/scheduling'
import { parseOrThrow } from '../../../utils/validation'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = parseOrThrow(z.string().uuid(), getRouterParam(event, 'id'))
  const supabase = getSupabaseAdminClient()

  const { data: page, error } = await supabase
    .from('scheduling_pages')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !page) {
    throw createError({ statusCode: 404, statusMessage: 'Página de agendamento não encontrada' })
  }

  const [{ data: rules }, { data: questions }] = await Promise.all([
    supabase
      .from('scheduling_availability_rules')
      .select('*')
      .eq('scheduling_page_id', id)
      .order('day_of_week', { ascending: true }),
    supabase
      .from('scheduling_questions')
      .select('*')
      .eq('scheduling_page_id', id)
      .order('sort_order', { ascending: true })
  ])

  return mapSchedulingPage({
    ...(page as Record<string, unknown>),
    availabilityRules: rules ?? [],
    questions: questions ?? []
  })
})
