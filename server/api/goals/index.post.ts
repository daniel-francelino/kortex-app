import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { mapGoal } from '../../utils/goals'

const bodySchema = z.object({
  title: z.string().min(1, 'Título é obrigatório').max(200),
  description: z.string().max(2000).optional(),
  emoji: z.string().max(10).nullable().optional(),
  timeCategory: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'long_term']).default('monthly'),
  lifeCategory: z.enum(['personal', 'career', 'health', 'finance', 'spiritual', 'learning', 'relationships', 'lifestyle']).default('personal')
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody(event)
  const parsed = bodySchema.parse(body)

  const supabase = getSupabaseAdminClient()

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
      progress: 0
    })
    .select('*')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao criar meta', data: error.message })
  }

  return mapGoal(data as Record<string, unknown>)
})
