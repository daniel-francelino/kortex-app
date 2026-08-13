import type { SupabaseClient } from '@supabase/supabase-js'

export type NoteAccessRole = 'owner' | 'edit' | 'view'

/**
 * Resolves what access (if any) a user has to a note: the owner always gets
 * 'owner'; otherwise a note_shares grant determines 'edit'/'view'; null means
 * no access at all (caller should respond 404, not 403, to avoid confirming
 * the note exists).
 */
export async function getNoteAccessRole(
  supabase: SupabaseClient,
  noteId: string,
  userId: string
): Promise<NoteAccessRole | null> {
  const { data: note } = await supabase
    .from('notes')
    .select('user_id')
    .eq('id', noteId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!note) return null
  if (note.user_id === userId) return 'owner'

  const { data: share } = await supabase
    .from('note_shares')
    .select('permission')
    .eq('note_id', noteId)
    .eq('shared_with_user_id', userId)
    .maybeSingle()

  if (!share) return null
  return share.permission === 'edit' ? 'edit' : 'view'
}
