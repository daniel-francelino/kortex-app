import { requireAuthUser } from '../../utils/require-auth'
import { getSupabaseAdminClient } from '../../utils/supabase'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('user_preferences')
    .select('primary_color, neutral_color, color_mode, timezone, timezone_usage')
    .eq('user_id', user.id)
    .single()

  if (error && error.code !== 'PGRST116') {
    throw createError({
      statusCode: 500,
      statusMessage: 'Não foi possível carregar as preferências'
    })
  }

  if (!data) {
    return {
      primary_color: 'emerald',
      neutral_color: 'slate',
      color_mode: 'dark',
      // `null` here means "never chosen" (see docs/timezone/ANALISE_TIMEZONE.md,
      // Regra 2) — a brand new user with no row yet is exactly that case.
      // Coercing to 'UTC' here would make the client think a preference was
      // already set and skip the one-time browser-timezone auto-fill.
      timezone: null,
      timezone_usage: {}
    }
  }

  return {
    primary_color: data.primary_color,
    neutral_color: data.neutral_color,
    color_mode: data.color_mode,
    timezone: data.timezone,
    timezone_usage: (data.timezone_usage as Record<string, number> | null) ?? {}
  }
})
