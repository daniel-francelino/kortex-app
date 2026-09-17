import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../utils/supabase'
import { listAvailableSlots, requireActiveSchedulingPageByUsernameSlug } from '../../../../utils/schedule-public'

const paramsSchema = z.object({
  username: z.string().min(1),
  slug: z.string().min(1)
})

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
})

/** Mirrors /api/schedule/[token]/availability.get.ts — see
 * docs/appointments/PLANO_USERNAME_PERFIL_PUBLICO.md §7.2. */
export default eventHandler(async (event) => {
  const { username, slug } = paramsSchema.parse(getRouterParams(event))
  const { from, to } = querySchema.parse(getQuery(event))
  const supabase = getSupabaseAdminClient()

  const page = await requireActiveSchedulingPageByUsernameSlug(supabase, username.trim().toLowerCase(), slug)
  const slots = await listAvailableSlots(supabase, page, from, to)

  return { slots }
})
