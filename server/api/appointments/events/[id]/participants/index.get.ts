import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../../utils/supabase'
import { requireAuthUser } from '../../../../../utils/require-auth'
import { parseOrThrow } from '../../../../../utils/validation'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const eventId = parseOrThrow(z.string().uuid(), getRouterParam(event, 'id'))
  const supabase = getSupabaseAdminClient()

  // Owner or an invited participant can list the guest list.
  const { data: eventRow } = await supabase
    .from('events')
    .select('id, owner_user_id')
    .eq('id', eventId)
    .single()

  if (!eventRow) {
    throw createError({ statusCode: 404, statusMessage: 'Evento não encontrado' })
  }

  const isOwner = eventRow.owner_user_id === user.id

  if (!isOwner) {
    const { data: ownParticipation } = await supabase
      .from('event_participants')
      .select('id')
      .eq('event_id', eventId)
      .eq('invited_user_id', user.id)
      .maybeSingle()

    if (!ownParticipation) {
      throw createError({ statusCode: 404, statusMessage: 'Evento não encontrado' })
    }
  }

  const { data, error } = await supabase
    .from('event_participants')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: true })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao listar convidados', data: error.message })
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    eventId: row.event_id as string,
    ownerId: row.owner_id as string,
    invitedUserId: (row.invited_user_id as string) ?? null,
    invitedEmail: row.invited_email as string,
    rsvpStatus: row.rsvp_status as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  }))
})
