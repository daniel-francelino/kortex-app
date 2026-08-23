import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'

const entityTypes = ['habit', 'goal', 'task', 'event', 'journal_entry'] as const

const bodySchema = z.object({
  sourceType: z.enum(entityTypes),
  sourceId: z.string().uuid(),
  targetType: z.enum(entityTypes),
  targetId: z.string().uuid()
}).refine(
  d => !(d.sourceType === d.targetType && d.sourceId === d.targetId),
  { message: 'Não é possível vincular uma entidade a ela mesma' }
)

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody(event)
  const parsed = bodySchema.parse(body)

  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('entity_links')
    .insert({
      user_id: user.id,
      source_type: parsed.sourceType,
      source_id: parsed.sourceId,
      target_type: parsed.targetType,
      target_id: parsed.targetId
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'Vínculo já existe' })
    }
    throw createError({ statusCode: 500, statusMessage: 'Falha ao criar vínculo', data: error.message })
  }

  const row = data as Record<string, unknown>

  return {
    id: row.id,
    userId: row.user_id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    targetType: row.target_type,
    targetId: row.target_id,
    createdAt: row.created_at
  }
})
