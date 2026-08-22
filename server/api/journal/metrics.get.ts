import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { mapMetricDefinition } from '../../utils/journal-mappers'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('metric_definitions')
    .select('*')
    .eq('user_id', user.id)
    .order('name', { ascending: true })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return (data ?? []).map(mapMetricDefinition)
})
