import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'
import { mapGoal } from '../../../utils/goals'

const paramsSchema = z.object({
  id: z.string().uuid()
})

const bodySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  emoji: z.string().max(10).nullable().optional(),
  timeCategory: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'long_term']).optional(),
  lifeCategory: z.enum(['personal', 'career', 'health', 'finance', 'spiritual', 'learning', 'relationships', 'lifestyle']).optional(),
  status: z.enum(['active', 'completed', 'archived']).optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const { id } = paramsSchema.parse(getRouterParams(event))
  const body = await readBody(event)
  const parsed = bodySchema.parse(body)

  const supabase = getSupabaseAdminClient()

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (parsed.title !== undefined) updateData.title = parsed.title
  if (parsed.description !== undefined) updateData.description = parsed.description
  if (parsed.emoji !== undefined) updateData.emoji = parsed.emoji
  if (parsed.timeCategory !== undefined) updateData.time_category = parsed.timeCategory
  if (parsed.lifeCategory !== undefined) updateData.life_category = parsed.lifeCategory
  if (parsed.status !== undefined) {
    updateData.status = parsed.status
    if (parsed.status === 'archived') {
      updateData.archived_at = new Date().toISOString()
    } else {
      updateData.archived_at = null
    }
  }

  const { data, error } = await supabase
    .from('goals')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error || !data) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao atualizar meta', data: error?.message })
  }

  return mapGoal(data as Record<string, unknown>)
})
