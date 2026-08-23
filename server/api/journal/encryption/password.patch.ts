import { z } from 'zod'
import { requireAuthUser } from '../../../utils/require-auth'
import { getSupabaseAdminClient } from '../../../utils/supabase'

// Troca de frase-secreta: o cliente já desembrulhou a Data Key com a senha
// antiga (ou o código de recuperação) e a reembrulhou com a nova senha —
// aqui só substitui a cópia 1. As cópias 2 (recuperação) e 3 (Kortex)
// continuam intactas, sem precisar de nenhuma outra ação.
const bodySchema = z.object({
  dataKeyWrappedPassword: z.string().min(1),
  dataKeyWrappedPasswordIv: z.string().min(1),
  passwordSalt: z.string().min(1),
  kdfIterations: z.number().int().min(100000)
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody(event)
  const parsed = bodySchema.parse(body)

  const supabase = getSupabaseAdminClient()

  const { error } = await supabase
    .from('journal_encryption')
    .update({
      data_key_wrapped_password: parsed.dataKeyWrappedPassword,
      data_key_wrapped_password_iv: parsed.dataKeyWrappedPasswordIv,
      password_salt: parsed.passwordSalt,
      kdf_iterations: parsed.kdfIterations
    })
    .eq('user_id', user.id)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível trocar a frase-secreta.' })
  }

  return { ok: true }
})
