import type { SupabaseClient } from '@supabase/supabase-js'
import { isValidTimeZone } from '#shared/utils/dateTime'

export { isValidTimeZone }

/**
 * Resolves which IANA timezone a server-side "what day/time is it for this
 * user" calculation should use — see docs/timezone/ANALISE_TIMEZONE.md,
 * Regra 1: the browser always wins when the client tells us what it
 * detected (`tzFromClient`, sent as `?tz=` on the request); the server has
 * no browser of its own, so `user_preferences.timezone` (the user's stable
 * fallback, populated once at login — Regra 2) is what's left when there's
 * no client-provided value, and `'UTC'` is the final safety net when even
 * that is still unset (e.g. an account that has never loaded the web client).
 */
export async function resolveUserTimezone(
  supabase: SupabaseClient,
  userId: string,
  tzFromClient?: string
): Promise<string> {
  if (isValidTimeZone(tzFromClient)) return tzFromClient

  const { data } = await supabase
    .from('user_preferences')
    .select('timezone')
    .eq('user_id', userId)
    .maybeSingle()

  const stored = (data as { timezone: string | null } | null)?.timezone
  return isValidTimeZone(stored) ? stored : 'UTC'
}
