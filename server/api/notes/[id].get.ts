import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = z.string().uuid().parse(getRouterParam(event, 'id'))
  const supabase = getSupabaseAdminClient()

  // Fetch note
  const { data: note, error } = await supabase
    .from('notes')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (error || !note) {
    throw createError({ statusCode: 404, statusMessage: 'Nota não encontrada' })
  }

  // Fetch tags
  const { data: tagLinks } = await supabase
    .from('note_tag_links')
    .select('tag:note_tags(*)')
    .eq('note_id', id)

  const tags = (tagLinks ?? []).map((link: Record<string, unknown>) => {
    const tag = link.tag as Record<string, unknown>
    return {
      id: tag.id as string,
      userId: tag.user_id as string,
      name: tag.name as string,
      color: (tag.color as string) ?? null,
      createdAt: tag.created_at as string
    }
  })

  // Fetch links (outgoing)
  const { data: linksRaw } = await supabase
    .from('note_links')
    .select('id, source_note_id, target_note_id, created_at, target:notes!note_links_target_note_id_fkey(id, title, type)')
    .eq('source_note_id', id)

  const links = (linksRaw ?? []).map((row: Record<string, unknown>) => {
    const target = row.target as Record<string, unknown> | null
    return {
      id: row.id as string,
      sourceNoteId: row.source_note_id as string,
      targetNoteId: row.target_note_id as string,
      createdAt: row.created_at as string,
      targetNote: target
        ? { id: target.id as string, title: target.title as string, type: target.type as string }
        : null
    }
  })

  // Fetch backlinks (incoming)
  const { data: backlinksRaw } = await supabase
    .from('note_links')
    .select('id, source_note_id, target_note_id, created_at, source:notes!note_links_source_note_id_fkey(id, title, type)')
    .eq('target_note_id', id)

  const backlinks = (backlinksRaw ?? []).map((row: Record<string, unknown>) => {
    const source = row.source as Record<string, unknown> | null
    return {
      id: row.id as string,
      sourceNoteId: row.source_note_id as string,
      targetNoteId: row.target_note_id as string,
      createdAt: row.created_at as string,
      sourceNote: source
        ? { id: source.id as string, title: source.title as string, type: source.type as string }
        : null
    }
  })

  return {
    id: note.id,
    userId: note.user_id,
    title: note.title,
    content: note.content ?? null,
    type: note.type,
    pinned: note.pinned,
    pinnedAt: note.pinned_at ?? null,
    icon: note.icon ?? null,
    position: note.position ?? 0,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
    folderId: note.folder_id ?? null,
    visibility: note.visibility ?? 'private',
    shareToken: note.share_token ?? null,
    tags,
    links,
    backlinks
  }
})
