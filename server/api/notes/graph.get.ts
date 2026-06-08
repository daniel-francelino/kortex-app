import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const supabase = getSupabaseAdminClient()

  // Fetch all user's notes (as graph nodes)
  const { data: notes, error: notesError } = await supabase
    .from('knowledge_notes')
    .select('id, title, type')
    .eq('user_id', user.id)

  if (notesError) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao buscar notas para o grafo', data: notesError.message })
  }

  const noteIds = (notes ?? []).map((n: Record<string, unknown>) => n.id as string)

  if (noteIds.length === 0) {
    return { nodes: [], edges: [] }
  }

  // Fetch all links between user's notes
  const { data: links, error: linksError } = await supabase
    .from('note_links')
    .select('id, source_note_id, target_note_id')
    .in('source_note_id', noteIds)

  if (linksError) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao buscar vínculos para o grafo', data: linksError.message })
  }

  // Count links per node
  const linkCountMap = new Map<string, number>()
  for (const link of (links ?? [])) {
    const sourceId = (link as Record<string, unknown>).source_note_id as string
    const targetId = (link as Record<string, unknown>).target_note_id as string
    linkCountMap.set(sourceId, (linkCountMap.get(sourceId) ?? 0) + 1)
    linkCountMap.set(targetId, (linkCountMap.get(targetId) ?? 0) + 1)
  }

  const nodes = (notes ?? []).map((n: Record<string, unknown>) => ({
    id: n.id as string,
    title: n.title as string,
    type: n.type as string,
    linkCount: linkCountMap.get(n.id as string) ?? 0
  }))

  const edges = (links ?? []).map((l: Record<string, unknown>) => ({
    id: l.id as string,
    source: l.source_note_id as string,
    target: l.target_note_id as string
  }))

  return { nodes, edges }
})
