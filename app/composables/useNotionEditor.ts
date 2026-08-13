import { Extension, Node as TiptapNode, mergeAttributes } from '@tiptap/core'
import type { Editor, NodeViewRenderer, Range } from '@tiptap/core'
import { VueNodeViewRenderer } from '@tiptap/vue-3'
import Link from '@tiptap/extension-link'
import EditorColumnNodeView from '~/components/editor/nodes/EditorColumnNodeView.vue'
import Placeholder from '@tiptap/extension-placeholder'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyle } from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import Highlight from '@tiptap/extension-highlight'
import Underline from '@tiptap/extension-underline'
import StarterKit from '@tiptap/starter-kit'
import Suggestion from '@tiptap/suggestion'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { createLowlight, common } from 'lowlight'
import EditorImageNodeView from '~/components/editor/nodes/EditorImageNodeView.vue'
import EditorCodeBlockNodeView from '~/components/editor/nodes/EditorCodeBlockNodeView.vue'

const lowlight = createLowlight(common)

export interface NotionCommandItem {
  title: string
  description: string
  icon: string
  group: string
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
    // Texto
    {
      group: 'Texto',
      title: 'Texto',
      description: 'Paragrafo normal',
      icon: 'i-lucide-type',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run()
    },
    {
      group: 'Texto',
      title: 'Titulo 1',
      description: 'Titulo grande de secao',
      icon: 'i-lucide-heading-1',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run()
    },
    {
      group: 'Texto',
      title: 'Titulo 2',
      description: 'Titulo medio de secao',
      icon: 'i-lucide-heading-2',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run()
    },
    {
      group: 'Texto',
      title: 'Titulo 3',
      description: 'Titulo pequeno de secao',
      icon: 'i-lucide-heading-3',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run()
    },
    {
      group: 'Texto',
      title: 'Citacao',
      description: 'Trecho em destaque ou referencia',
      icon: 'i-lucide-quote',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },

    // Listas
    {
      group: 'Lista',
      title: 'Lista com marcadores',
      description: 'Lista nao ordenada',
      icon: 'i-lucide-list',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
    {
      group: 'Lista',
      title: 'Lista numerada',
      description: 'Lista ordenada por numero',
      icon: 'i-lucide-list-ordered',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
    {
      group: 'Lista',
      title: 'Lista de tarefas',
      description: 'Itens com checkbox',
      icon: 'i-lucide-list-checks',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run()
    },

    // Midia
    {
      group: 'Mídia',
      title: 'Imagem',
      description: 'Faz upload de uma imagem',
      icon: 'i-lucide-image',
      command: ({ editor, range }) => {
        clearCommandRange(editor, range)
        actions.uploadImage?.()
      }
    },
    {
      group: 'Mídia',
      title: 'Arquivo',
      description: 'Faz upload de qualquer arquivo',
      icon: 'i-lucide-paperclip',
      command: ({ editor, range }) => {
        clearCommandRange(editor, range)
        actions.uploadFile?.()
      }
    },
    {
      group: 'Mídia',
      title: 'Preview de link',
      description: 'Card visual para uma URL',
      icon: 'i-lucide-panels-top-left',
      command: ({ editor, range }) => {
        clearCommandRange(editor, range)
        actions.openLinkPreview?.()
      }
    },

    // Avancado
    {
      group: 'Avançado',
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
      group: 'Avançado',
      title: 'Bloco de codigo',
      description: 'Codigo com realce de sintaxe',
      icon: 'i-lucide-code-2',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
    },
    {
      group: 'Avançado',
      title: 'Tabela',
      description: 'Tabela com linhas e colunas',
      icon: 'i-lucide-table-2',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    },
    {
      group: 'Avançado',
      title: 'Divisor',
      description: 'Linha separadora horizontal',
      icon: 'i-lucide-minus',
      command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run()
    },
    {
      group: 'Avançado',
      title: '2 Colunas',
      description: 'Divide o bloco em 2 colunas iguais',
      icon: 'i-lucide-columns-2',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertContent({
          type: 'columns',
          content: [
            { type: 'column', attrs: { width: 50 }, content: [{ type: 'paragraph' }] },
            { type: 'column', attrs: { width: 50 }, content: [{ type: 'paragraph' }] }
          ]
        }).run()
    },
    {
      group: 'Avançado',
      title: '3 Colunas',
      description: 'Divide o bloco em 3 colunas iguais',
      icon: 'i-lucide-columns-3',
      command: ({ editor, range }) =>
        editor.chain().focus().deleteRange(range).insertContent({
          type: 'columns',
          content: [
            { type: 'column', attrs: { width: 33.33 }, content: [{ type: 'paragraph' }] },
            { type: 'column', attrs: { width: 33.33 }, content: [{ type: 'paragraph' }] },
            { type: 'column', attrs: { width: 33.34 }, content: [{ type: 'paragraph' }] }
          ]
        }).run()
    },

    // Inline
    {
      group: 'Inline',
      title: 'Mencao',
      description: 'Menciona pessoa, nota ou entidade',
      icon: 'i-lucide-at-sign',
      command: ({ editor, range }) => {
        clearCommandRange(editor, range)
        actions.openMention?.()
      }
    },
    {
      group: 'Inline',
      title: 'Emoji',
      description: 'Insere um emoji no texto',
      icon: 'i-lucide-smile',
      command: ({ editor, range }) => {
        clearCommandRange(editor, range)
        actions.openEmoji?.()
      }
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
  'table',
  'columns',
  'column'
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

export const ColumnNode = TiptapNode.create({
  name: 'column',
  group: 'column',
  content: 'block+',
  isolating: true,

  addAttributes() {
    return {
      width: { default: null }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'column',
        'style': node.attrs.width ? `flex: 0 0 ${node.attrs.width}%` : undefined
      }),
      0
    ]
  },

  addNodeView(): NodeViewRenderer {
    return VueNodeViewRenderer(EditorColumnNodeView)
  }
})

export const ColumnsNode = TiptapNode.create({
  name: 'columns',
  group: 'block',
  content: 'column+',
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="columns"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'columns' }), 0]
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
      underline: false,
      codeBlock: false
    }),
    Placeholder.configure({ placeholder: options.placeholder }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    Underline,
    TaskList,
    TaskItem.configure({ nested: true }),
    Link.configure({ openOnClick: false, autolink: true }),
    CodeBlockLowlight
      .extend({ addNodeView: () => VueNodeViewRenderer(EditorCodeBlockNodeView) })
      .configure({ lowlight }),
    BlockIdExtension,
    CalloutNode,
    EditorImageNode,
    EditorFileNode,
    MentionNode,
    EmojiNode,
    LinkPreviewNode,
    ColumnNode,
    ColumnsNode,
    ...(options.enableWikilinks ? [WikilinkNode] : []),
    options.slashCommand,
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell
  ]
}
