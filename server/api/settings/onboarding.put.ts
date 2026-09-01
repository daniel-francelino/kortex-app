import { requireAuthUser } from '../../utils/require-auth'
import { getSupabaseAdminClient } from '../../utils/supabase'
import {
  getDefaultOnboardingState,
  mergeOnboardingState,
  onboardingUpdateSchema,
  parseOnboardingState
} from '../../utils/onboarding'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody(event)
  const parsed = onboardingUpdateSchema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Dados inválidos',
      data: parsed.error.flatten()
    })
  }

  const supabase = getSupabaseAdminClient()

  const { data: existing, error: loadError } = await supabase
    .from('user_preferences')
    .select('onboarding_state, timezone')
    .eq('user_id', user.id)
    .single()

  if (loadError && loadError.code !== 'PGRST116') {
    throw createError({
      statusCode: 500,
      statusMessage: 'Não foi possível carregar o onboarding'
    })
  }

  const currentOnboarding = existing
    ? parseOnboardingState(existing.onboarding_state)
    : getDefaultOnboardingState()
  const nextOnboarding = mergeOnboardingState(currentOnboarding, parsed.data)
  // `null` here means "still unset" (Regra 2, docs/timezone/ANALISE_TIMEZONE.md)
  // — writing 'UTC' as a hard fallback whenever this step's payload doesn't
  // include a timezone would lock the column in prematurely (any onboarding
  // step completed before the dedicated timezone step, or before the
  // one-time browser auto-fill runs, would otherwise permanently disable
  // that auto-fill for this user). Only ever write a concrete value.
  const timezone = parsed.data.timezone ?? existing?.timezone ?? null

  const { error } = await supabase
    .from('user_preferences')
    .upsert({
      user_id: user.id,
      onboarding_state: nextOnboarding,
      ...(timezone ? { timezone } : {})
    }, { onConflict: 'user_id' })

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Não foi possível salvar o onboarding'
    })
  }

  return {
    onboarding: nextOnboarding,
    timezone: timezone ?? 'UTC'
  }
})
