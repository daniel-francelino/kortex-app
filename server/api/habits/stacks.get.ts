import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { resolveUserTimezone } from '../../utils/user-timezone'

import { resolveHabitStacksForDate } from '../../utils/habit-stacks'

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD').optional(),
  tz: z.string().optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const query = getQuery(event)
  const params = querySchema.parse(query)
  const supabase = getSupabaseAdminClient()
  const timezone = await resolveUserTimezone(supabase, user.id, params.tz)

  return resolveHabitStacksForDate(supabase, user.id, timezone, params.date)
})
