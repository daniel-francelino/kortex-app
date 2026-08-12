import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { getNoteAccessRole } from '../../utils/note-access'

const bodySchema = z.object({
  title: z.string().min(1).max(500).optional(),
  content: z.string().optional(),
  type: z.enum(['note', 'idea', 'concept', 'research', 'book_note']).optional(),
  pinned: z.boolean().optional(),
  icon: z.string().nullable().optional(),
  tagIds: z.array(z.string().uuid()).optional(),
  folderId: z.string().uuid().nullable().optional(),
  position: z.number().optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = z.string().uuid().parse(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const payload = bodySchema.parse(body)
  const supabase = getSupabaseAdminClient()

  const accessRole = await getNoteAccessRole(supabase, id, user.id)
  if (!accessRole) {
    throw createError({ statusCode: 404, statusMessage: 'Nota não encontrada' })
  }
  if (accessRole === 'view') {
    throw createError({ statusCode: 403, statusMessage: 'Você só tem permissão de visualização nesta nota' })
  }
  const isOwner = accessRole === 'owner'

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (payload.title !== undefined) updateData.title = payload.title
  if (payload.content !== undefined) updateData.content = payload.content
  if (payload.type !== undefined) updateData.type = payload.type
  if (payload.pinned !== undefined) {
    updateData.pinned = payload.pinned
    // Server clock is the source of truth for "when was this pinned" — used to
    // sub-order pinned notes (earliest pinned first) in custom sort mode.
    updateData.pinned_at = payload.pinned ? new Date().toISOString() : null
  }
  if (payload.icon !== undefined) updateData.icon = payload.icon
  // folderId/position belong to the owner's personal organization scheme —
  // an "edit" share grant covers the note's content, not where it lives in
  // someone else's folder tree, so those two fields are owner-only.
  if (payload.folderId !== undefined && isOwner) updateData.folder_id = payload.folderId
  if (payload.position !== undefined && isOwner) updateData.position = payload.position

  const { data, error } = await supabase
    .from('notes')
    .update(updateData)
    .eq('id', id)
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
    pinnedAt: data.pinned_at ?? null,
    icon: data.icon ?? null,
    position: data.position ?? 0,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    folderId: data.folder_id ?? null,
    visibility: data.visibility ?? 'private',
    shareToken: data.share_token ?? null
  }
})
