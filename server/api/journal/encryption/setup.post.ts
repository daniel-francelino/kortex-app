import { z } from 'zod'
import { requireAuthUser } from '../../../utils/require-auth'
import { getSupabaseAdminClient } from '../../../utils/supabase'

// The client has already generated the Data Key and wrapped it three ways
// (senha, código de recuperação, chave pública do Kortex) before this ever
// reaches the server — this route just persists opaque blobs. No plaintext,
// no derived key, no passphrase touches this handler.
const bodySchema = z.object({
  dataKeyWrappedPassword: z.string().min(1),
  dataKeyWrappedPasswordIv: z.string().min(1),
  passwordSalt: z.string().min(1),
  dataKeyWrappedRecovery: z.string().min(1),
  dataKeyWrappedRecoveryIv: z.string().min(1),
  recoverySalt: z.string().min(1),
  dataKeyWrappedAdmin: z.string().min(1),
  kdfIterations: z.number().int().min(100000)
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody(event)
  const parsed = bodySchema.parse(body)

  const supabase = getSupabaseAdminClient()

  const { error } = await supabase
    .from('journal_encryption')
    .upsert({
      user_id: user.id,
      data_key_wrapped_password: parsed.dataKeyWrappedPassword,
      data_key_wrapped_password_iv: parsed.dataKeyWrappedPasswordIv,
      password_salt: parsed.passwordSalt,
      data_key_wrapped_recovery: parsed.dataKeyWrappedRecovery,
      data_key_wrapped_recovery_iv: parsed.dataKeyWrappedRecoveryIv,
      recovery_salt: parsed.recoverySalt,
      data_key_wrapped_admin: parsed.dataKeyWrappedAdmin,
      kdf_iterations: parsed.kdfIterations
    }, { onConflict: 'user_id' })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível ativar a criptografia.' })
  }

  return { ok: true }
})
