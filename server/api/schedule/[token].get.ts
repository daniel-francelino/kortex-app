import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { buildPublicSchedulingPagePayload, requireActiveSchedulingPageByToken } from '../../utils/schedule-public'

const paramsSchema = z.object({
  token: z.string().min(1)
})

/**
 * Public, unauthenticated — data needed to render the booking page. Never
 * exposes calendarId or any other internal identifier of the host. Mirrored
 * by /api/profile/[username]/[slug].get.ts for the username+slug entry point
 * (docs/appointments/PLANO_USERNAME_PERFIL_PUBLICO.md §7.2) — both resolve
 * the page differently, then share buildPublicSchedulingPagePayload.
 */
export default eventHandler(async (event) => {
  const { token } = paramsSchema.parse(getRouterParams(event))
  const supabase = getSupabaseAdminClient()

  const page = await requireActiveSchedulingPageByToken(supabase, token)
  return buildPublicSchedulingPagePayload(supabase, page)
})
