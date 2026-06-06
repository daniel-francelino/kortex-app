import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'

const bodySchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().optional(),
  type: z.enum(['note', 'idea', 'concept', 'research', 'book_note']).optional(),
  pinned: z.boolean().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  folderId: z.string().uuid().nullable().optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = z.string().uuid().parse(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const payload = bodySchema.parse(body)
  const supabase = getSupabaseAdminClient()

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (payload.title !== undefined) updateData.title = payload.title
  if (payload.content !== undefined) updateData.content = payload.content
  if (payload.type !== undefined) updateData.type = payload.type
  if (payload.pinned !== undefined) updateData.pinned = payload.pinned
  if (payload.folderId !== undefined) updateData.folder_id = payload.folderId

  const { data, error } = await supabase
    .from('knowledge_notes')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao atualizar nota', data: error.message })
  }

  // Sync tags if provided
  if (payload.tagIds !== undefined) {
    await supabase.from('note_tag_links').delete().eq('note_id', id)
    if (payload.tagIds.length > 0) {
      const tagLinks = payload.tagIds.map(tagId => ({
        note_id: id,
        tag_id: tagId
      }))
      await supabase.from('note_tag_links').insert(tagLinks)
    }
  }

  return {
    id: data.id,
    userId: data.user_id,
    title: data.title,
    content: data.content ?? null,
    type: data.type,
    pinned: data.pinned,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    folderId: data.folder_id ?? null
  }
})
