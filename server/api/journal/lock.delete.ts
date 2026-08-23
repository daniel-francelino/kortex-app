import { requireAuthUser } from '../../utils/require-auth'
import { getSupabaseAdminClient } from '../../utils/supabase'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const supabase = getSupabaseAdminClient()

  const { error } = await supabase
    .from('user_preferences')
    .update({
      journal_pin_hash: null,
      journal_pin_salt: null,
      journal_pin_mode: null,
      journal_pin_failed_attempts: 0,
      journal_pin_locked_until: null
    })
    .eq('user_id', user.id)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível desativar o PIN.' })
  }

  return { ok: true }
})
