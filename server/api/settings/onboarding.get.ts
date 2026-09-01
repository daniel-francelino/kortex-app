import { requireAuthUser } from '../../utils/require-auth'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { getDefaultOnboardingState, parseOnboardingState } from '../../utils/onboarding'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('user_preferences')
    .select('onboarding_state, timezone')
    .eq('user_id', user.id)
    .single()

  if (error && error.code !== 'PGRST116') {
    throw createError({
      statusCode: 500,
      statusMessage: 'Não foi possível carregar o onboarding'
    })
  }

  return {
    onboarding: data ? parseOnboardingState(data.onboarding_state) : getDefaultOnboardingState(),
    // Passed through as-is (not coerced to 'UTC') — see
    // docs/timezone/ANALISE_TIMEZONE.md, Regra 2: `null` here has to reach
    // the client genuinely, or nothing can tell "never chosen" apart from
    // "explicitly UTC" and the one-time browser auto-fill never fires.
    timezone: data?.timezone ?? null
  }
})
