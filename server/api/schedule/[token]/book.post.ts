import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { bookSlotForPage, requireActiveSchedulingPageByToken } from '../../../utils/schedule-public'

const bodySchema = z.object({
  startAt: z.string().datetime(),
  guestName: z.string().min(1).max(200),
  guestEmail: z.string().email().max(320),
  guestTimezone: z.string().min(1).max(100),
  answers: z.record(z.string(), z.string()).optional()
})

export default eventHandler(async (event) => {
  const token = z.string().min(1).parse(getRouterParam(event, 'token'))
  const body = await readBody(event)
  const payload = bodySchema.parse(body)
  const supabase = getSupabaseAdminClient()

  const page = await requireActiveSchedulingPageByToken(supabase, token)
  const result = await bookSlotForPage(supabase, page, payload)

  setResponseStatus(event, 201)
  return result
})
