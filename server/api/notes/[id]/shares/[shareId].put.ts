import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../utils/supabase'
import { requireAuthUser } from '../../../../utils/require-auth'

const bodySchema = z.object({
  permission: z.enum(['view', 'edit'])
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const noteId = z.string().uuid().parse(getRouterParam(event, 'id'))
  const shareId = z.string().uuid().parse(getRouterParam(event, 'shareId'))
  const body = await readBody(event)
  const payload = bodySchema.parse(body)
  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('note_shares')
    .update({ permission: payload.permission })
    .eq('id', shareId)
    .eq('note_id', noteId)
    .eq('owner_id', user.id)
    .select()
    .single()

  if (error || !data) {
    throw createError({ statusCode: 404, statusMessage: 'Compartilhamento não encontrado' })
  }

  return {
    id: data.id,
    noteId: data.note_id,
    ownerId: data.owner_id,
    sharedWithUserId: data.shared_with_user_id ?? null,
    sharedWithEmail: data.shared_with_email,
    permission: data.permission,
    status: data.status,
    createdAt: data.created_at
  }
})
