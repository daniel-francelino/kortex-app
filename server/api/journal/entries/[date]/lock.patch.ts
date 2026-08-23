import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../utils/supabase'
import { requireAuthUser } from '../../../../utils/require-auth'
import { mapJournalEntry } from '../../../../utils/journal-mappers'

const paramSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
})

const bodySchema = z.object({
  locked: z.boolean()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const params = paramSchema.parse(getRouterParams(event))
  const body = await readBody(event)
  const parsed = bodySchema.parse(body)

  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('journal_entries')
    .update({ locked: parsed.locked })
    .eq('user_id', user.id)
    .eq('entry_date', params.date)
    .is('archived_at', null)
    .select('*')
    .maybeSingle()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  if (!data) {
    throw createError({ statusCode: 404, statusMessage: 'Entrada não encontrada.' })
  }

  return mapJournalEntry(data as Record<string, unknown>)
})
