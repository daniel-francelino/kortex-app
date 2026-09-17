import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { buildPublicSchedulingPagePayload, requireActiveSchedulingPageByUsernameSlug } from '../../../utils/schedule-public'

const paramsSchema = z.object({
  username: z.string().min(1),
  slug: z.string().min(1)
})

/** Mirrors /api/schedule/[token].get.ts, resolved by username+slug instead
 * of an opaque token — same public payload, same shared builder. See
 * docs/appointments/PLANO_USERNAME_PERFIL_PUBLICO.md §7.2. */
export default eventHandler(async (event) => {
  const { username, slug } = paramsSchema.parse(getRouterParams(event))
  const supabase = getSupabaseAdminClient()

  const page = await requireActiveSchedulingPageByUsernameSlug(supabase, username.trim().toLowerCase(), slug)
  return buildPublicSchedulingPagePayload(supabase, page)
})
