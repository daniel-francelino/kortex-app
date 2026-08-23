import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'
import { mapGoalReflection } from '../../../utils/goals'

const paramsSchema = z.object({
  id: z.string().uuid()
})

const querySchema = z.object({
  weekKey: z.string().regex(/^\d{4}-W\d{2}$/, 'Formato deve ser YYYY-Wnn')
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const { id: goalId } = paramsSchema.parse(getRouterParams(event))
  const { weekKey } = querySchema.parse(getQuery(event))

  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('goal_reflections')
    .select('*')
    .eq('user_id', user.id)
    .eq('goal_id', goalId)
    .eq('week_key', weekKey)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao buscar reflexão', data: error.message })
  }

  return mapGoalReflection(data)
})
