import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../utils/supabase'
import { requireAuthUser } from '../../../../utils/require-auth'
import { mapPeriodicNote } from '../../../../utils/journal-mappers'

const paramSchema = z.object({
  type: z.enum(['week', 'month']),
  key: z.string().min(4).max(20)
})

const querySchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const params = paramSchema.parse(getRouterParams(event))
  const query = querySchema.parse(getQuery(event))

  const supabase = getSupabaseAdminClient()

  const { data: noteRow, error: noteError } = await supabase
    .from('journal_periodic_notes')
    .select('*')
    .eq('user_id', user.id)
    .eq('period_type', params.type)
    .eq('period_key', params.key)
    .is('archived_at', null)
    .maybeSingle()

  if (noteError) {
    throw createError({ statusCode: 500, statusMessage: noteError.message })
  }

  // Entradas diárias do período — só os campos leves pra listar/linkar,
  // não o conteúdo inteiro (que pode estar cifrado de qualquer forma).
  const { data: entryRows, error: entriesError } = await supabase
    .from('journal_entries')
    .select('entry_date, title, mood, is_encrypted')
    .eq('user_id', user.id)
    .is('archived_at', null)
    .gte('entry_date', query.start)
    .lte('entry_date', query.end)
    .order('entry_date', { ascending: true })

  if (entriesError) {
    throw createError({ statusCode: 500, statusMessage: entriesError.message })
  }

  const entries = (entryRows ?? []).map((e: Record<string, unknown>) => ({
    entryDate: e.entry_date as string,
    // Título cifrado não serve pra listar — mostra vazio em vez de ciphertext.
    title: e.is_encrypted ? null : (e.title as string | null),
    mood: e.mood as string | null,
    isEncrypted: e.is_encrypted as boolean
  }))

  return {
    note: noteRow ? mapPeriodicNote(noteRow as Record<string, unknown>) : null,
    entries
  }
})
