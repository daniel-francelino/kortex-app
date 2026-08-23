import { requireAuthUser } from '../../../utils/require-auth'
import { getSupabaseAdminClient } from '../../../utils/supabase'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('journal_encryption')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível carregar o status da criptografia.' })
  }

  return { enabled: !!data }
})
