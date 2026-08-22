import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { mapMetricValue } from '../../utils/journal-mappers'

const valueSchema = z.object({
  metricKey: z.string().min(1),
  numberValue: z.number().nullable().optional(),
  booleanValue: z.boolean().nullable().optional(),
  textValue: z.string().nullable().optional(),
  selectValue: z.string().nullable().optional()
})

const bodySchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  values: z.array(valueSchema).min(1)
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody(event)
  const parsed = bodySchema.parse(body)

  const supabase = getSupabaseAdminClient()

  // Resolve metric keys to definition ids
  const { data: definitions } = await supabase
    .from('metric_definitions')
    .select('id, key')
    .eq('user_id', user.id)
    .eq('is_active', true)

  const defMap = new Map<string, string>()
  for (const d of (definitions ?? []) as Array<Record<string, unknown>>) {
    defMap.set(d.key as string, d.id as string)
  }

  const results: unknown[] = []

  for (const val of parsed.values) {
    const defId = defMap.get(val.metricKey)
    if (!defId) continue

    const { data, error } = await supabase
      .from('metric_values')
      .upsert({
        user_id: user.id,
        entry_date: parsed.entryDate,
        metric_definition_id: defId,
        number_value: val.numberValue ?? null,
        boolean_value: val.booleanValue ?? null,
        text_value: val.textValue ?? null,
        select_value: val.selectValue ?? null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,entry_date,metric_definition_id' })
      .select('*')
      .single()

    if (!error && data) {
      results.push(mapMetricValue(data))
    }
  }

  return results
})
