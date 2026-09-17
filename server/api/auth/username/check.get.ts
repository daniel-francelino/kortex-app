import { z } from 'zod'
import { requireAuthUser } from '../../../utils/require-auth'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { isReservedUsername } from '../../../utils/reserved-usernames'
import { isValidUsernameFormat } from '../../../utils/username'

const querySchema = z.object({
  value: z.string().min(1).max(100)
})

/** Live availability check for the Settings username field — debounced on
 * the client (docs/appointments/PLANO_USERNAME_PERFIL_PUBLICO.md §5.3). Auth
 * required only so the current user's own username doesn't come back as
 * "taken" when they re-save without changing it. */
export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const { value } = querySchema.parse(getQuery(event))
  const normalized = value.trim().toLowerCase()

  if (!isValidUsernameFormat(normalized)) {
    return { available: false, reason: 'format' }
  }

  if (isReservedUsername(normalized)) {
    return { available: false, reason: 'reserved' }
  }

  const supabase = getSupabaseAdminClient()
  // `username` is always stored lowercased (see the migration comment on
  // idx_user_preferences_username_lower), so a plain `eq` on the normalized
  // value is exact — no need for a pattern-matching `ilike` here.
  const { data } = await supabase
    .from('user_preferences')
    .select('user_id')
    .eq('username', normalized)
    .neq('user_id', user.id)
    .maybeSingle()

  if (data) {
    return { available: false, reason: 'taken' }
  }

  return { available: true }
})
