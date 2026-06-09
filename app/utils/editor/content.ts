export interface EditorTextNode {
  type: string
  text?: string
  attrs?: Record<string, unknown>
  content?: EditorTextNode[]
}

export interface EditorDoc {
  type: 'doc'
  content?: EditorTextNode[]
}

export function createEmptyEditorDoc(): EditorDoc {
  return {
    type: 'doc',
    content: [{ type: 'paragraph' }]
  }
}

export function parseEditorContent(value?: string | null): EditorDoc | undefined {
  const input = value?.trim()
  if (!input) return undefined

  try {
    const parsed = JSON.parse(input) as Partial<EditorDoc>
    if (parsed?.type === 'doc') return parsed as EditorDoc
  } catch {
    // Keep legacy plain text readable.
  }

  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: input }]
      }
    ]
  }
}

export function normalizeEditorContent(value?: string | null): EditorDoc {
  return parseEditorContent(value) ?? createEmptyEditorDoc()
}

export function serializeEditorContent(json: unknown): string {
  return JSON.stringify(json)
}

export function isEditorContentEmpty(value?: string | null): boolean {
  const input = value?.trim()
  if (!input) return true

  const doc = parseEditorContent(input)
  if (!doc?.content?.length) return true

  function hasText(node: EditorTextNode): boolean {
    if (node.type === 'text' && Boolean(node.text?.trim())) return true
    if (['editorImage', 'editorFile', 'mention', 'emoji'].includes(node.type)) return true
    if (node.type === 'callout' && node.attrs?.icon) return true
    return (node.content ?? []).some(hasText)
  }

  return !doc.content.some(hasText)
}
