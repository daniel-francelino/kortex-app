import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../../../utils/supabase'
import { requireAuthUser } from '../../../../../../utils/require-auth'
import { createNotification } from '../../../../../../utils/notifications'

const bodySchema = z.object({
  rsvpStatus: z.enum(['accepted', 'declined', 'tentative'])
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const eventId = z.string().uuid().parse(getRouterParam(event, 'id'))
  const participantId = z.string().uuid().parse(getRouterParam(event, 'participantId'))
  const body = await readBody(event)
  const payload = bodySchema.parse(body)
  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('event_participants')
    .update({ rsvp_status: payload.rsvpStatus, updated_at: new Date().toISOString() })
    .eq('id', participantId)
    .eq('event_id', eventId)
    .eq('invited_user_id', user.id)
    .select('*, event:events(title)')
    .single()

  if (error || !data) {
    throw createError({ statusCode: 404, statusMessage: 'Convite não encontrado' })
  }

  const RSVP_LABELS: Record<string, string> = {
    accepted: 'confirmou presença em',
    declined: 'recusou o convite para',
    tentative: 'talvez compareça a'
  }

  const eventRaw = data.event as Record<string, unknown> | Record<string, unknown>[] | null
  const eventInfo = Array.isArray(eventRaw) ? eventRaw[0] : eventRaw
  const responderName = (user.user_metadata?.name as string | undefined) || user.email || 'Alguém'

  await createNotification(supabase, {
    userId: data.owner_id as string,
    type: 'user',
    category: 'event_rsvp',
    body: `${responderName} ${RSVP_LABELS[payload.rsvpStatus]} "${eventInfo?.title ?? 'Sem título'}".`,
    linkPath: '/app/appointments',
    senderName: responderName,
    senderEmail: user.email,
    metadata: { eventId, participantId }
  })

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
