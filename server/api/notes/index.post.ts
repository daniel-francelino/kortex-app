import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'

const bodySchema = z.object({
  title: z.string().min(1, 'Título é obrigatório').max(500),
  content: z.string().optional(),
  type: z.enum(['note', 'idea', 'concept', 'research', 'book_note']).default('note'),
  tagIds: z.array(z.string().uuid()).optional(),
  folderId: z.string().uuid().nullable().optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody(event)
  const payload = bodySchema.parse(body)
  const supabase = getSupabaseAdminClient()

  // New notes are placed at the top of the custom order.
  const { data: lowest } = await supabase
    .from('notes')
    .select('position')
    .eq('user_id', user.id)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle()

  const position = lowest ? (lowest.position as number) - 1000 : 0

  const { data, error } = await supabase
    .from('notes')
    .insert({
      user_id: user.id,
      title: payload.title,
      content: payload.content ?? null,
      type: payload.type,
      folder_id: payload.folderId ?? null,
      position
    })
    .select()
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao criar nota', data: error.message })
  }

  // Attach tags if provided
  if (payload.tagIds && payload.tagIds.length > 0) {
    const tagLinks = payload.tagIds.map(tagId => ({
      note_id: data.id,
      tag_id: tagId
    }))
    await supabase.from('note_tag_links').insert(tagLinks)
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
    folderId: data.folder_id ?? null
  }
})
