import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { mapMetricDefinition } from '../../utils/journal-mappers'

const bodySchema = z.object({
  key: z.string().min(1).max(50).regex(/^[a-z0-9_]+$/),
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  type: z.enum(['number', 'scale', 'boolean', 'select', 'text']),
  unit: z.string().max(50).nullable().optional(),
  minValue: z.number().nullable().optional(),
  maxValue: z.number().nullable().optional(),
  step: z.number().nullable().optional(),
  options: z.array(z.string()).nullable().optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody(event)
  const parsed = bodySchema.parse(body)

  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('metric_definitions')
    .insert({
      user_id: user.id,
      key: parsed.key,
      name: parsed.name,
      description: parsed.description ?? null,
      type: parsed.type,
      unit: parsed.unit ?? null,
      min_value: parsed.minValue ?? null,
      max_value: parsed.maxValue ?? null,
      step: parsed.step ?? null,
      options: parsed.options ?? null
    })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'Essa métrica já existe.' })
    }
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return mapMetricDefinition(data)
})
