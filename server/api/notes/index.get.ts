import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(20),
  search: z.string().max(200).optional(),
  type: z.enum(['note', 'idea', 'concept', 'research', 'book_note']).optional(),
  tagId: z.string().uuid().optional(),
  pinned: z.preprocess((v) => {
    if (v === undefined) return undefined
    if (typeof v === 'boolean') return v
    if (typeof v === 'string') {
      if (['true', '1'].includes(v.toLowerCase())) return true
      if (['false', '0'].includes(v.toLowerCase())) return false
    }
    return undefined
  }, z.boolean().optional())
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const query = getQuery(event)
  const params = querySchema.parse(query)
  const supabase = getSupabaseAdminClient()

  const from = (params.page - 1) * params.pageSize
  const to = from + params.pageSize - 1

  let qb = supabase
    .from('notes')
    .select('*', { count: 'exact' })
    .eq('user_id', user.id)
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })
    .range(from, to)

  if (params.search) {
    qb = qb.ilike('title', `%${params.search}%`)
  }

  if (params.type) {
    qb = qb.eq('type', params.type)
  }

  if (params.pinned !== undefined) {
    qb = qb.eq('pinned', params.pinned)
  }

  const { data, error, count } = await qb

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao buscar notas', data: error.message })
  }

  let notes = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    userId: row.user_id as string,
    title: row.title as string,
    content: (row.content as string) ?? null,
    type: row.type as string,
    pinned: row.pinned as boolean,
    pinnedAt: (row.pinned_at as string) ?? null,
    icon: (row.icon as string) ?? null,
    position: (row.position as number) ?? 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    folderId: (row.folder_id as string) ?? null,
    tags: [] as Array<{ id: string, name: string, color: string | null }>,
    linkCount: 0,
    backlinkCount: 0
  }))

  if (notes.length > 0) {
    const noteIds = notes.map(n => n.id)

    // Fetch tags for notes
    const { data: tagLinks } = await supabase
      .from('note_tag_links')
      .select('note_id, tag:note_tags(*)')
      .in('note_id', noteIds)

    if (tagLinks) {
      const tagMap = new Map<string, Array<{ id: string, name: string, color: string | null }>>()
      for (const link of tagLinks) {
        const noteId = link.note_id as string
        const tagRelation = link.tag as unknown
        const tag = (Array.isArray(tagRelation) ? tagRelation[0] : tagRelation) as Record<string, unknown> | undefined
        if (!tag) continue
        if (!tagMap.has(noteId)) tagMap.set(noteId, [])
        tagMap.get(noteId)!.push({
          id: tag.id as string,
          name: tag.name as string,
          color: (tag.color as string) ?? null
        })
      }
      notes = notes.map(n => ({ ...n, tags: tagMap.get(n.id) ?? [] }))
    }

    // Fetch link counts
    const { data: linkCounts } = await supabase
      .from('note_links')
      .select('source_note_id')
      .in('source_note_id', noteIds)

    const { data: backlinkCounts } = await supabase
      .from('note_links')
      .select('target_note_id')
      .in('target_note_id', noteIds)

    if (linkCounts) {
      const countMap = new Map<string, number>()
      for (const row of linkCounts) {
        const id = (row as Record<string, unknown>).source_note_id as string
        countMap.set(id, (countMap.get(id) ?? 0) + 1)
      }
      notes = notes.map(n => ({ ...n, linkCount: countMap.get(n.id) ?? 0 }))
    }

    if (backlinkCounts) {
      const countMap = new Map<string, number>()
      for (const row of backlinkCounts) {
        const id = (row as Record<string, unknown>).target_note_id as string
        countMap.set(id, (countMap.get(id) ?? 0) + 1)
      }
      notes = notes.map(n => ({ ...n, backlinkCount: countMap.get(n.id) ?? 0 }))
    }
  }

  // Filter by tag after fetching (tag join is separate)
  if (params.tagId) {
    const { data: taggedNoteIds } = await supabase
      .from('note_tag_links')
      .select('note_id')
      .eq('tag_id', params.tagId)

    if (taggedNoteIds) {
      const ids = new Set(taggedNoteIds.map(r => (r as Record<string, unknown>).note_id as string))
      notes = notes.filter(n => ids.has(n.id))
    }
  }

  return {
    data: notes,
    total: count ?? 0,
    page: params.page,
    pageSize: params.pageSize
  }
})
