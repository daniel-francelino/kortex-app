import { z } from 'zod'
import { requireAuthUser } from '../../../utils/require-auth'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { verifyPin } from '../../../utils/pin-hash'

const bodySchema = z.object({
  pin: z.string().regex(/^\d{4}$/)
})

// Lockout grows with repeated failures instead of a fixed window — makes
// brute-forcing a 4-digit PIN (10,000 combinations) impractical without
// needing to track anything beyond a counter + a timestamp.
const ATTEMPTS_BEFORE_LOCKOUT = 5
const BASE_LOCKOUT_SECONDS = 30
const MAX_LOCKOUT_SECONDS = 600

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody(event)
  const parsed = bodySchema.parse(body)

  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('user_preferences')
    .select('journal_pin_hash, journal_pin_salt, journal_pin_failed_attempts, journal_pin_locked_until')
    .eq('user_id', user.id)
    .single()

  if (error || !data) {
    throw createError({ statusCode: 400, statusMessage: 'PIN não configurado.' })
  }

  const row = data as {
    journal_pin_hash: string | null
    journal_pin_salt: string | null
    journal_pin_failed_attempts: number
    journal_pin_locked_until: string | null
  }

  if (!row.journal_pin_hash || !row.journal_pin_salt) {
    throw createError({ statusCode: 400, statusMessage: 'PIN não configurado.' })
  }

  if (row.journal_pin_locked_until && new Date(row.journal_pin_locked_until) > new Date()) {
    return { valid: false, lockedUntil: row.journal_pin_locked_until }
  }

  const isValid = verifyPin(parsed.pin, row.journal_pin_hash, row.journal_pin_salt)

  if (isValid) {
    await supabase
      .from('user_preferences')
      .update({ journal_pin_failed_attempts: 0, journal_pin_locked_until: null })
      .eq('user_id', user.id)
    return { valid: true }
  }

  const attempts = row.journal_pin_failed_attempts + 1
  let lockedUntil: string | null = null

  if (attempts >= ATTEMPTS_BEFORE_LOCKOUT) {
    const extra = attempts - ATTEMPTS_BEFORE_LOCKOUT
    const seconds = Math.min(BASE_LOCKOUT_SECONDS * 2 ** extra, MAX_LOCKOUT_SECONDS)
    lockedUntil = new Date(Date.now() + seconds * 1000).toISOString()
  }

  await supabase
    .from('user_preferences')
    .update({ journal_pin_failed_attempts: attempts, journal_pin_locked_until: lockedUntil })
    .eq('user_id', user.id)

  return { valid: false, lockedUntil }
})
