import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'
import { mapJournalEntry } from '../../../utils/journal-mappers'

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
      entry: null
    }
  }

  return {
    entryDate: params.date,
    entry: mapJournalEntry(entry as Record<string, unknown>)
  }
})
