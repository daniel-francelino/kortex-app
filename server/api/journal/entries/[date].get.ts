import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'
import { mapJournalEntry, mapJournalTag, mapMetricValue } from '../../../utils/journal-mappers'

const paramSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const params = paramSchema.parse(getRouterParams(event))

  const supabase = getSupabaseAdminClient()

  // Fetch entry
  const { data: entry, error } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('user_id', user.id)
    .eq('entry_date', params.date)
    .is('archived_at', null)
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  if (!entry) {
    // Return empty entry template for the date
    return {
      entryDate: params.date,
      entry: null,
      tags: [],
      metrics: []
    }
  }

  const entryObj = entry as Record<string, unknown>
  const entryId = entryObj.id as string

  // Fetch tags
  const { data: tagLinks } = await supabase
    .from('journal_entry_tags')
    .select('tag:journal_tags(*)')
    .eq('entry_id', entryId)

  const tags = (tagLinks ?? [])
    .map((l: Record<string, unknown>) => l.tag as Record<string, unknown> | null)
    .filter((t): t is Record<string, unknown> => Boolean(t))
    .map(mapJournalTag)

  // Fetch metric values with definitions
  const { data: metricValues } = await supabase
    .from('metric_values')
    .select('*, definition:metric_definitions(*)')
    .eq('user_id', user.id)
    .eq('entry_date', params.date)

  return {
    entryDate: params.date,
    entry: { ...mapJournalEntry(entryObj), tags },
    tags,
    metrics: (metricValues ?? []).map(mapMetricValue)
  }
})
