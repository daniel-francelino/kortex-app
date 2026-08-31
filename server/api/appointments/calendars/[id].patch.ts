import { z } from 'zod'
import { randomBytes } from 'node:crypto'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'
import { parseOrThrow } from '../../../utils/validation'

const bodySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  color: z.string().max(20).nullable().optional(),
  visibility: z.enum(['private', 'shared', 'public']).optional(),
  subscribeEnabled: z.boolean().optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'ID do calendário é obrigatório' })
  }

  const body = await readBody(event)
  const payload = parseOrThrow(bodySchema, body)

  const supabase = getSupabaseAdminClient()

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString()
  }

  if (payload.name !== undefined) updateData.name = payload.name
  if (payload.description !== undefined) updateData.description = payload.description
  if (payload.color !== undefined) updateData.color = payload.color
  if (payload.visibility !== undefined) updateData.visibility = payload.visibility
  if (payload.subscribeEnabled !== undefined) updateData.subscribe_enabled = payload.subscribeEnabled

  // Generate the subscribe token on first enable
  if (payload.subscribeEnabled === true) {
    const { data: existing } = await supabase
      .from('calendars')
      .select('subscribe_token')
      .eq('id', id)
      .eq('owner_user_id', user.id)
      .maybeSingle()

    if (!existing?.subscribe_token) {
      updateData.subscribe_token = randomBytes(24).toString('base64url')
    }
  }

  const { data, error } = await supabase
    .from('calendars')
    .update(updateData)
    .eq('id', id)
    .eq('owner_user_id', user.id)
    .select()
    .single()

  if (error || !data) {
    throw createError({ statusCode: 404, statusMessage: 'Calendário não encontrado' })
  }

  return data
})
