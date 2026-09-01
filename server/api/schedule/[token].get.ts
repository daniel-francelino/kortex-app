import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { mapSchedulingQuestion } from '../../utils/scheduling'

const paramsSchema = z.object({
  token: z.string().min(1)
})

/**
 * Public, unauthenticated — data needed to render the booking page. Never
 * exposes calendarId or any other internal identifier of the host.
 */
export default eventHandler(async (event) => {
  const { token } = paramsSchema.parse(getRouterParams(event))
  const supabase = getSupabaseAdminClient()

  const { data: page } = await supabase
    .from('scheduling_pages')
    .select('id, user_id, title, description, duration_minutes, location_type, location_details, max_advance_days, requires_confirmation, is_active, archived_at')
    .eq('share_token', token)
    .maybeSingle()

  if (!page || !page.is_active || page.archived_at) {
    throw createError({ statusCode: 404, statusMessage: 'Página de agendamento não encontrada' })
  }

  const { data: questionsData } = await supabase
    .from('scheduling_questions')
    .select('*')
    .eq('scheduling_page_id', page.id)
    .eq('is_hidden', false)
    .order('sort_order', { ascending: true })

  const { data: hostData } = await supabase.auth.admin.getUserById(page.user_id as string)
  const hostMeta = (hostData?.user?.user_metadata ?? {}) as Record<string, unknown>
  const hostName = (hostMeta.name as string | undefined) || hostData?.user?.email || 'Anfitrião'
  const hostAvatarUrl = (hostMeta.avatar_url as string | undefined) || null

  return {
    title: page.title,
    description: page.description ?? null,
    durationMinutes: page.duration_minutes,
    locationType: page.location_type,
    locationDetails: page.location_details ?? null,
    hostName,
    hostAvatarUrl,
    maxAdvanceDays: page.max_advance_days,
    requiresConfirmation: Boolean(page.requires_confirmation),
    questions: (questionsData ?? []).map(row => mapSchedulingQuestion(row as Record<string, unknown>))
  }
})
