import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'

const paramsSchema = z.object({
  username: z.string().min(1)
})

/**
 * Public, unauthenticated — the profile page's data: host identity + every
 * scheduling page that's active AND opted into the public listing
 * (`show_on_profile`). Never exposes calendarId/userId/shareToken. See
 * docs/appointments/PLANO_USERNAME_PERFIL_PUBLICO.md §7.3.
 */
export default eventHandler(async (event) => {
  const { username } = paramsSchema.parse(getRouterParams(event))
  const normalized = username.trim().toLowerCase()
  const supabase = getSupabaseAdminClient()

  const { data: pref } = await supabase
    .from('user_preferences')
    .select('user_id, username, bio')
    .eq('username', normalized)
    .maybeSingle()

  if (!pref) {
    throw createError({ statusCode: 404, statusMessage: 'Perfil não encontrado' })
  }

  const { data: pages } = await supabase
    .from('scheduling_pages')
    .select('title, description, duration_minutes, location_type, slug, color, cover_image_url, requires_confirmation')
    .eq('user_id', pref.user_id as string)
    .eq('is_active', true)
    .eq('show_on_profile', true)
    .is('archived_at', null)
    .order('created_at', { ascending: true })

  const { data: hostData } = await supabase.auth.admin.getUserById(pref.user_id as string)
  const hostMeta = (hostData?.user?.user_metadata ?? {}) as Record<string, unknown>
  const name = (hostMeta.name as string | undefined) || hostData?.user?.email || pref.username as string
  const avatarUrl = (hostMeta.avatar_url as string | undefined) || null

  return {
    username: pref.username,
    name,
    avatarUrl,
    bio: (pref.bio as string | null) ?? null,
    eventTypes: (pages ?? []).map((row: Record<string, unknown>) => ({
      slug: row.slug,
      title: row.title,
      description: row.description ?? null,
      durationMinutes: row.duration_minutes,
      locationType: row.location_type,
      color: row.color ?? null,
      coverImageUrl: row.cover_image_url ?? null,
      requiresConfirmation: Boolean(row.requires_confirmation)
    }))
  }
})
