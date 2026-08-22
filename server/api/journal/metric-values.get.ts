import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { mapMetricValue } from '../../utils/journal-mappers'

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  metricKey: z.string().optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const query = getQuery(event)
  const params = querySchema.parse(query)

  const supabase = getSupabaseAdminClient()

  let queryBuilder = supabase
    .from('metric_values')
    .select('*, definition:metric_definitions(*)')
    .eq('user_id', user.id)
    .order('entry_date', { ascending: false })

  if (params.from) {
    queryBuilder = queryBuilder.gte('entry_date', params.from)
  }
  if (params.to) {
    queryBuilder = queryBuilder.lte('entry_date', params.to)
  }
  if (params.metricKey) {
    // Need to filter by metric key via definition
    const { data: def } = await supabase
      .from('metric_definitions')
      .select('id')
      .eq('user_id', user.id)
      .eq('key', params.metricKey)
      .single()

    if (def) {
      const defId = (def as Record<string, unknown>).id as string
      queryBuilder = queryBuilder.eq('metric_definition_id', defId)
    } else {
      return []
    }
  }

  const { data, error } = await queryBuilder

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return (data ?? []).map(mapMetricValue)
})
