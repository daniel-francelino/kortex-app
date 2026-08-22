import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'
import { mapMetricDefinition } from '../../../utils/journal-mappers'

const paramSchema = z.object({
  id: z.string().uuid()
})

const bodySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
  minValue: z.number().nullable().optional(),
  maxValue: z.number().nullable().optional(),
  step: z.number().nullable().optional(),
  options: z.array(z.string()).nullable().optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const { id } = paramSchema.parse(getRouterParams(event))
  const body = await readBody(event)
  const parsed = bodySchema.parse(body)

  const supabase = getSupabaseAdminClient()

  // Verify ownership
  const { data: existing } = await supabase
    .from('metric_definitions')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Métrica não encontrada' })
  }

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  }

  if (parsed.name !== undefined) updateData.name = parsed.name
  if (parsed.description !== undefined) updateData.description = parsed.description
  if (parsed.isActive !== undefined) updateData.is_active = parsed.isActive
  if (parsed.minValue !== undefined) updateData.min_value = parsed.minValue
  if (parsed.maxValue !== undefined) updateData.max_value = parsed.maxValue
  if (parsed.step !== undefined) updateData.step = parsed.step
  if (parsed.options !== undefined) updateData.options = parsed.options

  const { data, error } = await supabase
    .from('metric_definitions')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return mapMetricDefinition(data)
})
