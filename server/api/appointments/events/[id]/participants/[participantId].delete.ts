import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../../utils/supabase'
import { requireAuthUser } from '../../../../../utils/require-auth'
import { parseOrThrow } from '../../../../../utils/validation'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const eventId = parseOrThrow(z.string().uuid(), getRouterParam(event, 'id'))
  const participantId = parseOrThrow(z.string().uuid(), getRouterParam(event, 'participantId'))
  const supabase = getSupabaseAdminClient()

  const { error } = await supabase
    .from('event_participants')
    .delete()
    .eq('id', participantId)
    .eq('event_id', eventId)
    .eq('owner_id', user.id)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao remover convidado', data: error.message })
  }

  return { success: true }
})
