import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireCronSecret } from '../../../utils/require-cron-secret'

const PURGE_AFTER_DAYS = 30

/**
 * Permanently deletes anything that has been sitting in the trash (notes and
 * folders with deleted_at set) for longer than PURGE_AFTER_DAYS. Intended to
 * be called by a daily cron job — the schedule itself is not part of this
 * repository (same pattern as server/api/habits/cron-skip.post.ts).
 *
 * Requires a shared secret via the `x-cron-secret` header. The expected
 * secret is stored in `runtimeConfig.cronSecret`.
 */
export default eventHandler(async (event) => {
  requireCronSecret(event)

  const supabase = getSupabaseAdminClient()
  const cutoff = new Date(Date.now() - PURGE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // Folders first — cascades to their subfolders/notes via ON DELETE CASCADE,
  // which also covers notes that were only ever marked deleted as a side
  // effect of their folder being deleted (same deleted_at timestamp).
  const { data: purgedFolders, error: foldersError } = await supabase
    .from('note_folders')
    .delete()
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff)
    .select('id')

  if (foldersError) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao purgar pastas', data: foldersError.message })
  }

  // Notes deleted individually (not via a folder purge above).
  const { data: purgedNotes, error: notesError } = await supabase
    .from('notes')
    .delete()
    .not('deleted_at', 'is', null)
    .lt('deleted_at', cutoff)
    .select('id')

  if (notesError) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao purgar notas', data: notesError.message })
  }

  return {
    purgedFolders: purgedFolders?.length ?? 0,
    purgedNotes: purgedNotes?.length ?? 0,
    cutoff
  }
})
