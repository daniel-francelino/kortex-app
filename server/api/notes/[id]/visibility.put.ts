import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'
import { createShareToken } from '../../../utils/share-token'

const bodySchema = z.object({
  visibility: z.enum(['private', 'shared', 'public'])
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = z.string().uuid().parse(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const payload = bodySchema.parse(body)
  const supabase = getSupabaseAdminClient()

  const { data: existing, error: fetchError } = await supabase
    .from('notes')
    .select('id, share_token')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !existing) {
    throw createError({ statusCode: 404, statusMessage: 'Nota não encontrada' })
  }

  const updateData: Record<string, unknown> = {
    visibility: payload.visibility,
    updated_at: new Date().toISOString()
  }

  // Generate the share token the first time the note becomes public. It's kept
  // around if the note later goes back to private, so re-publishing reuses it —
  // the public endpoint always revalidates visibility='public' before serving
  // anything, so this is safe.
  if (payload.visibility === 'public' && !existing.share_token) {
    updateData.share_token = createShareToken()
    updateData.share_token_created_at = new Date().toISOString()
  }

  const { data, error } = await supabase
    .from('notes')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao atualizar visibilidade', data: error.message })
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
