import { requireAuthUser } from '../../../utils/require-auth'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { mapJournalEncryption } from '../../../utils/journal-mappers'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('journal_encryption')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível carregar as chaves de criptografia.' })
  }

  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Criptografia não ativada.' })
  }

  return mapJournalEncryption(data as Record<string, unknown>)
})
