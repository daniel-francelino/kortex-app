// Converts the Tiptap JSON documents used by Notas and Diário de Bordo
// (~/utils/editor/content.ts) into Markdown, for the "Exportar" feature
// (docs/journal/1.JOURNAL.md, item 15 do roadmap de mercado). Best-effort:
// covers every block/mark from the shared editor config
// (app/composables/useNotionEditor.ts) with a reasonable fallback for the
// few custom node types that don't have a natural Markdown equivalent
// (toggle, column/columns just render their children in sequence).

import type { EditorDoc, EditorTextNode } from '~/utils/editor/content'
import { normalizeEditorContent } from '~/utils/editor/content'

function escapeMd(text: string): string {
  return text.replace(/([\\`*_{}[\]()#+\-.!])/g, '\\$1')
}

function renderMarks(text: string, marks: { type: string, attrs?: Record<string, unknown> }[] | undefined): string {
  if (!marks?.length) return text
  let out = text
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold': out = `**${out}**`; break
      case 'italic': out = `*${out}*`; break
      case 'strike': out = `~~${out}~~`; break
      case 'code': out = `\`${out}\``; break
      case 'highlight': out = `==${out}==`; break
      case 'link': out = `[${out}](${mark.attrs?.href ?? ''})`; break
    }
  }
  return out
}

// Tiptap guarda marks dentro de cada text node (`node.marks`, não
// `node.attrs.marks`) — o tipo compartilhado `EditorTextNode` não declara
// isso porque as outras ferramentas do editor não precisam. Lido aqui via
// cast pontual em vez de alargar o tipo compartilhado por causa de um único
// consumidor.
function textMarks(node: EditorTextNode): { type: string, attrs?: Record<string, unknown> }[] | undefined {
  return (node as unknown as { marks?: { type: string, attrs?: Record<string, unknown> }[] }).marks
}

function inlineWithMarks(nodes: EditorTextNode[] | undefined): string {
  if (!nodes?.length) return ''
  return nodes.map((node) => {
    if (node.type === 'text') return renderMarks(escapeMd(node.text ?? ''), textMarks(node))
    if (node.type === 'hardBreak') return '  \n'
    if (node.type === 'wikilink') return `[[${(node.attrs?.title as string) ?? ''}]]`
    if (node.type === 'mention') return `@${(node.attrs?.label as string) || 'mencao'}`
    if (node.type === 'emoji') return (node.attrs?.emoji as string) ?? ''
    return inlineWithMarks(node.content)
  }).join('')
}

function indentLines(text: string, prefix: string): string {
  return text.split('\n').map(line => (line ? prefix + line : line)).join('\n')
}

function renderList(items: EditorTextNode[] | undefined, ordered: boolean, depth: number): string {
  if (!items?.length) return ''
  return items.map((item, i) => {
    const marker = ordered ? `${i + 1}. ` : '- '
    const body = (item.content ?? []).map(child => renderBlock(child, depth + 1)).filter(Boolean).join('\n\n')
    const indented = indentLines(body, ' '.repeat(marker.length)).trimStart()
    return marker + indented
  }).join('\n')
}

function renderTaskList(items: EditorTextNode[] | undefined, depth: number): string {
  if (!items?.length) return ''
  return items.map((item) => {
    const checked = item.attrs?.checked ? 'x' : ' '
    const body = (item.content ?? []).map(child => renderBlock(child, depth + 1)).filter(Boolean).join('\n\n')
    const indented = indentLines(body, '  ').trimStart()
    return `- [${checked}] ${indented}`
  }).join('\n')
}

function renderTable(rows: EditorTextNode[] | undefined): string {
  if (!rows?.length) return ''
  const lines: string[] = []
  rows.forEach((row, rowIndex) => {
    const cells = (row.content ?? []).map(cell => inlineWithMarks(flattenInline(cell.content)).replace(/\|/g, '\\|').trim())
    lines.push(`| ${cells.join(' | ')} |`)
    if (rowIndex === 0) lines.push(`| ${cells.map(() => '---').join(' | ')} |`)
  })
  return lines.join('\n')
}

// Achata os parágrafos dentro de uma célula de tabela numa única linha
// inline — Markdown de tabela não suporta blocos multi-linha por célula.
function flattenInline(nodes: EditorTextNode[] | undefined): EditorTextNode[] {
  if (!nodes?.length) return []
  return nodes.flatMap(node => (node.type === 'paragraph' ? flattenInline(node.content) : [node]))
}

function renderBlock(node: EditorTextNode, depth = 0): string {
  switch (node.type) {
    case 'paragraph':
      return inlineWithMarks(node.content)
    case 'heading': {
      const level = Math.min(Math.max((node.attrs?.level as number) ?? 1, 1), 6)
      return `${'#'.repeat(level)} ${inlineWithMarks(node.content)}`
    }
    case 'bulletList':
      return renderList(node.content, false, depth)
    case 'orderedList':
      return renderList(node.content, true, depth)
    case 'taskList':
      return renderTaskList(node.content, depth)
    case 'blockquote':
      return indentLines((node.content ?? []).map(c => renderBlock(c, depth)).filter(Boolean).join('\n\n'), '> ')
    case 'codeBlock': {
      const lang = (node.attrs?.language as string) ?? ''
      const code = (node.content ?? []).map(t => t.text ?? '').join('')
      return `\`\`\`${lang}\n${code}\n\`\`\``
    }
    case 'horizontalRule':
      return '---'
    case 'table':
      return renderTable(node.content)
    case 'editorImage': {
      const src = (node.attrs?.src as string) ?? ''
      const alt = (node.attrs?.alt as string) || (node.attrs?.name as string) || ''
      return `![${alt}](${src})`
    }
    case 'editorFile': {
      const href = (node.attrs?.href as string) ?? ''
      const name = (node.attrs?.name as string) || 'Arquivo'
      return `[📎 ${name}](${href})`
    }
    case 'linkPreview': {
      const url = (node.attrs?.url as string) ?? ''
      const title = (node.attrs?.title as string) || url
      return `[${title}](${url})`
    }
    case 'callout': {
      const icon = (node.attrs?.icon as string) ?? '💡'
      const body = (node.content ?? []).map(c => renderBlock(c, depth)).filter(Boolean).join('\n\n')
      return indentLines(`${icon} ${body}`, '> ')
    }
    // Containers puramente visuais (toggle, column, columns) — sem
    // equivalente natural em Markdown, então só renderiza o conteúdo filho
    // em sequência, sem indicar a estrutura de container.
    case 'toggle':
    case 'column':
    case 'columns':
      return (node.content ?? []).map(c => renderBlock(c, depth)).filter(Boolean).join('\n\n')
    default:
      return inlineWithMarks(node.content)
  }
}

export function tiptapJsonToMarkdown(value?: string | null): string {
  const doc: EditorDoc = normalizeEditorContent(value)
  return (doc.content ?? [])
    .map(node => renderBlock(node))
    .filter(text => text.trim().length > 0)
    .join('\n\n')
}
