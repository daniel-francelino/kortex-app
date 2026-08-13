import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../../utils/supabase'
import { requireAuthUser } from '../../../../utils/require-auth'
import { createNotification } from '../../../../utils/notifications'

const bodySchema = z.object({
  email: z.string().email().max(320),
  permission: z.enum(['view', 'edit']).default('view')
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const noteId = z.string().uuid().parse(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const payload = bodySchema.parse(body)
  const supabase = getSupabaseAdminClient()

  const { data: note } = await supabase
    .from('notes')
    .select('id, title')
    .eq('id', noteId)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!note) {
    throw createError({ statusCode: 404, statusMessage: 'Nota não encontrada' })
  }

  const email = payload.email.toLowerCase()

  // Resolve to an existing account, if there is one. If not, the invite stays
  // pending until the person signs up/logs in with this email — see
  // server/utils/reconcile-pending-shares.ts.
  const { data: resolvedUserId } = await supabase.rpc('get_user_id_by_email', { lookup_email: email })

  const { data, error } = await supabase
    .from('note_shares')
    .insert({
      note_id: noteId,
      owner_id: user.id,
      shared_with_email: email,
      shared_with_user_id: resolvedUserId ?? null,
      permission: payload.permission,
      status: resolvedUserId ? 'accepted' : 'pending'
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      throw createError({ statusCode: 409, statusMessage: 'Esta pessoa já tem acesso a esta nota' })
    }
    throw createError({ statusCode: 500, statusMessage: 'Erro ao compartilhar nota', data: error.message })
  }

  // Only notify when the invite resolves to an existing account right away —
  // pending invites (no account yet) get no notification until reconciled.
  if (resolvedUserId && resolvedUserId !== user.id) {
    const senderName = (user.user_metadata?.name as string | undefined) || user.email || 'Alguém'
    const noteTitle = note.title || 'Sem título'

    await createNotification(supabase, {
      userId: resolvedUserId,
      type: 'user',
      category: 'note_shared',
      body: `${senderName} compartilhou a nota "${noteTitle}" com você.`,
      linkPath: '/app/notes/shared-with-me',
      senderName,
      senderEmail: user.email,
      senderAvatarUrl: (user.user_metadata?.avatar_url as string | undefined) || null,
      metadata: { noteId, noteShareId: data.id }
    })
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
