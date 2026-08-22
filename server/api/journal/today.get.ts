import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { mapJournalEntry, mapJournalTag, mapMetricValue } from '../../utils/journal-mappers'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const supabase = getSupabaseAdminClient()

  const today = new Date().toISOString().split('T')[0] ?? ''

  // Try to get today's entry
  const { data: entry } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('user_id', user.id)
    .eq('entry_date', today)
    .is('archived_at', null)
    .maybeSingle()

  let tags: unknown[] = []
  let metrics: unknown[] = []

  if (entry) {
    const entryObj = entry as Record<string, unknown>
    const entryId = entryObj.id as string

    // Fetch tags
    const { data: tagLinks } = await supabase
      .from('journal_entry_tags')
      .select('tag:journal_tags(*)')
      .eq('entry_id', entryId)

    tags = (tagLinks ?? [])
      .map((l: Record<string, unknown>) => l.tag as Record<string, unknown> | null)
      .filter((t): t is Record<string, unknown> => Boolean(t))
      .map(mapJournalTag)

    // Fetch metric values
    const { data: metricValues } = await supabase
      .from('metric_values')
      .select('*, definition:metric_definitions(*)')
      .eq('user_id', user.id)
      .eq('entry_date', today)

    metrics = (metricValues ?? []).map(mapMetricValue)
  }

  // Current streak: consecutive days (ending today) with a non-archived entry
  const { data: recentEntries } = await supabase
    .from('journal_entries')
    .select('entry_date')
    .eq('user_id', user.id)
    .is('archived_at', null)
    .order('entry_date', { ascending: false })
    .limit(60)

  let streak = 0
  if (recentEntries && recentEntries.length > 0) {
    const entryDates = new Set(
      (recentEntries as Array<Record<string, unknown>>).map(e => e.entry_date as string)
    )
    const cursor = new Date(`${today}T12:00:00Z`)
    while (true) {
      const dateStr = cursor.toISOString().split('T')[0]!
      if (entryDates.has(dateStr)) {
        streak++
        cursor.setDate(cursor.getDate() - 1)
      } else {
        break
      }
    }
  }

  return {
    entryDate: today,
    entry: entry ? { ...mapJournalEntry(entry as Record<string, unknown>), tags } : null,
    metrics,
    streak
  }
})
