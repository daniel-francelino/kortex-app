import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../utils/supabase'
import { requireAuthUser } from '../../../../utils/require-auth'
import { createShareToken } from '../../../../utils/share-token'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = z.string().uuid().parse(getRouterParam(event, 'id'))
  const supabase = getSupabaseAdminClient()

  const { data: existing, error: fetchError } = await supabase
    .from('notes')
    .select('id, visibility')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !existing) {
    throw createError({ statusCode: 404, statusMessage: 'Nota não encontrada' })
  }

  if (existing.visibility !== 'public') {
    throw createError({ statusCode: 400, statusMessage: 'A nota não está pública' })
  }

  const { data, error } = await supabase
    .from('notes')
    .update({
      share_token: createShareToken(),
      share_token_created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao gerar novo link', data: error.message })
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
