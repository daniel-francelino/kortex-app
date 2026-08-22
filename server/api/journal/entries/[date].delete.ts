import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'

const paramSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const params = paramSchema.parse(getRouterParams(event))

  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('journal_entries')
    .update({ archived_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('entry_date', params.date)
    .is('archived_at', null)
    .select('id')
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Entrada não encontrada.' })
  }

  return { success: true }
})
