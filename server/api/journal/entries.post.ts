import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { mapJournalEntry } from '../../utils/journal-mappers'

const bodySchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().max(200).nullable().optional(),
  content: z.string().min(1),
  mood: z.enum(['very_bad', 'bad', 'neutral', 'good', 'very_good']).nullable().optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody(event)
  const parsed = bodySchema.parse(body)

  const supabase = getSupabaseAdminClient()

  // Upsert entry (one per user per date)
  const { data, error } = await supabase
    .from('journal_entries')
    .upsert({
      user_id: user.id,
      entry_date: parsed.entryDate,
      title: parsed.title ?? null,
      content: parsed.content,
      mood: parsed.mood ?? null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,entry_date' })
    .select('*')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return mapJournalEntry(data)
})
