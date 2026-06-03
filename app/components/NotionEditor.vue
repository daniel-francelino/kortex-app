<script setup lang="ts">
import { useEditor, EditorContent, BubbleMenu } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import { Extension } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import type { Editor, Range } from '@tiptap/core'

interface CommandItem {
  title: string
  description: string
  icon: string
  command: (props: { editor: Editor; range: Range }) => void
}

const ALL_COMMANDS: CommandItem[] = [
  {
    title: 'Texto',
    description: 'Parágrafo normal',
    icon: 'i-lucide-type',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setParagraph().run()
    },
  },
  {
    title: 'Título 1',
    description: 'Título grande',
    icon: 'i-lucide-heading-1',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run()
    },
  },
  {
    title: 'Título 2',
    description: 'Título médio',
    icon: 'i-lucide-heading-2',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run()
    },
  },
  {
    title: 'Título 3',
    description: 'Título pequeno',
    icon: 'i-lucide-heading-3',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run()
    },
  },
  {
    title: 'Lista com marcadores',
    description: 'Lista não ordenada',
    icon: 'i-lucide-list',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
    },
  },
  {
    title: 'Lista numerada',
    description: 'Lista ordenada',
    icon: 'i-lucide-list-ordered',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
    },
  },
  {
    title: 'Lista de tarefas',
    description: 'Lista com checkboxes',
    icon: 'i-lucide-list-checks',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleTaskList().run()
    },
  },
  {
    title: 'Citação',
    description: 'Bloco de citação',
    icon: 'i-lucide-quote',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
    },
  },
  {
    title: 'Bloco de código',
    description: 'Código com destaque de sintaxe',
    icon: 'i-lucide-code-2',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
    },
  },
  {
    title: 'Divisor',
    description: 'Linha separadora',
    icon: 'i-lucide-minus',
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).setHorizontalRule().run()
    },
  },
]

const props = withDefaults(defineProps<{
  modelValue?: string
  placeholder?: string
  editable?: boolean
}>(), {
  modelValue: '',
  placeholder: 'Escreva algo, ou pressione "/" para inserir blocos...',
  editable: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// --- Slash menu state ---
const slashMenuVisible = ref(false)
const slashMenuItems = ref<CommandItem[]>([])
const slashMenuSelectedIndex = ref(0)
const slashMenuPosition = ref({ x: 0, y: 0 })
const slashMenuRef = ref<HTMLElement | null>(null)

// We keep a reference to the current suggestion props using a closure variable
// so the render callbacks can share state across onStart/onUpdate/onKeyDown
let currentSuggestionRange: Range | null = null
let currentSuggestionEditor: Editor | null = null

function selectCommand(item: CommandItem) {
  if (!currentSuggestionEditor || !currentSuggestionRange) return
  item.command({ editor: currentSuggestionEditor, range: currentSuggestionRange })
  slashMenuVisible.value = false
}

watch(slashMenuSelectedIndex, (idx) => {
  nextTick(() => {
    const item = slashMenuRef.value?.children[idx] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  })
})

// --- Parse / serialize content ---
function parseContent(value: string): object | undefined {
  if (!value?.trim()) return undefined
  try {
    const parsed = JSON.parse(value)
    // Tiptap JSON has type: 'doc'
    if (parsed && typeof parsed === 'object' && parsed.type === 'doc') return parsed
  } catch { /* legacy plain text below */ }
  if (value.trim()) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: value.trim() }] }],
    }
  }
  return undefined
}

// --- Build the slash command extension ---
const SlashCommandExtension = Extension.create({
  name: 'slashCommand',
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        items: ({ query }: { query: string }) => {
          const q = query.toLowerCase()
          return q
            ? ALL_COMMANDS.filter(c =>
                c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
              )
            : ALL_COMMANDS
        },
        command: ({ editor, range, props: item }: { editor: Editor; range: Range; props: CommandItem }) => {
          item.command({ editor, range })
          slashMenuVisible.value = false
        },
        render: () => ({
          onStart(suggProps: { editor: Editor; range: Range; items: CommandItem[]; clientRect?: (() => DOMRect | null) | null }) {
            currentSuggestionEditor = suggProps.editor
            currentSuggestionRange = suggProps.range
            slashMenuItems.value = suggProps.items
            slashMenuSelectedIndex.value = 0
            slashMenuVisible.value = true
            if (suggProps.clientRect) {
              const rect = suggProps.clientRect()
              if (rect) slashMenuPosition.value = { x: rect.left, y: rect.bottom + 6 }
            }
          },
          onUpdate(suggProps: { editor: Editor; range: Range; items: CommandItem[]; clientRect?: (() => DOMRect | null) | null }) {
            currentSuggestionEditor = suggProps.editor
            currentSuggestionRange = suggProps.range
            slashMenuItems.value = suggProps.items
            if (suggProps.clientRect) {
              const rect = suggProps.clientRect()
              if (rect) slashMenuPosition.value = { x: rect.left, y: rect.bottom + 6 }
            }
          },
          onKeyDown({ event }: { event: KeyboardEvent }) {
            const len = slashMenuItems.value.length
            if (event.key === 'Escape') {
              slashMenuVisible.value = false
              return true
            }
            if (!len) return false
            if (event.key === 'ArrowDown') {
              slashMenuSelectedIndex.value = (slashMenuSelectedIndex.value + 1) % len
              return true
            }
            if (event.key === 'ArrowUp') {
              slashMenuSelectedIndex.value = (slashMenuSelectedIndex.value - 1 + len) % len
              return true
            }
            if (event.key === 'Enter') {
              const item = slashMenuItems.value[slashMenuSelectedIndex.value]
              if (item) selectCommand(item)
              return true
            }
            return false
          },
          onExit() {
            slashMenuVisible.value = false
            currentSuggestionEditor = null
            currentSuggestionRange = null
          },
        }),
      }),
    ]
  },
})

// --- Create editor ---
const editor = useEditor({
  content: parseContent(props.modelValue),
  extensions: [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    Placeholder.configure({ placeholder: props.placeholder }),
    Underline,
    TaskList,
    TaskItem.configure({ nested: true }),
    Link.configure({ openOnClick: false, autolink: true }),
    SlashCommandExtension,
  ],
  editable: props.editable,
  onUpdate: ({ editor: ed }) => {
    emit('update:modelValue', JSON.stringify(ed.getJSON()))
  },
})

onBeforeUnmount(() => editor.value?.destroy())

watch(() => props.editable, (val) => editor.value?.setEditable(val))
</script>

<template>
  <div class="notion-editor">
    <!-- Bubble menu (inline formatting toolbar on text selection) -->
    <BubbleMenu
      v-if="editor && editable"
      :editor="editor"
      :tippy-options="{ duration: 100, maxWidth: 'none' }"
      class="notion-bubble"
    >
      <button
        type="button"
        :class="['notion-bubble-btn', { active: editor.isActive('bold') }]"
        title="Negrito (Ctrl+B)"
        @click="editor.chain().focus().toggleBold().run()"
      >
        <UIcon name="i-lucide-bold" class="size-3.5" />
      </button>
      <button
        type="button"
        :class="['notion-bubble-btn', { active: editor.isActive('italic') }]"
        title="Itálico (Ctrl+I)"
        @click="editor.chain().focus().toggleItalic().run()"
      >
        <UIcon name="i-lucide-italic" class="size-3.5" />
      </button>
      <button
        type="button"
        :class="['notion-bubble-btn', { active: editor.isActive('underline') }]"
        title="Sublinhado (Ctrl+U)"
        @click="editor.chain().focus().toggleUnderline().run()"
      >
        <UIcon name="i-lucide-underline" class="size-3.5" />
      </button>
      <button
        type="button"
        :class="['notion-bubble-btn', { active: editor.isActive('strike') }]"
        title="Tachado"
        @click="editor.chain().focus().toggleStrike().run()"
      >
        <UIcon name="i-lucide-strikethrough" class="size-3.5" />
      </button>
      <button
        type="button"
        :class="['notion-bubble-btn', { active: editor.isActive('code') }]"
        title="Código inline"
        @click="editor.chain().focus().toggleCode().run()"
      >
        <UIcon name="i-lucide-code" class="size-3.5" />
      </button>
      <div class="notion-bubble-sep" />
      <button
        type="button"
        :class="['notion-bubble-btn notion-bubble-btn--text', { active: editor.isActive('heading', { level: 1 }) }]"
        title="Título 1"
        @click="editor.chain().focus().toggleHeading({ level: 1 }).run()"
      >H1</button>
      <button
        type="button"
        :class="['notion-bubble-btn notion-bubble-btn--text', { active: editor.isActive('heading', { level: 2 }) }]"
        title="Título 2"
        @click="editor.chain().focus().toggleHeading({ level: 2 }).run()"
      >H2</button>
      <button
        type="button"
        :class="['notion-bubble-btn notion-bubble-btn--text', { active: editor.isActive('heading', { level: 3 }) }]"
        title="Título 3"
        @click="editor.chain().focus().toggleHeading({ level: 3 }).run()"
      >H3</button>
    </BubbleMenu>

    <!-- Main editor content -->
    <EditorContent :editor="editor" class="notion-content" />

    <!-- Slash command menu (teleported to body for correct z-index) -->
    <Teleport to="body">
      <div
        v-if="slashMenuVisible && slashMenuItems.length > 0"
        ref="slashMenuRef"
        class="notion-slash-menu"
        :style="{ top: `${slashMenuPosition.y}px`, left: `${slashMenuPosition.x}px` }"
      >
        <p class="notion-slash-label">Blocos básicos</p>
        <button
          v-for="(item, i) in slashMenuItems"
          :key="item.title"
          type="button"
          :class="['notion-slash-item', { selected: i === slashMenuSelectedIndex }]"
          @mouseenter="slashMenuSelectedIndex = i"
          @click="selectCommand(item)"
        >
          <span class="notion-slash-icon">
            <UIcon :name="item.icon" class="size-4" />
          </span>
          <span class="notion-slash-text">
            <span class="notion-slash-title">{{ item.title }}</span>
            <span class="notion-slash-desc">{{ item.description }}</span>
          </span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* ── Editor wrapper ── */
.notion-editor {
  position: relative;
  width: 100%;
}

/* ── Bubble menu ── */
.notion-bubble {
  display: flex;
  align-items: center;
  gap: 1px;
  padding: 3px 4px;
  border-radius: 8px;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.08);
}

.notion-bubble-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 4px;
  border-radius: 5px;
  border: none;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: -0.03em;
}

.notion-bubble-btn:hover {
  background: var(--ui-bg-muted);
  color: var(--ui-text-highlighted);
}

.notion-bubble-btn.active {
  background: var(--ui-bg-elevated);
  color: var(--ui-color-primary, #18b981);
}

.notion-bubble-sep {
  width: 1px;
  height: 16px;
  background: var(--ui-border);
  margin: 0 2px;
  flex-shrink: 0;
}

/* ── Slash command menu ── */
.notion-slash-menu {
  position: fixed;
  z-index: 9999;
  width: 272px;
  max-height: 360px;
  overflow-y: auto;
  border-radius: 10px;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 6px;
}

.notion-slash-label {
  font-size: 0.7rem;
  font-weight: 500;
  color: var(--ui-text-dimmed);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 4px 8px 6px;
  margin: 0;
}

.notion-slash-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 5px 6px;
  border-radius: 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 0.08s;
}

.notion-slash-item:hover,
.notion-slash-item.selected {
  background: var(--ui-bg-muted);
}

.notion-slash-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 6px;
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  flex-shrink: 0;
  color: var(--ui-text-muted);
}

.notion-slash-item.selected .notion-slash-icon,
.notion-slash-item:hover .notion-slash-icon {
  background: var(--ui-bg);
  color: var(--ui-text-highlighted);
}

.notion-slash-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.notion-slash-title {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--ui-text-highlighted);
  line-height: 1.3;
}

.notion-slash-desc {
  font-size: 0.75rem;
  color: var(--ui-text-muted);
  line-height: 1.3;
}
</style>

<style>
/* ── Editor content styles (global, scoped by .notion-content prefix) ── */

.notion-content .tiptap {
  outline: none;
  min-height: 8rem;
  font-family: inherit;
  font-size: 0.9375rem;
  line-height: 1.75;
  color: var(--ui-text-highlighted);
  caret-color: var(--ui-color-primary, #18b981);
}

/* Paragraphs */
.notion-content .tiptap p {
  margin: 0;
}

.notion-content .tiptap > * + * {
  margin-top: 0.2rem;
}

/* Headings — Notion-style */
.notion-content .tiptap h1 {
  font-size: 1.875rem;
  font-weight: 700;
  line-height: 1.25;
  margin: 1rem 0 0.25rem;
  color: var(--ui-text-highlighted);
  letter-spacing: -0.02em;
}

.notion-content .tiptap h2 {
  font-size: 1.375rem;
  font-weight: 600;
  line-height: 1.3;
  margin: 0.75rem 0 0.2rem;
  color: var(--ui-text-highlighted);
  letter-spacing: -0.01em;
}

.notion-content .tiptap h3 {
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.4;
  margin: 0.5rem 0 0.15rem;
  color: var(--ui-text-highlighted);
}

/* Lists */
.notion-content .tiptap ul,
.notion-content .tiptap ol {
  padding-left: 1.5rem;
  margin: 0.1rem 0;
}

.notion-content .tiptap li {
  margin: 0.1rem 0;
}

.notion-content .tiptap li p {
  margin: 0;
}

/* Task list (checkboxes) */
.notion-content .tiptap ul[data-type="taskList"] {
  padding-left: 0.25rem;
  list-style: none;
}

.notion-content .tiptap ul[data-type="taskList"] li {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.notion-content .tiptap ul[data-type="taskList"] li > label {
  flex-shrink: 0;
  user-select: none;
  margin-top: 0.2rem;
}

.notion-content .tiptap ul[data-type="taskList"] li > label input[type="checkbox"] {
  cursor: pointer;
  accent-color: var(--ui-color-primary, #18b981);
}

.notion-content .tiptap ul[data-type="taskList"] li > div {
  flex: 1;
}

.notion-content .tiptap ul[data-type="taskList"] li[data-checked="true"] > div {
  text-decoration: line-through;
  opacity: 0.55;
}

/* Blockquote */
.notion-content .tiptap blockquote {
  border-left: 3px solid var(--ui-color-primary, #18b981);
  padding-left: 1rem;
  margin: 0.4rem 0;
  color: var(--ui-text-muted);
  font-style: italic;
}

.notion-content .tiptap blockquote p {
  margin: 0;
}

/* Inline code */
.notion-content .tiptap code {
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', ui-monospace, monospace;
  background: var(--ui-bg-muted);
  border: 1px solid var(--ui-border);
  border-radius: 4px;
  padding: 0.1em 0.3em;
  font-size: 0.85em;
  color: var(--ui-text-highlighted);
}

/* Code block */
.notion-content .tiptap pre {
  background: var(--ui-bg-muted);
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 1rem 1.25rem;
  margin: 0.5rem 0;
  overflow-x: auto;
  position: relative;
}

.notion-content .tiptap pre code {
  background: transparent;
  border: none;
  padding: 0;
  font-size: 0.875rem;
  line-height: 1.6;
}

/* Horizontal rule */
.notion-content .tiptap hr {
  border: none;
  border-top: 1px solid var(--ui-border);
  margin: 0.75rem 0;
}

/* Links */
.notion-content .tiptap a {
  color: var(--ui-color-primary, #18b981);
  text-decoration: underline;
  text-underline-offset: 2px;
  text-decoration-thickness: 1px;
  cursor: pointer;
}

.notion-content .tiptap a:hover {
  opacity: 0.8;
}

/* Placeholder */
.notion-content .tiptap p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: var(--ui-text-dimmed);
  pointer-events: none;
  float: left;
  height: 0;
}

/* Bold, italic, underline, strike, mark */
.notion-content .tiptap strong { font-weight: 700; }
.notion-content .tiptap em { font-style: italic; }
.notion-content .tiptap u { text-decoration: underline; text-underline-offset: 2px; }
.notion-content .tiptap s { text-decoration: line-through; }
</style>
