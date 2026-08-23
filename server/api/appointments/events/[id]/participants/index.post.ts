import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../../utils/supabase'
import { requireAuthUser } from '../../../../../utils/require-auth'
import { createNotification } from '../../../../../utils/notifications'

const bodySchema = z.object({
  email: z.string().email().max(320)
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const eventId = z.string().uuid().parse(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const payload = bodySchema.parse(body)
  const supabase = getSupabaseAdminClient()

  const { data: eventRow } = await supabase
    .from('events')
    .select('id, title')
    .eq('id', eventId)
    .eq('owner_user_id', user.id)
    .single()

  if (!eventRow) {
    throw createError({ statusCode: 404, statusMessage: 'Evento não encontrado' })
  }

  const email = payload.email.toLowerCase()

  // Resolve to an existing account, if there is one. If not, the invite stays
  // pending until the person signs up/logs in with this email — see
  // server/utils/reconcile-pending-shares.ts.
  const { data: resolvedUserId } = await supabase.rpc('get_user_id_by_email', { lookup_email: email })

  const { data, error } = await supabase
    .from('event_participants')
    .insert({
      event_id: eventId,
      owner_id: user.id,
      invited_email: email,
      invited_user_id: resolvedUserId ?? null
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'Esta pessoa já foi convidada para este evento' })
    }
    throw createError({ statusCode: 500, statusMessage: 'Erro ao convidar participante', data: error.message })
  }

  if (resolvedUserId && resolvedUserId !== user.id) {
    const senderName = (user.user_metadata?.name as string | undefined) || user.email || 'Alguém'
    const eventTitle = eventRow.title || 'Sem título'

    await createNotification(supabase, {
      userId: resolvedUserId,
      type: 'user',
      category: 'event_invite',
      body: `${senderName} convidou você para "${eventTitle}".`,
      linkPath: '/app/appointments',
      senderName,
      senderEmail: user.email,
      senderAvatarUrl: (user.user_metadata?.avatar_url as string | undefined) || null,
      metadata: { eventId, participantId: data.id }
    })
  }

  return {
    id: data.id as string,
    eventId: data.event_id as string,
    ownerId: data.owner_id as string,
    invitedUserId: (data.invited_user_id as string) ?? null,
    invitedEmail: data.invited_email as string,
    rsvpStatus: data.rsvp_status as string,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string
  }
})
