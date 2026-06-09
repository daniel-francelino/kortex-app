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

export interface EditorAttachmentRef {
  bucket: string
  path: string
  kind: 'image' | 'file'
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

export function extractEditorAttachmentRefs(value?: string | null | EditorDoc | unknown): EditorAttachmentRef[] {
  const doc = typeof value === 'string'
    ? parseEditorContent(value)
    : value as EditorDoc | undefined

  if (!doc?.content?.length) return []

  const refs: EditorAttachmentRef[] = []

  function walk(node: EditorTextNode) {
    if ((node.type === 'editorImage' || node.type === 'editorFile') && node.attrs) {
      const bucket = typeof node.attrs.bucket === 'string' ? node.attrs.bucket : ''
      const path = typeof node.attrs.path === 'string' ? node.attrs.path : ''
      if (bucket && path) {
        refs.push({
          bucket,
          path,
          kind: node.type === 'editorImage' ? 'image' : 'file'
        })
      }
    }

    node.content?.forEach(walk)
  }

  doc.content.forEach(walk)

  return refs
}

export function isEditorContentEmpty(value?: string | null): boolean {
  const input = value?.trim()
  if (!input) return true

  const doc = parseEditorContent(input)
  if (!doc?.content?.length) return true

  function hasText(node: EditorTextNode): boolean {
    if (node.type === 'text' && Boolean(node.text?.trim())) return true
    if (['editorImage', 'editorFile', 'linkPreview', 'mention', 'emoji'].includes(node.type)) return true
    if (node.type === 'callout' && node.attrs?.icon) return true
    return (node.content ?? []).some(hasText)
  }

  return !doc.content.some(hasText)
}
