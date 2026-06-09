import { Extension, Node as TiptapNode, mergeAttributes } from '@tiptap/core'
import type { Editor, NodeViewRenderer, Range } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import Underline from '@tiptap/extension-underline'
import StarterKit from '@tiptap/starter-kit'
import Suggestion from '@tiptap/suggestion'
import EditorImageNodeView from '~/components/editor/nodes/EditorImageNodeView.vue'

export interface NotionCommandItem {
  title: string
  description: string
  icon: string
  command: (props: { editor: Editor, range: Range }) => void
}

export interface WikiSuggestionItem {
  id: string
  title: string
}

export interface NotionCommandActions {
  uploadImage?: () => void
  uploadFile?: () => void
  openMention?: () => void
  openEmoji?: () => void
  openLinkPreview?: () => void
}

export interface SlashCommandHandlers {
  onStart: (props: {
    editor: Editor
    range: Range
    items: NotionCommandItem[]
    clientRect?: (() => DOMRect | null) | null
  }) => void
  onUpdate: (props: {
    editor: Editor
    range: Range
    items: NotionCommandItem[]
    clientRect?: (() => DOMRect | null) | null
  }) => void
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
  onExit: () => void
}

function clearCommandRange(editor: Editor, range: Range) {
  editor.chain().focus().deleteRange(range).run()
}

export function createNotionCommandItems(actions: NotionCommandActions = {}): NotionCommandItem[] {
  return [
    {
      title: 'Texto',
      description: 'Paragrafo normal',
      icon: 'i-lucide-type',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run()
    },
    {
      title: 'Titulo 1',
      description: 'Titulo grande',
      icon: 'i-lucide-heading-1',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run()
    },
    {
      title: 'Titulo 2',
      description: 'Titulo medio',
      icon: 'i-lucide-heading-2',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run()
    },
    {
      title: 'Titulo 3',
      description: 'Titulo pequeno',
      icon: 'i-lucide-heading-3',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run()
    },
    {
      title: 'Lista com marcadores',
      description: 'Lista nao ordenada',
      icon: 'i-lucide-list',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
    {
      title: 'Lista numerada',
      description: 'Lista ordenada',
      icon: 'i-lucide-list-ordered',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
    {
      title: 'Lista de tarefas',
      description: 'Lista com checkboxes',
      icon: 'i-lucide-list-checks',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run()
    },
    {
      title: 'Citacao',
      description: 'Bloco de citacao',
      icon: 'i-lucide-quote',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },
    {
      title: 'Callout',
      description: 'Bloco em destaque com icone',
      icon: 'i-lucide-lightbulb',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertContent({
          type: 'callout',
          attrs: { icon: '\u{1F4A1}' },
          content: [{ type: 'paragraph' }]
        }).run()
    },
    {
      title: 'Bloco de codigo',
      description: 'Codigo com destaque',
      icon: 'i-lucide-code-2',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
    },
    {
      title: 'Imagem',
      description: 'Upload de imagem',
      icon: 'i-lucide-image',
      command: ({ editor, range }) => {
        clearCommandRange(editor, range)
        actions.uploadImage?.()
      }
    },
    {
      title: 'Arquivo',
      description: 'Upload de arquivo',
      icon: 'i-lucide-paperclip',
      command: ({ editor, range }) => {
        clearCommandRange(editor, range)
        actions.uploadFile?.()
      }
    },
    {
      title: 'Preview de link',
      description: 'Card visual para uma URL',
      icon: 'i-lucide-panels-top-left',
      command: ({ editor, range }) => {
        clearCommandRange(editor, range)
        actions.openLinkPreview?.()
      }
    },
    {
      title: 'Mencao',
      description: 'Pessoa, nota ou entidade',
      icon: 'i-lucide-at-sign',
      command: ({ editor, range }) => {
        clearCommandRange(editor, range)
        actions.openMention?.()
      }
    },
    {
      title: 'Emoji',
      description: 'Marcador visual inline',
      icon: 'i-lucide-smile',
      command: ({ editor, range }) => {
        clearCommandRange(editor, range)
        actions.openEmoji?.()
      }
    },
    {
      title: 'Divisor',
      description: 'Linha separadora',
      icon: 'i-lucide-minus',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run()
    },
    {
      title: 'Tabela',
      description: 'Tabela com linhas e colunas',
      icon: 'i-lucide-table-2',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    }
  ]
}

export const notionCommandItems = createNotionCommandItems()

const BLOCK_ID_TYPES = [
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'horizontalRule',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'callout',
  'editorImage',
  'editorFile',
  'linkPreview',
  'table'
]

function createBlockId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `block-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export const BlockIdExtension = Extension.create({
  name: 'blockId',

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_ID_TYPES,
        attributes: {
          blockId: {
            default: null,
            parseHTML: element => element.getAttribute('data-block-id'),
            renderHTML: attributes =>
              attributes.blockId
                ? {
                    'data-block-id': attributes.blockId,
                    'id': `block-${attributes.blockId}`
                  }
                : {}
          }
        }
      }
    ]
  },

  onCreate() {
    ensureEditorBlockIds(this.editor)
  },

  onUpdate() {
    ensureEditorBlockIds(this.editor)
  }
})

function ensureEditorBlockIds(editor: Editor) {
  const tr = ensureBlockIds(editor.state)
  if (tr.docChanged) editor.view.dispatch(tr)
}

function ensureBlockIds(state: Editor['state']) {
  const tr = state.tr
  const seen = new Set<string>()

  state.doc.descendants((node, pos) => {
    if (!BLOCK_ID_TYPES.includes(node.type.name)) return true

    const current = typeof node.attrs.blockId === 'string' ? node.attrs.blockId : ''
    const nextId = current && !seen.has(current) ? current : createBlockId()
    seen.add(nextId)

    if (nextId !== current) {
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        blockId: nextId
      }, node.marks)
    }

    return true
  })

  return tr
}

export const WikilinkNode = TiptapNode.create({
  name: 'wikilink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      noteId: { default: null },
      title: { default: '' }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-wikilink-id]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-wikilink-id': node.attrs.noteId,
        'class': 'wikilink-node'
      }),
      `[[${node.attrs.title}]]`
    ]
  }
})

export const CalloutNode = TiptapNode.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return {
      icon: { default: '\u{1F4A1}' },
      tone: { default: 'neutral' }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'callout',
        'data-callout-tone': node.attrs.tone
      }),
      ['div', { 'data-callout-icon': '' }, node.attrs.icon],
      ['div', { 'data-callout-content': '' }, 0]
    ]
  }
})

export const EditorImageNode: ReturnType<typeof TiptapNode.create> = TiptapNode.create({
  name: 'editorImage',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: '' },
      title: { default: '' },
      name: { default: '' },
      width: { default: null },
      caption: { default: '' },
      size: { default: null },
      mimeType: { default: '' },
      path: { default: '' },
      bucket: { default: '' }
    }
  },

  parseHTML() {
    return [{ tag: 'figure[data-type="editor-image"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'figure',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'editor-image',
        'data-path': node.attrs.path,
        'data-bucket': node.attrs.bucket
      }),
      [
        'img',
        {
          src: node.attrs.src,
          alt: node.attrs.alt || node.attrs.name || '',
          title: node.attrs.title || node.attrs.name || '',
          loading: 'lazy',
          style: node.attrs.width ? `width: ${node.attrs.width}` : null
        }
      ],
      ['figcaption', node.attrs.caption || node.attrs.name || '']
    ]
  },

  addNodeView(): NodeViewRenderer {
    return VueNodeViewRenderer(EditorImageNodeView)
  }
})

export const EditorFileNode = TiptapNode.create({
  name: 'editorFile',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      href: { default: null },
      name: { default: 'Arquivo' },
      size: { default: null },
      mimeType: { default: '' },
      path: { default: '' },
      bucket: { default: '' }
    }
  },

  parseHTML() {
    return [{ tag: 'a[data-type="editor-file"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'a',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'editor-file',
        'data-path': node.attrs.path,
        'data-bucket': node.attrs.bucket,
        'href': node.attrs.href,
        'target': '_blank',
        'rel': 'noopener noreferrer'
      }),
      ['span', { 'data-file-icon': '' }, 'FILE'],
      ['span', { 'data-file-name': '' }, node.attrs.name || 'Arquivo']
    ]
  }
})

export const MentionNode = TiptapNode.create({
  name: 'mention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      id: { default: null },
      label: { default: '' },
      kind: { default: 'manual' }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="mention"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'mention',
        'data-id': node.attrs.id,
        'data-kind': node.attrs.kind,
        'class': 'mention-node'
      }),
      `@${node.attrs.label || 'mencao'}`
    ]
  },

  renderText({ node }) {
    return `@${node.attrs.label || 'mencao'}`
  }
})

export const EmojiNode = TiptapNode.create({
  name: 'emoji',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      emoji: { default: '\u{2728}' },
      name: { default: 'sparkles' }
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="emoji"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'emoji',
        'data-name': node.attrs.name,
        'class': 'emoji-node'
      }),
      node.attrs.emoji || '\u{2728}'
    ]
  },

  renderText({ node }) {
    return node.attrs.emoji || '\u{2728}'
  }
})

export const LinkPreviewNode = TiptapNode.create({
  name: 'linkPreview',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      url: { default: '' },
      title: { default: '' },
      description: { default: '' },
      image: { default: '' },
      siteName: { default: '' }
    }
  },

  parseHTML() {
    return [{ tag: 'a[data-type="link-preview"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'a',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'link-preview',
        'href': node.attrs.url,
        'target': '_blank',
        'rel': 'noopener noreferrer'
      }),
      node.attrs.image
        ? ['img', { src: node.attrs.image, alt: '', loading: 'lazy' }]
        : ['span', { 'data-link-preview-icon': '' }, 'LINK'],
      [
        'span',
        { 'data-link-preview-body': '' },
        ['strong', node.attrs.title || node.attrs.url],
        ['small', node.attrs.description || node.attrs.siteName || node.attrs.url]
      ]
    ]
  }
})

export function createSlashCommandExtension(
  handlers: SlashCommandHandlers,
  getItems: () => NotionCommandItem[] = () => notionCommandItems
) {
  return Extension.create({
    name: 'slashCommand',

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          char: '/',
          items: ({ query }: { query: string }) => {
            const q = query.toLowerCase()
            const items = getItems()
            return q
              ? items.filter(
                  item =>
                    item.title.toLowerCase().includes(q)
                    || item.description.toLowerCase().includes(q)
                )
              : items
          },
          command: ({ editor, range, props: item }: { editor: Editor, range: Range, props: NotionCommandItem }) => {
            item.command({ editor, range })
            handlers.onExit()
          },
          render: () => ({
            onStart: handlers.onStart,
            onUpdate: handlers.onUpdate,
            onKeyDown: handlers.onKeyDown,
            onExit: handlers.onExit
          })
        })
      ]
    }
  })
}

export function createNotionEditorExtensions(options: {
  placeholder: string
  slashCommand: Extension
  enableWikilinks?: boolean
}) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: false,
      underline: false
    }),
    Placeholder.configure({ placeholder: options.placeholder }),
    Underline,
    TaskList,
    TaskItem.configure({ nested: true }),
    Link.configure({ openOnClick: false, autolink: true }),
    BlockIdExtension,
    CalloutNode,
    EditorImageNode,
    EditorFileNode,
    MentionNode,
    EmojiNode,
    LinkPreviewNode,
    ...(options.enableWikilinks ? [WikilinkNode] : []),
    options.slashCommand,
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell
  ]
}
