import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { listAvailableSlots, requireActiveSchedulingPageByToken } from '../../../utils/schedule-public'

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
})

export default eventHandler(async (event) => {
  const token = z.string().min(1).parse(getRouterParam(event, 'token'))
  const { from, to } = querySchema.parse(getQuery(event))
  const supabase = getSupabaseAdminClient()

  const page = await requireActiveSchedulingPageByToken(supabase, token)
  const slots = await listAvailableSlots(supabase, page, from, to)

  return { slots }
})
