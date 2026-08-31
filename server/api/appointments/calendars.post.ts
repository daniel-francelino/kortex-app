import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { parseOrThrow } from '../../utils/validation'

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z.string().max(20).optional(),
  visibility: z.enum(['private', 'shared', 'public']).default('private')
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody(event)
  const payload = parseOrThrow(bodySchema, body)

  const supabase = getSupabaseAdminClient()

  const insertRow: Record<string, unknown> = {
    owner_user_id: user.id,
    name: payload.name,
    description: payload.description ?? null,
    color: payload.color ?? null,
    visibility: payload.visibility
  }
  if (payload.id) insertRow.id = payload.id

  const { data, error } = await supabase
    .from('calendars')
    .insert(insertRow)
    .select()
    .single()

  // Same replay-safety as events.post.ts: a client-supplied id lets a
  // retried offline-queued create return the already-created row instead of
  // erroring, rather than risking a duplicate calendar.
  if (error?.code === '23505' && payload.id) {
    const { data: existing, error: fetchError } = await supabase
      .from('calendars')
      .select()
      .eq('id', payload.id)
      .eq('owner_user_id', user.id)
      .single()

    if (existing) {
      setResponseStatus(event, 201)
      return existing
    }
    if (fetchError) {
      throw createError({ statusCode: 500, statusMessage: fetchError.message })
    }
  }

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  setResponseStatus(event, 201)
  return data
})
