import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../utils/supabase'
import { requireAuthUser } from '../../../../utils/require-auth'
import { mapPeriodicNote } from '../../../../utils/journal-mappers'

const paramSchema = z.object({
  type: z.enum(['week', 'month']),
  key: z.string().min(4).max(20)
})

const bodySchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().max(200).nullable().optional(),
  content: z.string()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const params = paramSchema.parse(getRouterParams(event))
  const body = await readBody(event)
  const parsed = bodySchema.parse(body)

  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('journal_periodic_notes')
    .upsert({
      user_id: user.id,
      period_type: params.type,
      period_key: params.key,
      period_start: parsed.periodStart,
      period_end: parsed.periodEnd,
      title: parsed.title ?? null,
      content: parsed.content,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,period_type,period_key' })
    .select('*')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return mapPeriodicNote(data as Record<string, unknown>)
})
