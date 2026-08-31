import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../../utils/supabase'
import { requireAuthUser } from '../../../../../utils/require-auth'
import { parseOrThrow } from '../../../../../utils/validation'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const calendarId = parseOrThrow(z.string().uuid(), getRouterParam(event, 'id'))
  const supabase = getSupabaseAdminClient()

  const { data: calendar } = await supabase
    .from('calendars')
    .select('id')
    .eq('id', calendarId)
    .eq('owner_user_id', user.id)
    .single()

  if (!calendar) {
    throw createError({ statusCode: 404, statusMessage: 'Calendário não encontrado' })
  }

  const { data, error } = await supabase
    .from('calendar_shares')
    .select('*')
    .eq('calendar_id', calendarId)
    .order('created_at', { ascending: true })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao listar acessos', data: error.message })
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    calendarId: row.calendar_id as string,
    ownerId: row.owner_id as string,
    invitedUserId: (row.invited_user_id as string) ?? null,
    invitedEmail: row.invited_email as string,
    permission: row.permission as string,
    status: row.status as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string
  }))
})
