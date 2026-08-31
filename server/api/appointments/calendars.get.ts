import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { parseOrThrow } from '../../utils/validation'

const querySchema = z.object({
  archived: z.coerce.boolean().default(false)
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const params = parseOrThrow(querySchema, getQuery(event))
  const supabase = getSupabaseAdminClient()

  let queryBuilder = supabase
    .from('calendars')
    .select('*')
    .eq('owner_user_id', user.id)
    .order('name', { ascending: true })

  queryBuilder = params.archived
    ? queryBuilder.not('archived_at', 'is', null)
    : queryBuilder.is('archived_at', null)

  const { data, error } = await queryBuilder

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  const ownCalendars = data ?? []

  if (params.archived) {
    return ownCalendars
  }

  // Also surface calendars someone else shared with this user (accepted only).
  const { data: shares } = await supabase
    .from('calendar_shares')
    .select('calendar_id')
    .eq('invited_user_id', user.id)
    .eq('status', 'accepted')

  const sharedCalendarIds = [...new Set((shares ?? []).map((s: Record<string, unknown>) => s.calendar_id as string))]

  let sharedCalendars: Record<string, unknown>[] = []
  if (sharedCalendarIds.length > 0) {
    const { data: sharedData } = await supabase
      .from('calendars')
      .select('*')
      .in('id', sharedCalendarIds)
      .is('archived_at', null)

    sharedCalendars = sharedData ?? []
  }

  const seenIds = new Set<string>()
  const merged: Record<string, unknown>[] = []
  for (const cal of [...ownCalendars, ...sharedCalendars]) {
    const id = (cal as Record<string, unknown>).id as string
    if (seenIds.has(id)) continue
    seenIds.add(id)
    merged.push(cal as Record<string, unknown>)
  }

  return merged
})
