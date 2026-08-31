import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../../utils/supabase'
import { requireAuthUser } from '../../../../../utils/require-auth'
import { parseOrThrow } from '../../../../../utils/validation'

const bodySchema = z.object({
  permission: z.enum(['view', 'edit'])
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const calendarId = parseOrThrow(z.string().uuid(), getRouterParam(event, 'id'))
  const shareId = parseOrThrow(z.string().uuid(), getRouterParam(event, 'shareId'))
  const body = await readBody(event)
  const payload = parseOrThrow(bodySchema, body)
  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('calendar_shares')
    .update({ permission: payload.permission, updated_at: new Date().toISOString() })
    .eq('id', shareId)
    .eq('calendar_id', calendarId)
    .eq('owner_id', user.id)
    .select()
    .single()

  if (error || !data) {
    throw createError({ statusCode: 404, statusMessage: 'Compartilhamento não encontrado' })
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
