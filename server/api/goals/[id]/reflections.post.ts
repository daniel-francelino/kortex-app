import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'
import { mapGoalReflection } from '../../../utils/goals'

const paramsSchema = z.object({
  id: z.string().uuid()
})

const bodySchema = z.object({
  weekKey: z.string().regex(/^\d{4}-W\d{2}$/, 'Formato deve ser YYYY-Wnn'),
  stillRelevant: z.boolean().optional(),
  notes: z.string().max(2000).optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const { id: goalId } = paramsSchema.parse(getRouterParams(event))
  const body = await readBody(event)
  const parsed = bodySchema.parse(body)

  const supabase = getSupabaseAdminClient()

  // Verify goal ownership
  const { data: goal, error: goalError } = await supabase
    .from('goals')
    .select('id')
    .eq('id', goalId)
    .eq('user_id', user.id)
    .single()

  if (goalError || !goal) {
    throw createError({ statusCode: 404, statusMessage: 'Meta não encontrada' })
  }

  const { data, error } = await supabase
    .from('goal_reflections')
    .upsert(
      {
        user_id: user.id,
        goal_id: goalId,
        week_key: parsed.weekKey,
        still_relevant: parsed.stillRelevant ?? null,
        notes: parsed.notes ?? null,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'user_id,goal_id,week_key' }
    )
    .select('*')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao salvar reflexão', data: error.message })
  }

  return mapGoalReflection(data)
})
