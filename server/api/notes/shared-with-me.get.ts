import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('note_shares')
    .select('permission, note:notes(*)')
    .eq('shared_with_user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao listar notas compartilhadas', data: error.message })
  }

  return (data ?? [])
    .map((row: Record<string, unknown>) => {
      const noteRelation = row.note as unknown
      const note = (Array.isArray(noteRelation) ? noteRelation[0] : noteRelation) as Record<string, unknown> | null
      // The owner may have deleted the note, or revoked/downgraded visibility
      // in a way that no longer applies here — either way there's nothing to show.
      if (!note) return null

      return {
        id: note.id as string,
        userId: note.user_id as string,
        title: note.title as string,
        content: (note.content as string) ?? null,
        type: note.type as string,
        pinned: note.pinned as boolean,
        pinnedAt: (note.pinned_at as string) ?? null,
        icon: (note.icon as string) ?? null,
        position: (note.position as number) ?? 0,
        createdAt: note.created_at as string,
        updatedAt: note.updated_at as string,
        folderId: (note.folder_id as string) ?? null,
        visibility: (note.visibility as string) ?? 'private',
        shareToken: (note.share_token as string) ?? null,
        permission: row.permission as string
      }
    })
    .filter((note): note is NonNullable<typeof note> => note !== null)
})
