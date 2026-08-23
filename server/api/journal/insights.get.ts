import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'

const querySchema = z.object({
  range: z.enum(['7d', '30d', '90d']).default('30d')
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const query = getQuery(event)
  const params = querySchema.parse(query)

  const supabase = getSupabaseAdminClient()

  // Calculate date range
  const daysMap: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90 }
  const days = daysMap[params.range] ?? 30
  const fromDate = new Date()
  fromDate.setDate(fromDate.getDate() - days)
  const fromStr = fromDate.toISOString().split('T')[0] ?? ''

  // Count entries in range
  const { data: entries, count: totalEntries } = await supabase
    .from('journal_entries')
    .select('entry_date', { count: 'exact' })
    .eq('user_id', user.id)
    .is('archived_at', null)
    .gte('entry_date', fromStr)

  // Entries by day of week
  const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
  const dayCounts: Record<string, number> = {}
  for (const name of dayNames) {
    dayCounts[name] = 0
  }
  for (const e of (entries ?? []) as Array<Record<string, unknown>>) {
    const date = new Date((e.entry_date as string) + 'T12:00:00')
    const dayName = dayNames[date.getDay()] ?? 'Domingo'
    dayCounts[dayName] = (dayCounts[dayName] ?? 0) + 1
  }
  const entriesByDayOfWeek = dayNames.map(day => ({
    day,
    count: dayCounts[day] ?? 0
  }))

  return {
    range: params.range,
    totalEntries: totalEntries ?? 0,
    entriesByDayOfWeek
  }
})
