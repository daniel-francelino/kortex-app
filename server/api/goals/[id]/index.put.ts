import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'
import { mapGoal, calculateNumericProgress } from '../../../utils/goals'

const paramsSchema = z.object({
  id: z.string().uuid()
})

const bodySchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  emoji: z.string().max(10).nullable().optional(),
  timeCategory: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'long_term']).optional(),
  lifeCategory: z.enum(['personal', 'career', 'health', 'finance', 'spiritual', 'learning', 'relationships', 'lifestyle']).optional(),
  status: z.enum(['active', 'completed', 'archived']).optional(),
  progressType: z.enum(['tasks', 'numeric', 'monetary']).optional(),
  targetValue: z.number().nullable().optional(),
  currentValue: z.number().optional(),
  unit: z.string().max(30).nullable().optional(),
  coverImageUrl: z.string().max(2000).nullable().optional()
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

  const touchesProgressValue = parsed.progressType !== undefined || parsed.targetValue !== undefined || parsed.currentValue !== undefined
  if (parsed.progressType !== undefined) updateData.progress_type = parsed.progressType
  if (parsed.targetValue !== undefined) updateData.target_value = parsed.targetValue
  if (parsed.currentValue !== undefined) updateData.current_value = parsed.currentValue
  if (parsed.unit !== undefined) updateData.unit = parsed.unit
  if (parsed.coverImageUrl !== undefined) updateData.cover_image_url = parsed.coverImageUrl

  if (touchesProgressValue) {
    const { data: existing } = await supabase
      .from('goals')
      .select('progress_type, target_value, current_value')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    const effectiveType = parsed.progressType ?? existing?.progress_type ?? 'tasks'
    if (effectiveType !== 'tasks') {
      const effectiveTarget = parsed.targetValue !== undefined ? parsed.targetValue : existing?.target_value ?? null
      const effectiveCurrent = parsed.currentValue !== undefined ? parsed.currentValue : Number(existing?.current_value ?? 0)
      updateData.progress = calculateNumericProgress(effectiveCurrent, effectiveTarget)
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
