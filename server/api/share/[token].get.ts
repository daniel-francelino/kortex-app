import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { extractLinkedNoteIds } from '../../utils/extract-linked-note-ids'

// Public, unauthenticated endpoint — the only one in this project that serves
// user content without requireAuthUser(). Always revalidates visibility='public'
// against the token, and returns a narrow projection (never userId, tags,
// backlinks, etc). See docs/PLANO_COMPARTILHAMENTO_E_OFFLINE.md (A.6).
export default eventHandler(async (event) => {
  const token = z.string().min(1).max(200).parse(getRouterParam(event, 'token'))
  const supabase = getSupabaseAdminClient()

  const { data: note } = await supabase
    .from('notes')
    .select('title, icon, type, content, updated_at')
    .eq('share_token', token)
    .eq('visibility', 'public')
    .is('deleted_at', null)
    .maybeSingle()

  // 404, never 403 — an invalid token and a token for a note that went back to
  // private must look identical to a visitor probing links.
  if (!note) {
    throw createError({ statusCode: 404, statusMessage: 'Nota não encontrada' })
  }

  const linkedNoteIds = extractLinkedNoteIds(note.content)
  const publicWikilinkTargets: Record<string, string> = {}

  if (linkedNoteIds.length > 0) {
    const { data: publicTargets } = await supabase
      .from('notes')
      .select('id, share_token')
      .in('id', linkedNoteIds)
      .eq('visibility', 'public')
      .is('deleted_at', null)

    for (const row of publicTargets ?? []) {
      const target = row as { id: string, share_token: string | null }
      if (target.share_token) publicWikilinkTargets[target.id] = target.share_token
    }
  }

  return {
    title: note.title,
    icon: note.icon ?? null,
    type: note.type,
    content: note.content ?? null,
    updatedAt: note.updated_at,
    publicWikilinkTargets
  }
})
