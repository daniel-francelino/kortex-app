import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../../utils/supabase'
import { requireAuthUser } from '../../../../../utils/require-auth'
import { createNotification } from '../../../../../utils/notifications'

const bodySchema = z.object({
  email: z.string().email().max(320),
  permission: z.enum(['view', 'edit']).default('view')
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const calendarId = z.string().uuid().parse(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const payload = bodySchema.parse(body)
  const supabase = getSupabaseAdminClient()

  const { data: calendar } = await supabase
    .from('calendars')
    .select('id, name')
    .eq('id', calendarId)
    .eq('owner_user_id', user.id)
    .is('archived_at', null)
    .single()

  if (!calendar) {
    throw createError({ statusCode: 404, statusMessage: 'Calendário não encontrado' })
  }

  const email = payload.email.toLowerCase()

  const { data: resolvedUserId } = await supabase.rpc('get_user_id_by_email', { lookup_email: email })

  const { data, error } = await supabase
    .from('calendar_shares')
    .insert({
      calendar_id: calendarId,
      owner_id: user.id,
      invited_email: email,
      invited_user_id: resolvedUserId ?? null,
      permission: payload.permission,
      status: resolvedUserId ? 'accepted' : 'pending'
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'Esta pessoa já tem acesso a este calendário' })
    }
    throw createError({ statusCode: 500, statusMessage: 'Erro ao compartilhar calendário', data: error.message })
  }

  // First share on a calendar flips it to "shared" — that's what the field
  // communicates now, no separate manual toggle.
  await supabase
    .from('calendars')
    .update({ visibility: 'shared' })
    .eq('id', calendarId)
    .eq('visibility', 'private')

  if (resolvedUserId && resolvedUserId !== user.id) {
    const senderName = (user.user_metadata?.name as string | undefined) || user.email || 'Alguém'

    await createNotification(supabase, {
      userId: resolvedUserId,
      type: 'user',
      category: 'calendar_shared',
      body: `${senderName} compartilhou o calendário "${calendar.name}" com você.`,
      linkPath: '/app/appointments',
      senderName,
      senderEmail: user.email,
      senderAvatarUrl: (user.user_metadata?.avatar_url as string | undefined) || null,
      metadata: { calendarId, calendarShareId: data.id }
    })
  }

  return {
    id: data.id as string,
    calendarId: data.calendar_id as string,
    ownerId: data.owner_id as string,
    invitedUserId: (data.invited_user_id as string) ?? null,
    invitedEmail: data.invited_email as string,
    permission: data.permission as string,
    status: data.status as string,
    createdAt: data.created_at as string,
    updatedAt: data.updated_at as string
  }
})
