import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { mapJournalEntry } from '../../utils/journal-mappers'
import { resolveUserTimezone } from '../../utils/user-timezone'
import { subCalendarDays, todayInZone } from '#shared/utils/dateTime'

const querySchema = z.object({
  tz: z.string().optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const supabase = getSupabaseAdminClient()
  const params = querySchema.parse(getQuery(event))

  const timezone = await resolveUserTimezone(supabase, user.id, params.tz)
  const today = todayInZone(timezone)

  // Try to get today's entry
  const { data: entry } = await supabase
    .from('journal_entries')
    .select('*')
    .eq('user_id', user.id)
    .eq('entry_date', today)
    .is('archived_at', null)
    .maybeSingle()

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
    let cursor = today
    while (entryDates.has(cursor)) {
      streak++
      cursor = subCalendarDays(cursor, 1)
    }
  }

  return {
    entryDate: today,
    entry: entry ? mapJournalEntry(entry as Record<string, unknown>) : null,
    streak
  }
})
