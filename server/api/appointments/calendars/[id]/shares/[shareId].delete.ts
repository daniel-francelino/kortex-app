import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../../utils/supabase'
import { requireAuthUser } from '../../../../../utils/require-auth'
import { parseOrThrow } from '../../../../../utils/validation'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const calendarId = parseOrThrow(z.string().uuid(), getRouterParam(event, 'id'))
  const shareId = parseOrThrow(z.string().uuid(), getRouterParam(event, 'shareId'))
  const supabase = getSupabaseAdminClient()

  const { error } = await supabase
    .from('calendar_shares')
    .delete()
    .eq('id', shareId)
    .eq('calendar_id', calendarId)
    .eq('owner_id', user.id)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao remover acesso', data: error.message })
  }

  return { success: true }
})
