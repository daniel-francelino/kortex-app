import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'

const bodySchema = z.object({
  targetNoteId: z.string().uuid()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const sourceId = z.string().uuid().parse(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const payload = bodySchema.parse(body)
  const supabase = getSupabaseAdminClient()

  // Verify source note ownership
  const { data: sourceNote } = await supabase
    .from('knowledge_notes')
    .select('id')
    .eq('id', sourceId)
    .eq('user_id', user.id)
    .single()

  if (!sourceNote) {
    throw createError({ statusCode: 404, statusMessage: 'Nota de origem não encontrada' })
  }

  // Verify target note ownership
  const { data: targetNote } = await supabase
    .from('knowledge_notes')
    .select('id')
    .eq('id', payload.targetNoteId)
    .eq('user_id', user.id)
    .single()

  if (!targetNote) {
    throw createError({ statusCode: 404, statusMessage: 'Nota de destino não encontrada' })
  }

  // Prevent self-linking
  if (sourceId === payload.targetNoteId) {
    throw createError({ statusCode: 400, statusMessage: 'Não é possível vincular uma nota a si mesma' })
  }

  const { data, error } = await supabase
    .from('note_links')
    .insert({
      source_note_id: sourceId,
      target_note_id: payload.targetNoteId
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'Este vínculo já existe' })
    }
    throw createError({ statusCode: 500, statusMessage: 'Erro ao criar vínculo', data: error.message })
  }

  return {
    id: data.id,
    sourceNoteId: data.source_note_id,
    targetNoteId: data.target_note_id,
    createdAt: data.created_at
  }
})
