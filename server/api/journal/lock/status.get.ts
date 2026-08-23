import { requireAuthUser } from '../../../utils/require-auth'
import { getSupabaseAdminClient } from '../../../utils/supabase'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('user_preferences')
    .select('journal_pin_hash, journal_pin_mode')
    .eq('user_id', user.id)
    .single()

  if (error && error.code !== 'PGRST116') {
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível carregar o status do PIN.' })
  }

  const row = data as { journal_pin_hash: string | null, journal_pin_mode: string | null } | null

  return {
    enabled: !!row?.journal_pin_hash,
    mode: row?.journal_pin_hash ? (row.journal_pin_mode as 'module' | 'entries' | null) : null
  }
})
