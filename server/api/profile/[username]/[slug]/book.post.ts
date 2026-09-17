import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../utils/supabase'
import { bookSlotForPage, requireActiveSchedulingPageByUsernameSlug } from '../../../../utils/schedule-public'

const paramsSchema = z.object({
  username: z.string().min(1),
  slug: z.string().min(1)
})

const bodySchema = z.object({
  startAt: z.string().datetime(),
  guestName: z.string().min(1).max(200),
  guestEmail: z.string().email().max(320),
  guestTimezone: z.string().min(1).max(100),
  answers: z.record(z.string(), z.string()).optional()
})

/** Mirrors /api/schedule/[token]/book.post.ts — see
 * docs/appointments/PLANO_USERNAME_PERFIL_PUBLICO.md §7.2. */
export default eventHandler(async (event) => {
  const { username, slug } = paramsSchema.parse(getRouterParams(event))
  const body = await readBody(event)
  const payload = bodySchema.parse(body)
  const supabase = getSupabaseAdminClient()

  const page = await requireActiveSchedulingPageByUsernameSlug(supabase, username.trim().toLowerCase(), slug)
  const result = await bookSlotForPage(supabase, page, payload)

  setResponseStatus(event, 201)
  return result
})
