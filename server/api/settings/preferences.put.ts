import { z } from 'zod'
import { requireAuthUser } from '../../utils/require-auth'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { isValidTimeZone } from '../../utils/user-timezone'

const VALID_PRIMARY_COLORS = [
  'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald',
  'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple',
  'fuchsia', 'pink', 'rose'
] as const

const VALID_NEUTRAL_COLORS = ['slate', 'gray', 'zinc', 'neutral', 'stone'] as const
const VALID_COLOR_MODES = ['light', 'dark'] as const

const schema = z.object({
  primary_color: z.enum(VALID_PRIMARY_COLORS),
  neutral_color: z.enum(VALID_NEUTRAL_COLORS),
  color_mode: z.enum(VALID_COLOR_MODES),
  // Real IANA-zone check, not just "non-empty string" — an invalid value
  // here would throw wherever it's later handed to date-fns-tz/Intl.
  timezone: z.string().refine(isValidTimeZone, { message: 'Timezone inválido' }),
  // Optional and omitted from most saves (color/timezone changes don't touch
  // it) — usage counts are only ever bumped by useUserPreferences' own
  // setTimezone(), which sends the whole updated map here to persist.
  timezone_usage: z.record(z.string(), z.number()).optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody(event)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Dados inválidos',
      data: parsed.error.flatten()
    })
  }

  const supabase = getSupabaseAdminClient()

  const { error } = await supabase
    .from('user_preferences')
    .upsert({
      user_id: user.id,
      primary_color: parsed.data.primary_color,
      neutral_color: parsed.data.neutral_color,
      color_mode: parsed.data.color_mode,
      timezone: parsed.data.timezone,
      // Omitted entirely (not even `undefined`-valued) when not sent, so the
      // upsert's DO UPDATE clause leaves the existing column alone instead
      // of blowing it away back to '{}'.
      ...(parsed.data.timezone_usage ? { timezone_usage: parsed.data.timezone_usage } : {})
    }, { onConflict: 'user_id' })

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Não foi possível salvar as preferências'
    })
  }

  return { ok: true }
})
