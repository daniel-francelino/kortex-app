import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'

const querySchema = z.object({
  range: z.enum(['7d', '30d', '90d']).default('30d')
})

const MOOD_SCORE: Record<string, number> = {
  very_bad: 1,
  bad: 2,
  neutral: 3,
  good: 4,
  very_good: 5
}

// Minimum entries per group before a correlation is shown — otherwise a
// single lucky/unlucky day would read as a "pattern".
const MIN_GROUP_SIZE = 2

function average(nums: number[]): number {
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
}

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
    .select('entry_date, mood', { count: 'exact' })
    .eq('user_id', user.id)
    .is('archived_at', null)
    .gte('entry_date', fromStr)

  // Mood score per day (1–5) — used below to correlate metrics with mood.
  const moodByDate = new Map<string, number>()
  for (const e of (entries ?? []) as Array<Record<string, unknown>>) {
    const mood = e.mood as string | null
    const score = mood ? MOOD_SCORE[mood] : undefined
    if (score !== undefined) {
      moodByDate.set(e.entry_date as string, score)
    }
  }

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

  // Metric insights: averages for numeric metrics
  const { data: metricValues } = await supabase
    .from('metric_values')
    .select('*, definition:metric_definitions(key, name, type, options)')
    .eq('user_id', user.id)
    .gte('entry_date', fromStr)

  // Group by metric key
  const metricGroups = new Map<string, { name: string, values: number[] }>()

  for (const mv of (metricValues ?? []) as Array<Record<string, unknown>>) {
    const def = mv.definition as Record<string, unknown> | null
    if (!def) continue
    const type = def.type as string
    if (type !== 'number' && type !== 'scale') continue
    const numVal = mv.number_value as number | null
    if (numVal === null) continue

    const key = def.key as string
    const name = def.name as string

    if (!metricGroups.has(key)) {
      metricGroups.set(key, { name, values: [] })
    }
    metricGroups.get(key)!.values.push(numVal)
  }

  const metrics = Array.from(metricGroups.entries()).map(([key, group]) => {
    const vals = group.values
    const avg = Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    return {
      key,
      name: group.name,
      avg,
      min,
      max,
      count: vals.length
    }
  })

  // Mood × metric correlation — pairs each metric value with that day's
  // mood score, then groups by value (boolean/select) or median split
  // (number/scale) to compare average mood between groups. Free-text
  // metrics aren't groupable, so they're skipped.
  interface CorrelationInput {
    name: string
    type: string
    options: string[] | null
    pairs: Array<{ value: string | number | boolean, mood: number }>
  }
  const correlationInputs = new Map<string, CorrelationInput>()

  for (const mv of (metricValues ?? []) as Array<Record<string, unknown>>) {
    const def = mv.definition as Record<string, unknown> | null
    if (!def) continue

    const entryDate = mv.entry_date as string
    const moodScore = moodByDate.get(entryDate)
    if (moodScore === undefined) continue

    const type = def.type as string
    const key = def.key as string

    let value: string | number | boolean | null = null
    if (type === 'boolean') value = mv.boolean_value as boolean | null
    else if (type === 'number' || type === 'scale') value = mv.number_value as number | null
    else if (type === 'select') value = mv.select_value as string | null
    if (value === null) continue

    if (!correlationInputs.has(key)) {
      correlationInputs.set(key, {
        name: def.name as string,
        type,
        options: (def.options as string[] | null) ?? null,
        pairs: []
      })
    }
    correlationInputs.get(key)!.pairs.push({ value, mood: moodScore })
  }

  const moodCorrelations: Array<{
    key: string
    name: string
    type: string
    groups: Array<{ label: string, avgMood: number, count: number }>
  }> = []

  for (const [key, info] of correlationInputs.entries()) {
    if (info.type === 'boolean') {
      const yes = info.pairs.filter(p => p.value === true).map(p => p.mood)
      const no = info.pairs.filter(p => p.value === false).map(p => p.mood)
      if (yes.length < MIN_GROUP_SIZE || no.length < MIN_GROUP_SIZE) continue
      moodCorrelations.push({
        key,
        name: info.name,
        type: info.type,
        groups: [
          { label: 'Sim', avgMood: average(yes), count: yes.length },
          { label: 'Não', avgMood: average(no), count: no.length }
        ]
      })
    } else if (info.type === 'number' || info.type === 'scale') {
      const values = info.pairs.map(p => p.value as number).sort((a, b) => a - b)
      const median = values[Math.floor(values.length / 2)]
      if (median === undefined) continue
      const high = info.pairs.filter(p => (p.value as number) > median).map(p => p.mood)
      const low = info.pairs.filter(p => (p.value as number) <= median).map(p => p.mood)
      if (high.length < MIN_GROUP_SIZE || low.length < MIN_GROUP_SIZE) continue
      moodCorrelations.push({
        key,
        name: info.name,
        type: info.type,
        groups: [
          { label: 'Acima da mediana', avgMood: average(high), count: high.length },
          { label: 'Na mediana ou abaixo', avgMood: average(low), count: low.length }
        ]
      })
    } else if (info.type === 'select' && info.options) {
      const groups = info.options
        .map((option) => {
          const vals = info.pairs.filter(p => p.value === option).map(p => p.mood)
          return { label: option, avgMood: average(vals), count: vals.length }
        })
        .filter(g => g.count >= MIN_GROUP_SIZE)
      if (groups.length >= 2) {
        moodCorrelations.push({ key, name: info.name, type: info.type, groups })
      }
    }
  }

  return {
    range: params.range,
    totalEntries: totalEntries ?? 0,
    metrics,
    entriesByDayOfWeek,
    moodCorrelations
  }
})
