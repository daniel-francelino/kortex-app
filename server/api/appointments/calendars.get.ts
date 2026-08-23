import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'

const querySchema = z.object({
  archived: z.coerce.boolean().default(false)
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const params = querySchema.parse(getQuery(event))
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

  return data ?? []
})
