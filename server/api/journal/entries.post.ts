import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { mapJournalEntry } from '../../utils/journal-mappers'

const bodySchema = z.object({
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // 500, not 200 — quando `isEncrypted`, este campo carrega base64 do
  // ciphertext (maior que o título em claro), não o título em si.
  title: z.string().max(500).nullable().optional(),
  content: z.string().min(1),
  mood: z.enum(['very_bad', 'bad', 'neutral', 'good', 'very_good']).nullable().optional(),
  isEncrypted: z.boolean().optional(),
  contentIv: z.string().nullable().optional(),
  titleIv: z.string().nullable().optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody(event)
  const parsed = bodySchema.parse(body)

  const supabase = getSupabaseAdminClient()

  // `isEncrypted`/`contentIv`/`titleIv` só entram no upsert quando o
  // cliente de fato os envia — omitidos, o Supabase deixa o valor existente
  // intacto num conflito (upsert só seta as colunas presentes no objeto) e
  // usa o default da coluna (`false`/`null`) numa entrada nova. Isso evita
  // que uma chamada que não sabe nada sobre criptografia (ex.: um autosave
  // silencioso antigo) resete `is_encrypted` sem querer.
  const upsertPayload: Record<string, unknown> = {
    user_id: user.id,
    entry_date: parsed.entryDate,
    title: parsed.title ?? null,
    content: parsed.content,
    mood: parsed.mood ?? null,
    updated_at: new Date().toISOString()
  }
  if (parsed.isEncrypted !== undefined) {
    upsertPayload.is_encrypted = parsed.isEncrypted
    upsertPayload.content_iv = parsed.contentIv ?? null
    upsertPayload.title_iv = parsed.titleIv ?? null
  }

  // Upsert entry (one per user per date)
  const { data, error } = await supabase
    .from('journal_entries')
    .upsert(upsertPayload, { onConflict: 'user_id,entry_date' })
    .select('*')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: error.message })
  }

  return mapJournalEntry(data)
})
