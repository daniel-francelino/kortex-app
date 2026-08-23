import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { mapGoal, calculateNumericProgress } from '../../utils/goals'

const bodySchema = z.object({
  title: z.string().min(1, 'Título é obrigatório').max(200),
  description: z.string().max(2000).optional(),
  emoji: z.string().max(10).nullable().optional(),
  timeCategory: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'long_term']).default('monthly'),
  lifeCategory: z.enum(['personal', 'career', 'health', 'finance', 'spiritual', 'learning', 'relationships', 'lifestyle']).default('personal'),
  progressType: z.enum(['tasks', 'numeric', 'monetary']).default('tasks'),
  targetValue: z.number().nullable().optional(),
  currentValue: z.number().default(0),
  unit: z.string().max(30).nullable().optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody(event)
  const parsed = bodySchema.parse(body)

  const supabase = getSupabaseAdminClient()

  const progress = parsed.progressType === 'tasks'
    ? 0
    : calculateNumericProgress(parsed.currentValue, parsed.targetValue)

  const { data, error } = await supabase
    .from('goals')
    .insert({
      user_id: user.id,
      title: parsed.title,
      description: parsed.description ?? null,
      emoji: parsed.emoji ?? null,
      time_category: parsed.timeCategory,
      life_category: parsed.lifeCategory,
      status: 'active',
      progress,
      progress_type: parsed.progressType,
      target_value: parsed.targetValue ?? null,
      current_value: parsed.currentValue,
      unit: parsed.unit ?? null
    })
    .select('*')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao criar meta', data: error.message })
  }

  return mapGoal(data as Record<string, unknown>)
})
