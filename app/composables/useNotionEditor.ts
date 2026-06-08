import { Extension, Node as TiptapNode, mergeAttributes } from '@tiptap/core'
import type { Editor, Range } from '@tiptap/core'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import Underline from '@tiptap/extension-underline'
import StarterKit from '@tiptap/starter-kit'
import Suggestion from '@tiptap/suggestion'

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

export const notionCommandItems: NotionCommandItem[] = [
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
    title: 'Bloco de codigo',
    description: 'Codigo com destaque',
    icon: 'i-lucide-code-2',
    command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
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

export function createSlashCommandExtension(handlers: SlashCommandHandlers) {
  return Extension.create({
    name: 'slashCommand',

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          char: '/',
          items: ({ query }: { query: string }) => {
            const q = query.toLowerCase()
            return q
              ? notionCommandItems.filter(
                  item =>
                    item.title.toLowerCase().includes(q)
                    || item.description.toLowerCase().includes(q)
                )
              : notionCommandItems
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
    ...(options.enableWikilinks ? [WikilinkNode] : []),
    options.slashCommand,
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell
  ]
}
