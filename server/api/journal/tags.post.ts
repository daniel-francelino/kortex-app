import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { mapJournalTag } from '../../utils/journal-mappers'

const bodySchema = z.object({
  name: z.string().min(1).max(50)
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody(event)
  const parsed = bodySchema.parse(body)

  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('journal_tags')
    .insert({ user_id: user.id, name: parsed.name })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'Essa tag já existe.' })
    }
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return mapJournalTag(data)
})
