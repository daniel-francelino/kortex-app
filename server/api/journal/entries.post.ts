import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'

const bodySchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().max(200).nullable().optional(),
  content: z.string().min(1),
  mood: z.enum(['very_bad', 'bad', 'neutral', 'good', 'very_good']).nullable().optional(),
  tags: z.array(z.string().max(50)).optional()
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

  // Handle tags if provided
  if (parsed.tags && parsed.tags.length > 0) {
    const entryId = (data as Record<string, unknown>).id as string

    // Remove existing tag links
    await supabase
      .from('journal_entry_tags')
      .delete()
      .eq('entry_id', entryId)

    // Ensure tags exist and link them
    for (const tagName of parsed.tags) {
      // Upsert tag
      const { data: tag } = await supabase
        .from('journal_tags')
        .upsert({ user_id: user.id, name: tagName }, { onConflict: 'user_id,name' })
        .select('id')
        .single()

      if (tag) {
        const tagId = (tag as Record<string, unknown>).id as string
        await supabase
          .from('journal_entry_tags')
          .insert({ entry_id: entryId, tag_id: tagId })
      }
    }
  }

  return data
})
