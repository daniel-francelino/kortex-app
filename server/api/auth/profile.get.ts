import { requireAuthUser } from '../../utils/require-auth'
import { getSupabaseAdminClient } from '../../utils/supabase'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const supabase = getSupabaseAdminClient()

  // username/bio live in user_preferences (not user_metadata) — see
  // docs/appointments/PLANO_USERNAME_PERFIL_PUBLICO.md §4. A brand new
  // account may not have a row there yet (PGRST116 = no rows), same
  // "no row yet" case /api/settings/preferences already handles.
  const { data: prefs } = await supabase
    .from('user_preferences')
    .select('username, bio')
    .eq('user_id', user.id)
    .maybeSingle()

  return {
    id: user.id,
    email: user.email,
    name: user.user_metadata?.name || '',
    avatar_url: user.user_metadata?.avatar_url || '',
    username: prefs?.username ?? null,
    bio: prefs?.bio ?? ''
  }
})
