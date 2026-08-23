import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'

const querySchema = z.object({
  token: z.string().min(1, 'Token é obrigatório')
})

export default eventHandler(async (event) => {
  const query = getQuery(event)
  const { token } = querySchema.parse(query)

  const supabase = getSupabaseAdminClient()

  // Find user by share token
  const { data: settings, error: settingsError } = await supabase
    .from('habit_user_settings')
    .select('user_id, share_enabled')
    .eq('share_token', token)
    .eq('share_enabled', true)
    .maybeSingle()

  if (settingsError || !settings) {
    throw createError({ statusCode: 404, statusMessage: 'Link de compartilhamento não encontrado ou desativado' })
  }

  const userId = settings.user_id as string

  // Get active habits with streaks
  const { data: habits } = await supabase
    .from('habits')
    .select('id, name, frequency, difficulty, streak:habit_streaks(current_streak)')
    .eq('user_id', userId)
    .is('archived_at', null)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  const mappedHabits = (habits ?? []).map((h: Record<string, unknown>) => {
    const streak = h.streak as Record<string, unknown> | Record<string, unknown>[] | null
    const streakVal = Array.isArray(streak) ? streak[0] : streak
    return {
      name: h.name as string,
      frequency: h.frequency as string,
      difficulty: h.difficulty as string,
      streakCurrent: (streakVal?.current_streak as number) ?? 0
    }
  })

  // Get completion rates
  const now = new Date()
  const today = now.toISOString().split('T')[0]!

  const date7d = new Date(now)
  date7d.setDate(date7d.getDate() - 7)
  const start7d = date7d.toISOString().split('T')[0]!

  const date30d = new Date(now)
  date30d.setDate(date30d.getDate() - 30)
  const start30d = date30d.toISOString().split('T')[0]!

  const habitIds = (habits ?? []).map((h: Record<string, unknown>) => (h as { id?: string }).id).filter(Boolean) as string[]

  let completionRate7d = 0
  let completionRate30d = 0

  if (habitIds.length > 0) {
    const { data: logs30d } = await supabase
      .from('habit_logs')
      .select('log_date, completed')
      .eq('user_id', userId)
      .in('habit_id', habitIds)
      .gte('log_date', start30d)
      .lte('log_date', today)

    const allLogs = logs30d ?? []
    const logs7d = allLogs.filter((l: Record<string, unknown>) => (l.log_date as string) >= start7d)

    const completed7d = logs7d.filter((l: Record<string, unknown>) => l.completed).length
    const total7d = logs7d.length || 1
    completionRate7d = Math.round((completed7d / total7d) * 100)

    const completed30d = allLogs.filter((l: Record<string, unknown>) => l.completed).length
    const total30d = allLogs.length || 1
    completionRate30d = Math.round((completed30d / total30d) * 100)
  }

  return {
    habits: mappedHabits,
    completionRate7d,
    completionRate30d,
    totalHabits: mappedHabits.length
  }
})
