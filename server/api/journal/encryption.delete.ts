import { requireAuthUser } from '../../utils/require-auth'
import { getSupabaseAdminClient } from '../../utils/supabase'

// Só deve ser chamado depois que o cliente já regravou todas as entradas em
// claro (useJournalEncryption().disable(), ver plano) — apagar a linha aqui
// não decifra nada; é só o registro de que a criptografia está desativada.
export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const supabase = getSupabaseAdminClient()

  const { error } = await supabase
    .from('journal_encryption')
    .delete()
    .eq('user_id', user.id)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível desativar a criptografia.' })
  }

  return { ok: true }
})
