import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'

const MOOD_VALUES = ['very_bad', 'bad', 'neutral', 'good', 'very_good'] as const
const WINDOW_DAYS = 90
const MIN_SAMPLE_DAYS = 5

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const supabase = getSupabaseAdminClient()

  const now = new Date()
  const today = now.toISOString().split('T')[0]!
  const windowStart = new Date(now)
  windowStart.setDate(windowStart.getDate() - WINDOW_DAYS)
  const startDate = windowStart.toISOString().split('T')[0]!

  const [{ data: entries }, { data: logs }] = await Promise.all([
    supabase
      .from('journal_entries')
      .select('entry_date, mood')
      .eq('user_id', user.id)
      .not('mood', 'is', null)
      .gte('entry_date', startDate)
      .lte('entry_date', today),
    supabase
      .from('habit_logs')
      .select('log_date, completed')
      .eq('user_id', user.id)
      .gte('log_date', startDate)
      .lte('log_date', today)
  ])

  const moodByDate = new Map<string, string>(
    (entries ?? []).map((e: Record<string, unknown>) => [e.entry_date as string, e.mood as string])
  )

  const logsByDate = new Map<string, { completed: number, total: number }>()
  for (const log of (logs ?? []) as Array<Record<string, unknown>>) {
    const date = log.log_date as string
    const bucket = logsByDate.get(date) ?? { completed: 0, total: 0 }
    bucket.total += 1
    if (log.completed) bucket.completed += 1
    logsByDate.set(date, bucket)
  }

  const rateByMood = new Map<string, number[]>()
  let sampleDays = 0

  for (const [date, mood] of moodByDate) {
    const dayLogs = logsByDate.get(date)
    if (!dayLogs || dayLogs.total === 0) continue

    sampleDays += 1
    const rate = dayLogs.completed / dayLogs.total
    if (!rateByMood.has(mood)) rateByMood.set(mood, [])
    rateByMood.get(mood)!.push(rate)
  }

  const buckets = MOOD_VALUES.map((mood) => {
    const rates = rateByMood.get(mood) ?? []
    const avgCompletionRate = rates.length > 0
      ? Math.round((rates.reduce((a, b) => a + b, 0) / rates.length) * 100)
      : 0

    return {
      mood,
      avgCompletionRate,
      sampleDays: rates.length
    }
  })

  return {
    buckets,
    insufficientData: sampleDays < MIN_SAMPLE_DAYS
  }
})
