import { z } from 'zod'
import { requireAuthUser } from '../../../utils/require-auth'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { hashPin } from '../../../utils/pin-hash'

const bodySchema = z.object({
  pin: z.string().regex(/^\d{4}$/, 'O PIN deve ter 4 dígitos.'),
  mode: z.enum(['module', 'entries'])
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody(event)
  const parsed = bodySchema.parse(body)

  const { hash, salt } = hashPin(parsed.pin)
  const supabase = getSupabaseAdminClient()

  const { error } = await supabase
    .from('user_preferences')
    .upsert({
      user_id: user.id,
      journal_pin_hash: hash,
      journal_pin_salt: salt,
      journal_pin_mode: parsed.mode,
      journal_pin_failed_attempts: 0,
      journal_pin_locked_until: null
    }, { onConflict: 'user_id' })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível salvar o PIN.' })
  }

  return { ok: true }
})
