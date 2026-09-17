import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../utils/supabase'
import { requireAuthUser } from '../../../../utils/require-auth'
import { isValidUsernameFormat } from '../../../../utils/username'
import { parseOrThrow } from '../../../../utils/validation'

const paramsSchema = z.object({
  id: z.string().uuid()
})

const querySchema = z.object({
  value: z.string().min(1).max(100)
})

/**
 * Live availability check for the "URL" field in the scheduling-page editor
 * — mirrors /api/auth/username/check.get.ts, but scoped to this one user's
 * own pages (slugs are only unique per user, not globally). The PATCH
 * endpoint re-validates on save regardless — this is purely UX, not the
 * source of truth. See docs/appointments/PLANO_USERNAME_PERFIL_PUBLICO.md §6.2.
 */
export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const { id } = parseOrThrow(paramsSchema, getRouterParams(event))
  const { value } = querySchema.parse(getQuery(event))
  const normalized = value.trim().toLowerCase()

  if (!isValidUsernameFormat(normalized)) {
    return { available: false, reason: 'format' }
  }

  const supabase = getSupabaseAdminClient()
  const { data } = await supabase
    .from('scheduling_pages')
    .select('id')
    .eq('user_id', user.id)
    .eq('slug', normalized)
    .neq('id', id)
    .maybeSingle()

  if (data) {
    return { available: false, reason: 'taken' }
  }

  return { available: true }
})
