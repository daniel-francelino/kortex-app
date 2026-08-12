interface ContentNode {
  type: string
  attrs?: Record<string, unknown>
  content?: ContentNode[]
}

/** Mirrors app/components/notes/NoteEditor.vue's extractLinkedNoteIds — used
 * server-side to know which notes a wikilink/mention points to, so the public
 * share endpoint can tell the client which of those targets are safe to render
 * as clickable links (i.e. also public). */
export function extractLinkedNoteIds(contentJson: string | null): string[] {
  if (!contentJson) return []
  try {
    const doc = JSON.parse(contentJson) as { content?: ContentNode[] }
    const ids: string[] = []

    function walk(nodes: ContentNode[]) {
      for (const node of nodes) {
        if (node.type === 'wikilink' && typeof node.attrs?.noteId === 'string') {
          ids.push(node.attrs.noteId)
        }
        if (node.type === 'mention' && node.attrs?.kind === 'note' && typeof node.attrs.id === 'string') {
          ids.push(node.attrs.id)
        }
        if (node.content) walk(node.content)
      }
    }

    walk(doc.content ?? [])
    return [...new Set(ids)]
  } catch {
    return []
  }
}
