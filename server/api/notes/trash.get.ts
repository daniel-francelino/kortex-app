import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'

export interface TrashItem {
  id: string
  kind: 'note' | 'folder'
  title: string
  icon: string | null
  type: string | null
  deletedAt: string
}

export default eventHandler(async (event): Promise<TrashItem[]> => {
  const user = await requireAuthUser(event)
  const supabase = getSupabaseAdminClient()

  const { data: notes, error: notesError } = await supabase
    .from('notes')
    .select('id, title, icon, type, deleted_at')
    .eq('user_id', user.id)
    .not('deleted_at', 'is', null)

  if (notesError) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao buscar notas na lixeira', data: notesError.message })
  }

  const { data: folders, error: foldersError } = await supabase
    .from('note_folders')
    .select('id, name, deleted_at')
    .eq('user_id', user.id)
    .not('deleted_at', 'is', null)

  if (foldersError) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao buscar pastas na lixeira', data: foldersError.message })
  }

  const items: TrashItem[] = [
    ...(notes ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      kind: 'note' as const,
      title: row.title as string,
      icon: (row.icon as string) ?? null,
      type: row.type as string,
      deletedAt: row.deleted_at as string
    })),
    ...(folders ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      kind: 'folder' as const,
      title: row.name as string,
      icon: null,
      type: null,
      deletedAt: row.deleted_at as string
    }))
  ]

  items.sort((a, b) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime())

  return items
})
