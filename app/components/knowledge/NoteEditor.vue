<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Underline from '@tiptap/extension-underline'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import { Extension, Node, mergeAttributes } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { PluginKey } from '@tiptap/pm/state'
import type { Editor, Range } from '@tiptap/core'
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table'
import type { KnowledgeNote, KnowledgeTag, NoteDetail } from '~/types/knowledge'

// ─── Slash command data ────────────────────────────────────────────────────────

interface CommandItem {
  title: string
  description: string
  icon: string
  command: (p: { editor: Editor; range: Range }) => void
}

const ALL_COMMANDS: CommandItem[] = [
  { title: 'Texto', description: 'Parágrafo normal', icon: 'i-lucide-type', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setParagraph().run() },
  { title: 'Título 1', description: 'Título grande', icon: 'i-lucide-heading-1', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 1 }).run() },
  { title: 'Título 2', description: 'Título médio', icon: 'i-lucide-heading-2', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 2 }).run() },
  { title: 'Título 3', description: 'Título pequeno', icon: 'i-lucide-heading-3', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHeading({ level: 3 }).run() },
  { title: 'Lista com marcadores', description: 'Lista não ordenada', icon: 'i-lucide-list', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBulletList().run() },
  { title: 'Lista numerada', description: 'Lista ordenada', icon: 'i-lucide-list-ordered', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleOrderedList().run() },
  { title: 'Lista de tarefas', description: 'Lista com checkboxes', icon: 'i-lucide-list-checks', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleTaskList().run() },
  { title: 'Citação', description: 'Bloco de citação', icon: 'i-lucide-quote', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleBlockquote().run() },
  { title: 'Bloco de código', description: 'Código com destaque', icon: 'i-lucide-code-2', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run() },
  { title: 'Divisor', description: 'Linha separadora', icon: 'i-lucide-minus', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).setHorizontalRule().run() },
  { title: 'Tabela', description: 'Tabela com linhas e colunas', icon: 'i-lucide-table-2', command: ({ editor, range }) => editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() }
]

// ─── Props / Emits ─────────────────────────────────────────────────────────────

const props = defineProps<{
  noteId: string | null
  tags: KnowledgeTag[]
}>()

const emit = defineEmits<{
  updated: []
  deleted: []
  'navigate-note': [noteId: string]
  'note-loaded': [note: NoteDetail | null]
  'content-change': [content: string]
}>()

// ─── Composable ────────────────────────────────────────────────────────────────

const { fetchNoteDetail, updateNote, deleteNote, linkNotes, unlinkNotes, notesData } = useKnowledge()

// ─── Note state ────────────────────────────────────────────────────────────────

const noteDetail = ref<NoteDetail | null>(null)
const loading = ref(false)
const editTitle = ref('')
const lastSavedTitle = ref('')
const lastSavedContent = ref('')

const dirty = computed(() => {
  if (!noteDetail.value) return false
  const content = editor.value ? JSON.stringify(editor.value.getJSON()) : ''
  return editTitle.value !== lastSavedTitle.value || content !== lastSavedContent.value
})

// ─── Save status ───────────────────────────────────────────────────────────────

type SaveStatus = 'idle' | 'unsaved' | 'saved' | 'error'
const saveStatus = ref<SaveStatus>('idle')
const savedAt = ref<Date | null>(null)
const lastChangeAt = ref(0)

const savedAtText = computed(() =>
  savedAt.value?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) ?? ''
)

// ─── Link state ────────────────────────────────────────────────────────────────

const linkSearchOpen = ref(false)
const linkSearchQuery = ref('')

const availableNotesForLink = computed(() => {
  if (!notesData.value?.data || !noteDetail.value) return []
  const linked = new Set([
    ...(noteDetail.value.links ?? []).map(l => l.targetNoteId),
    noteDetail.value.id,
  ])
  return notesData.value.data
    .filter((n: KnowledgeNote) => !linked.has(n.id))
    .filter((n: KnowledgeNote) => !linkSearchQuery.value || n.title.toLowerCase().includes(linkSearchQuery.value.toLowerCase()))
})

// ─── Content helpers ───────────────────────────────────────────────────────────

function parseContent(value: string): object | undefined {
  if (!value?.trim()) return undefined
  try {
    const p = JSON.parse(value)
    if (p?.type === 'doc') return p
  } catch {}
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: value.trim() }] }] }
}

function syncToEditor(detail: NoteDetail) {
  if (!editor.value) return
  const json = parseContent(detail.content ?? '')
  editor.value.commands.setContent(json ?? { type: 'doc', content: [{ type: 'paragraph' }] }, false)
  lastSavedContent.value = detail.content ?? ''
}

// ─── Load note ─────────────────────────────────────────────────────────────────

async function loadNote(id: string | null) {
  // Best-effort save before switching notes
  if (noteDetail.value && saveStatus.value === 'unsaved') {
    await saveNote()
  }
  if (!id) {
    noteDetail.value = null
    emit('note-loaded', null)
    editTitle.value = ''
    lastSavedTitle.value = ''
    lastSavedContent.value = ''
    lastChangeAt.value = 0
    saveStatus.value = 'idle'
    editor.value?.commands.clearContent()
    return
  }
  loading.value = true
  try {
    const detail = await fetchNoteDetail(id)
    noteDetail.value = detail
    emit('note-loaded', detail)
    if (detail) {
      editTitle.value = detail.title
      lastSavedTitle.value = detail.title
    }
  } finally {
    loading.value = false
  }
  lastChangeAt.value = 0
  saveStatus.value = 'idle'
  // Wait for Vue to re-render (loading→false, EditorContent mounts) before setting content
  await nextTick()
  if (noteDetail.value) syncToEditor(noteDetail.value)
}

watch(() => props.noteId, loadNote)
onMounted(() => { void loadNote(props.noteId) })

// ─── Auto-save (polling-based, same pattern as Journal) ────────────────────────

const SAVE_AFTER_MS = 60_000
const POLL_INTERVAL_MS = 10_000
let pollTimer: ReturnType<typeof setInterval> | null = null

function markDirty() {
  if (!noteDetail.value) return
  lastChangeAt.value = Date.now()
  saveStatus.value = 'unsaved'
}

async function saveNote() {
  if (!noteDetail.value || !dirty.value) return
  try {
    const content = editor.value ? JSON.stringify(editor.value.getJSON()) : undefined
    const result = await updateNote(noteDetail.value.id, { title: editTitle.value, content }, { silent: true })
    if (result) {
      lastSavedTitle.value = editTitle.value
      if (content !== undefined) lastSavedContent.value = content
      lastChangeAt.value = 0
      saveStatus.value = 'saved'
      savedAt.value = new Date()
      emit('updated')
    } else {
      saveStatus.value = 'error'
    }
  } catch {
    saveStatus.value = 'error'
  }
}

onMounted(() => {
  pollTimer = setInterval(() => {
    if (!dirty.value || lastChangeAt.value === 0) return
    if (Date.now() - lastChangeAt.value < SAVE_AFTER_MS) return
    void saveNote()
  }, POLL_INTERVAL_MS)
})

watch(editTitle, (val) => { if (noteDetail.value && val !== lastSavedTitle.value) markDirty() })

// ─── Actions ──────────────────────────────────────────────────────────────────

async function onDelete() {
  if (!noteDetail.value) return
  const ok = await deleteNote(noteDetail.value.id)
  if (ok) { noteDetail.value = null; emit('deleted') }
}

async function addLink(targetId: string) {
  if (!noteDetail.value) return
  const ok = await linkNotes(noteDetail.value.id, { targetNoteId: targetId })
  if (ok) {
    const detail = await fetchNoteDetail(noteDetail.value.id)
    noteDetail.value = detail
    emit('note-loaded', detail)
    linkSearchOpen.value = false
    linkSearchQuery.value = ''
  }
}

async function removeLink(linkId: string) {
  if (!noteDetail.value) return
  const ok = await unlinkNotes(linkId)
  if (ok) {
    const detail = await fetchNoteDetail(noteDetail.value.id)
    noteDetail.value = detail
    emit('note-loaded', detail)
  }
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ─── Drag & drop linking ───────────────────────────────────────────────────────

const isDragOver = ref(false)

function onDragOver(e: DragEvent) {
  if (e.dataTransfer?.types.includes('application/x-knowledge-note-id')) {
    isDragOver.value = true
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'link'
  }
}

function onDragLeave(e: DragEvent) {
  const target = e.currentTarget as Element
  if (!e.relatedTarget || !target.contains(e.relatedTarget as Node)) {
    isDragOver.value = false
  }
}

function onDrop(e: DragEvent) {
  isDragOver.value = false
  const noteId = e.dataTransfer?.getData('application/x-knowledge-note-id')
  if (noteId && noteId !== noteDetail.value?.id) {
    void addLink(noteId)
  }
}

// ─── Table bar ref ─────────────────────────────────────────────────────────────

const tableBarRef = ref<{ update: () => void } | null>(null)

// ─── Bubble menu ───────────────────────────────────────────────────────────────

const bubbleVisible = ref(false)
const bubblePos = ref({ x: 0, y: 0 })
const bubbleRef = ref<HTMLElement | null>(null)

function updateBubble() {
  const ed = editor.value
  if (!ed) { bubbleVisible.value = false; return }
  const { from, to } = ed.state.selection
  if (from === to) { bubbleVisible.value = false; return }
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { bubbleVisible.value = false; return }
  const rect = sel.getRangeAt(0).getBoundingClientRect()
  if (!rect.width) { bubbleVisible.value = false; return }
  bubblePos.value = { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top) }
  bubbleVisible.value = true
}

// ─── Slash menu state ──────────────────────────────────────────────────────────

const slashVisible = ref(false)
const slashItems = ref<CommandItem[]>([])
const slashIndex = ref(0)
const slashPos = ref({ x: 0, y: 0 })
const slashMenuRef = ref<HTMLElement | null>(null)
let slashRange: Range | null = null
let slashEditorInst: Editor | null = null

function selectSlashCommand(item: CommandItem) {
  if (!slashEditorInst || !slashRange) return
  item.command({ editor: slashEditorInst, range: slashRange })
  slashVisible.value = false
}

watch(slashIndex, idx => nextTick(() => {
  (slashMenuRef.value?.children[idx] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' })
}))

// ─── Wikilink suggestion state ─────────────────────────────────────────────────

interface WikiItem { id: string; title: string }

const wikiVisible = ref(false)
const wikiItems = ref<WikiItem[]>([])
const wikiIndex = ref(0)
const wikiPos = ref({ x: 0, y: 0 })
const wikiMenuRef = ref<HTMLElement | null>(null)
let wikiCommandFn: ((item: WikiItem) => void) | null = null

watch(wikiIndex, idx => nextTick(() => {
  (wikiMenuRef.value?.children[idx] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' })
}))

// ─── Tiptap: WikilinkNode ──────────────────────────────────────────────────────

const WikilinkNode = Node.create({
  name: 'wikilink',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      noteId: { default: null },
      title: { default: '' },
    }
  },
  parseHTML() {
    return [{ tag: 'span[data-wikilink-id]' }]
  },
  renderHTML({ node, HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, {
      'data-wikilink-id': node.attrs.noteId,
      class: 'wikilink-node',
    }), `[[${node.attrs.title}]]`]
  },
})

// ─── Tiptap: WikilinkSuggestion ───────────────────────────────────────────────

const WikilinkSuggestion = Extension.create({
  name: 'wikilinkSuggestion',
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey('wikilinkSuggestion'),
        char: '[[',
        allowSpaces: true,
        items: ({ query }: { query: string }) => {
          const q = query.toLowerCase()
          return (notesData.value?.data ?? [])
            .filter((n: KnowledgeNote) => n.id !== props.noteId)
            .filter((n: KnowledgeNote) => !q || n.title.toLowerCase().includes(q))
            .slice(0, 8)
            .map((n: KnowledgeNote) => ({ id: n.id, title: n.title }))
        },
        command: ({ editor: ed, range, props: item }: { editor: Editor; range: Range; props: WikiItem }) => {
          ed.chain().focus().deleteRange(range)
            .insertContent({ type: 'wikilink', attrs: { noteId: item.id, title: item.title } })
            .insertContent(' ')
            .run()
          wikiVisible.value = false
        },
        render: () => ({
          onStart(p: { items: WikiItem[]; clientRect?: (() => DOMRect | null) | null; command: (i: WikiItem) => void }) {
            wikiItems.value = p.items
            wikiIndex.value = 0
            wikiVisible.value = true
            wikiCommandFn = p.command
            const r = p.clientRect?.()
            if (r) wikiPos.value = { x: r.left, y: r.bottom + 6 }
          },
          onUpdate(p: { items: WikiItem[]; clientRect?: (() => DOMRect | null) | null; command: (i: WikiItem) => void }) {
            wikiItems.value = p.items
            wikiCommandFn = p.command
            const r = p.clientRect?.()
            if (r) wikiPos.value = { x: r.left, y: r.bottom + 6 }
          },
          onKeyDown({ event }: { event: KeyboardEvent }) {
            const len = wikiItems.value.length
            if (event.key === 'Escape') { wikiVisible.value = false; return true }
            if (!len) return false
            if (event.key === 'ArrowDown') { wikiIndex.value = (wikiIndex.value + 1) % len; return true }
            if (event.key === 'ArrowUp') { wikiIndex.value = (wikiIndex.value - 1 + len) % len; return true }
            if (event.key === 'Enter') { const i = wikiItems.value[wikiIndex.value]; if (i) wikiCommandFn?.(i); return true }
            return false
          },
          onExit() { wikiVisible.value = false; wikiCommandFn = null },
        }),
      }),
    ]
  },
})

// ─── Tiptap: SlashCommandExtension ────────────────────────────────────────────

const SlashCommandExtension = Extension.create({
  name: 'slashCommand',
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        pluginKey: new PluginKey('slashCommand'),
        char: '/',
        items: ({ query }: { query: string }) => {
          const q = query.toLowerCase()
          return q ? ALL_COMMANDS.filter(c => c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)) : ALL_COMMANDS
        },
        command: ({ editor: ed, range, props: item }: { editor: Editor; range: Range; props: CommandItem }) => {
          item.command({ editor: ed, range })
          slashVisible.value = false
        },
        render: () => ({
          onStart(p: { editor: Editor; range: Range; items: CommandItem[]; clientRect?: (() => DOMRect | null) | null }) {
            slashEditorInst = p.editor; slashRange = p.range
            slashItems.value = p.items; slashIndex.value = 0; slashVisible.value = true
            const r = p.clientRect?.(); if (r) slashPos.value = { x: r.left, y: r.bottom + 6 }
          },
          onUpdate(p: { editor: Editor; range: Range; items: CommandItem[]; clientRect?: (() => DOMRect | null) | null }) {
            slashEditorInst = p.editor; slashRange = p.range; slashItems.value = p.items
            const r = p.clientRect?.(); if (r) slashPos.value = { x: r.left, y: r.bottom + 6 }
          },
          onKeyDown({ event }: { event: KeyboardEvent }) {
            const len = slashItems.value.length
            if (event.key === 'Escape') { slashVisible.value = false; return true }
            if (!len) return false
            if (event.key === 'ArrowDown') { slashIndex.value = (slashIndex.value + 1) % len; return true }
            if (event.key === 'ArrowUp') { slashIndex.value = (slashIndex.value - 1 + len) % len; return true }
            if (event.key === 'Enter') { const i = slashItems.value[slashIndex.value]; if (i) selectSlashCommand(i); return true }
            return false
          },
          onExit() { slashVisible.value = false; slashEditorInst = null; slashRange = null },
        }),
      }),
    ]
  },
})

// ─── Editor instance ───────────────────────────────────────────────────────────

const editor = useEditor({
  extensions: [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    Placeholder.configure({ placeholder: 'Escreva algo... use / para blocos, [[ para vincular notas.' }),
    Underline,
    TaskList,
    TaskItem.configure({ nested: true }),
    Link.configure({ openOnClick: false, autolink: true }),
    WikilinkNode,
    WikilinkSuggestion,
    SlashCommandExtension,
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell
  ],
  onCreate({ editor: ed }) {
    if (noteDetail.value) syncToEditor(noteDetail.value)
  },
  onUpdate({ editor: ed }) {
    const content = JSON.stringify(ed.getJSON())
    emit('content-change', content)
    markDirty()
  },
  onSelectionUpdate: () => {
    nextTick(updateBubble)
    nextTick(() => tableBarRef.value?.update())
  },
  onBlur() {
    setTimeout(() => { if (!bubbleRef.value?.matches(':hover')) bubbleVisible.value = false }, 150)
  },
  editorProps: {
    handleClickOn(_v, _p, _n, _np, event) {
      const el = (event.target as HTMLElement).closest('[data-wikilink-id]') as HTMLElement | null
      if (el?.dataset.wikilinkId) { emit('navigate-note', el.dataset.wikilinkId); return true }
      return false
    },
  },
})

onBeforeUnmount(() => {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  if (saveStatus.value === 'unsaved') void saveNote()
  editor.value?.destroy()
})

defineExpose({ isUnsaved: () => saveStatus.value === 'unsaved', doSave: saveNote })
</script>

<template>
  <div class="knowledge-editor flex flex-col h-full">
    <!-- Empty state -->
    <div v-if="!noteId" class="flex flex-col items-center justify-center h-full gap-3 text-center">
      <UIcon name="i-lucide-file-text" class="size-14 text-dimmed" />
      <p class="text-sm text-muted">Selecione ou crie uma nota para começar</p>
    </div>

    <!-- Loading -->
    <div v-else-if="loading" class="p-10 space-y-4">
      <USkeleton class="h-10 w-3/4" />
      <USkeleton class="h-3 w-1/3" />
      <div class="space-y-2 mt-6">
        <USkeleton class="h-4 w-full" />
        <USkeleton class="h-4 w-5/6" />
        <USkeleton class="h-4 w-4/5" />
        <USkeleton class="h-4 w-full" />
      </div>
    </div>

    <!-- Editor -->
    <template v-else-if="noteDetail">
      <!-- Title + save status -->
      <div class="px-10 pt-8 pb-2 shrink-0">
        <input
          v-model="editTitle"
          class="w-full text-3xl font-bold bg-transparent border-none outline-none placeholder:text-muted/30 text-highlighted leading-tight"
          placeholder="Sem título..."
          @blur="saveNote"
        />
        <div class="flex items-center gap-3 mt-1.5">
          <span class="text-xs text-muted">Editado {{ formatDate(noteDetail.updatedAt) }}</span>
          <div class="flex items-center gap-1 text-xs shrink-0">
            <template v-if="saveStatus === 'unsaved'">
              <span class="size-1.5 rounded-full bg-amber-400 dark:bg-amber-500 animate-pulse" />
              <span class="text-muted">Não salvo</span>
            </template>
            <template v-else-if="saveStatus === 'saved'">
              <UIcon name="i-lucide-check-circle" class="size-3 text-success" />
              <span class="text-muted">Salvo às {{ savedAtText }}</span>
            </template>
            <template v-else-if="saveStatus === 'error'">
              <UIcon name="i-lucide-alert-circle" class="size-3 text-error" />
              <button type="button" class="text-primary underline underline-offset-2 cursor-pointer" @click="saveNote">Tentar novamente</button>
            </template>
          </div>
        </div>
      </div>

      <!-- Tiptap content area -->
      <div
        class="flex-1 overflow-y-auto px-10 pb-10 cursor-text"
        @click.self="editor?.commands.focus()"
      >
        <EditorContent :editor="editor" class="knowledge-content" />
      </div>

      <!-- Links / Backlinks panel -->
      <div
        class="border-t border-default shrink-0 transition-colors duration-150"
        :class="isDragOver ? 'bg-primary/5 border-primary/50' : ''"
        @dragover.prevent="onDragOver"
        @dragleave="onDragLeave"
        @drop.prevent="onDrop"
      >
        <!-- Drop indicator -->
        <div v-if="isDragOver" class="flex items-center justify-center gap-2 py-2 text-xs text-primary font-medium">
          <UIcon name="i-lucide-link" class="size-3.5" />
          Soltar para vincular nota
        </div>
        <div class="px-10 py-3">
          <div class="grid grid-cols-2 gap-6">
            <!-- Outgoing links -->
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <h4 class="text-xs font-semibold text-muted uppercase tracking-wide flex items-center gap-1">
                  <UIcon name="i-lucide-link" class="size-3" />
                  Vínculos ({{ noteDetail.links?.length ?? 0 }})
                </h4>
                <UButton icon="i-lucide-plus" size="xs" variant="ghost" @click="linkSearchOpen = !linkSearchOpen" />
              </div>

              <div v-if="linkSearchOpen" class="mb-2 space-y-1">
                <UInput v-model="linkSearchQuery" icon="i-lucide-search" placeholder="Buscar nota..." size="xs" autofocus />
                <div class="max-h-28 overflow-y-auto rounded border border-default bg-default">
                  <button
                    v-for="n in availableNotesForLink.slice(0, 10)"
                    :key="n.id"
                    class="w-full text-left px-2 py-1.5 text-xs hover:bg-elevated transition-colors truncate block"
                    @click="addLink(n.id)"
                  >
                    {{ n.title }}
                  </button>
                  <p v-if="availableNotesForLink.length === 0" class="px-2 py-1.5 text-xs text-muted">Nenhuma nota disponível</p>
                </div>
              </div>

              <div v-if="noteDetail.links?.length" class="space-y-0.5">
                <div
                  v-for="link in noteDetail.links"
                  :key="link.id"
                  class="flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-elevated group"
                >
                  <button class="text-primary hover:underline truncate" @click="emit('navigate-note', link.targetNoteId)">
                    {{ link.targetNote?.title ?? 'Nota excluída' }}
                  </button>
                  <UButton icon="i-lucide-x" size="xs" color="error" variant="ghost" class="opacity-0 group-hover:opacity-100 shrink-0" @click="removeLink(link.id)" />
                </div>
              </div>
              <p v-else class="text-xs text-muted">Sem vínculos</p>
            </div>

            <!-- Backlinks -->
            <div>
              <h4 class="text-xs font-semibold text-muted uppercase tracking-wide flex items-center gap-1 mb-1.5">
                <UIcon name="i-lucide-corner-down-left" class="size-3" />
                Referenciado por ({{ noteDetail.backlinks?.length ?? 0 }})
              </h4>
              <div v-if="noteDetail.backlinks?.length" class="space-y-0.5">
                <button
                  v-for="bl in noteDetail.backlinks"
                  :key="bl.id"
                  class="w-full text-left rounded px-2 py-1 text-xs text-primary hover:underline hover:bg-elevated truncate block"
                  @click="emit('navigate-note', bl.sourceNoteId)"
                >
                  {{ bl.sourceNote?.title ?? 'Nota excluída' }}
                </button>
              </div>
              <p v-else class="text-xs text-muted">Nenhuma nota referencia esta</p>
            </div>
          </div>

          <div class="flex justify-end mt-2 pt-2 border-t border-default">
            <UButton icon="i-lucide-trash-2" label="Excluir nota" size="xs" color="error" variant="ghost" @click="onDelete" />
          </div>
        </div>
      </div>
    </template>

    <!-- Bubble menu -->
    <Teleport to="body">
      <div
        v-if="bubbleVisible"
        ref="bubbleRef"
        class="kb-bubble"
        :style="{ left: `${bubblePos.x}px`, top: `${bubblePos.y}px` }"
        @mousedown.prevent
      >
        <button type="button" :class="['kb-bubble-btn', { active: editor?.isActive('bold') }]" @click="editor?.chain().focus().toggleBold().run()"><UIcon name="i-lucide-bold" class="size-3.5" /></button>
        <button type="button" :class="['kb-bubble-btn', { active: editor?.isActive('italic') }]" @click="editor?.chain().focus().toggleItalic().run()"><UIcon name="i-lucide-italic" class="size-3.5" /></button>
        <button type="button" :class="['kb-bubble-btn', { active: editor?.isActive('underline') }]" @click="editor?.chain().focus().toggleUnderline().run()"><UIcon name="i-lucide-underline" class="size-3.5" /></button>
        <button type="button" :class="['kb-bubble-btn', { active: editor?.isActive('strike') }]" @click="editor?.chain().focus().toggleStrike().run()"><UIcon name="i-lucide-strikethrough" class="size-3.5" /></button>
        <button type="button" :class="['kb-bubble-btn', { active: editor?.isActive('code') }]" @click="editor?.chain().focus().toggleCode().run()"><UIcon name="i-lucide-code" class="size-3.5" /></button>
        <div class="kb-bubble-sep" />
        <button type="button" :class="['kb-bubble-btn kb-bubble-btn--text', { active: editor?.isActive('heading', { level: 1 }) }]" @click="editor?.chain().focus().toggleHeading({ level: 1 }).run()">H1</button>
        <button type="button" :class="['kb-bubble-btn kb-bubble-btn--text', { active: editor?.isActive('heading', { level: 2 }) }]" @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()">H2</button>
        <button type="button" :class="['kb-bubble-btn kb-bubble-btn--text', { active: editor?.isActive('heading', { level: 3 }) }]" @click="editor?.chain().focus().toggleHeading({ level: 3 }).run()">H3</button>
      </div>
    </Teleport>

    <!-- Slash menu -->
    <Teleport to="body">
      <div
        v-if="slashVisible && slashItems.length"
        ref="slashMenuRef"
        class="kb-slash-menu"
        :style="{ top: `${slashPos.y}px`, left: `${slashPos.x}px` }"
      >
        <p class="kb-slash-label">Blocos básicos</p>
        <button
          v-for="(item, i) in slashItems"
          :key="item.title"
          type="button"
          :class="['kb-slash-item', { selected: i === slashIndex }]"
          @mouseenter="slashIndex = i"
          @click="selectSlashCommand(item)"
        >
          <span class="kb-slash-icon"><UIcon :name="item.icon" class="size-4" /></span>
          <span class="kb-slash-text">
            <span class="kb-slash-title">{{ item.title }}</span>
            <span class="kb-slash-desc">{{ item.description }}</span>
          </span>
        </button>
      </div>
    </Teleport>

    <!-- Table management bar -->
    <TiptapTableBar ref="tableBarRef" :editor="editor" />

    <!-- Wikilink suggestion menu -->
    <Teleport to="body">
      <div
        v-if="wikiVisible"
        ref="wikiMenuRef"
        class="kb-wiki-menu"
        :style="{ top: `${wikiPos.y}px`, left: `${wikiPos.x}px` }"
      >
        <p class="kb-wiki-label">Notas</p>
        <template v-if="wikiItems.length">
          <button
            v-for="(item, i) in wikiItems"
            :key="item.id"
            type="button"
            :class="['kb-wiki-item', { selected: i === wikiIndex }]"
            @mouseenter="wikiIndex = i"
            @click="wikiCommandFn?.(item)"
          >
            <UIcon name="i-lucide-file-text" class="size-3.5 shrink-0 text-muted" />
            <span class="truncate">{{ item.title }}</span>
          </button>
        </template>
        <p v-else class="kb-wiki-empty">Nenhuma nota encontrada</p>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* ─── Bubble menu ──────────────────────────────────────────────────────────── */
.kb-bubble {
  position: fixed;
  z-index: 9999;
  transform: translateX(-50%) translateY(calc(-100% - 8px));
  display: flex;
  align-items: center;
  gap: 1px;
  padding: 3px 4px;
  border-radius: 8px;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  box-shadow: 0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08);
  white-space: nowrap;
}
.kb-bubble-btn {
  display: flex; align-items: center; justify-content: center;
  min-width: 28px; height: 28px; padding: 0 4px;
  border-radius: 5px; border: none; background: transparent;
  color: var(--ui-text-muted); cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.kb-bubble-btn--text { font-size: 0.7rem; font-weight: 700; letter-spacing: -0.03em; }
.kb-bubble-btn:hover { background: var(--ui-bg-muted); color: var(--ui-text-highlighted); }
.kb-bubble-btn.active { background: var(--ui-bg-elevated); color: var(--ui-color-primary, #18b981); }
.kb-bubble-sep { width: 1px; height: 16px; background: var(--ui-border); margin: 0 2px; flex-shrink: 0; }

/* ─── Slash menu ───────────────────────────────────────────────────────────── */
.kb-slash-menu {
  position: fixed; z-index: 9999;
  width: 272px; max-height: 360px; overflow-y: auto;
  border-radius: 10px; background: var(--ui-bg); border: 1px solid var(--ui-border);
  box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
  padding: 6px;
}
.kb-slash-label { font-size: 0.7rem; font-weight: 500; color: var(--ui-text-dimmed); text-transform: uppercase; letter-spacing: 0.06em; padding: 4px 8px 6px; margin: 0; }
.kb-slash-item {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 5px 6px; border-radius: 6px; border: none; background: transparent;
  cursor: pointer; text-align: left; transition: background 0.08s;
}
.kb-slash-item:hover, .kb-slash-item.selected { background: var(--ui-bg-muted); }
.kb-slash-icon {
  display: flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; border-radius: 6px;
  background: var(--ui-bg-elevated); border: 1px solid var(--ui-border);
  flex-shrink: 0; color: var(--ui-text-muted);
}
.kb-slash-item.selected .kb-slash-icon, .kb-slash-item:hover .kb-slash-icon { background: var(--ui-bg); color: var(--ui-text-highlighted); }
.kb-slash-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.kb-slash-title { font-size: 0.875rem; font-weight: 500; color: var(--ui-text-highlighted); line-height: 1.3; }
.kb-slash-desc { font-size: 0.75rem; color: var(--ui-text-muted); line-height: 1.3; }

/* ─── Wikilink menu ────────────────────────────────────────────────────────── */
.kb-wiki-menu {
  position: fixed; z-index: 9999;
  width: 240px; max-height: 260px; overflow-y: auto;
  border-radius: 8px; background: var(--ui-bg); border: 1px solid var(--ui-border);
  box-shadow: 0 8px 24px rgba(0,0,0,0.1), 0 2px 6px rgba(0,0,0,0.07);
  padding: 4px;
}
.kb-wiki-label { font-size: 0.65rem; font-weight: 600; color: var(--ui-text-dimmed); text-transform: uppercase; letter-spacing: 0.07em; padding: 4px 8px; margin: 0; }
.kb-wiki-item {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 5px 8px; border-radius: 5px; border: none; background: transparent;
  cursor: pointer; text-align: left; font-size: 0.8125rem;
  color: var(--ui-text-highlighted); transition: background 0.08s; min-width: 0;
}
.kb-wiki-item:hover, .kb-wiki-item.selected { background: var(--ui-bg-muted); }
.kb-wiki-empty { padding: 8px; font-size: 0.8125rem; color: var(--ui-text-muted); text-align: center; margin: 0; }
</style>

<style>
/* ─── Knowledge editor Tiptap content (global) ─────────────────────────────── */
.knowledge-content .tiptap {
  outline: none;
  min-height: 300px;
  font-family: inherit;
  font-size: 1rem;
  line-height: 1.8;
  color: var(--ui-text-highlighted) !important;
  background: transparent !important;
  caret-color: var(--ui-color-primary, #18b981);
}
.knowledge-content .tiptap p { margin: 0 0 0.2rem; color: var(--ui-text-highlighted) !important; }
.knowledge-content .tiptap > * + * { margin-top: 0.2rem; }

/* Headings */
.knowledge-content .tiptap h1, .knowledge-content .tiptap h2, .knowledge-content .tiptap h3 { color: var(--ui-text-highlighted) !important; }
.knowledge-content .tiptap h1 { font-size: 1.875rem; font-weight: 700; line-height: 1.25; margin: 1.25rem 0 0.25rem; letter-spacing: -0.02em; }
.knowledge-content .tiptap h2 { font-size: 1.375rem; font-weight: 600; line-height: 1.3; margin: 1rem 0 0.2rem; letter-spacing: -0.01em; }
.knowledge-content .tiptap h3 { font-size: 1.125rem; font-weight: 600; line-height: 1.4; margin: 0.75rem 0 0.15rem; }

/* Lists */
.knowledge-content .tiptap ul { list-style-type: disc; padding-left: 1.5rem; margin: 0.2rem 0; color: var(--ui-text-highlighted) !important; }
.knowledge-content .tiptap ol { list-style-type: decimal; padding-left: 1.5rem; margin: 0.2rem 0; color: var(--ui-text-highlighted) !important; }
.knowledge-content .tiptap ul ul { list-style-type: circle; }
.knowledge-content .tiptap ul ul ul { list-style-type: square; }
.knowledge-content .tiptap li { margin: 0.1rem 0; display: list-item; color: var(--ui-text-highlighted) !important; }
.knowledge-content .tiptap li p { margin: 0; }

/* Task list */
.knowledge-content .tiptap ul[data-type="taskList"] { padding-left: 0.25rem; list-style: none; }
.knowledge-content .tiptap ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5rem; }
.knowledge-content .tiptap ul[data-type="taskList"] li > label { flex-shrink: 0; user-select: none; padding-top: 0.3rem; }
.knowledge-content .tiptap ul[data-type="taskList"] li > label input[type="checkbox"] { cursor: pointer; accent-color: var(--ui-color-primary, #18b981); width: 15px; height: 15px; }
.knowledge-content .tiptap ul[data-type="taskList"] li > div { flex: 1; }
.knowledge-content .tiptap ul[data-type="taskList"] li[data-checked="true"] > div { text-decoration: line-through; opacity: 0.5; }

/* Blockquote */
.knowledge-content .tiptap blockquote { border-left: 3px solid var(--ui-color-primary, #18b981); padding: 0.25rem 0 0.25rem 0.875rem; margin: 0.5rem 0; color: var(--ui-text-muted) !important; font-style: italic; background: color-mix(in srgb, var(--ui-color-primary, #18b981) 5%, transparent); border-radius: 0 4px 4px 0; }
.knowledge-content .tiptap blockquote p { margin: 0; color: var(--ui-text-muted) !important; }

/* Code */
.knowledge-content .tiptap code { font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace; background: color-mix(in srgb, var(--ui-color-primary, #18b981) 10%, var(--ui-bg-muted)); border: 1px solid color-mix(in srgb, var(--ui-color-primary, #18b981) 20%, var(--ui-border)); border-radius: 4px; padding: 0.1em 0.35em; font-size: 0.85em; color: var(--ui-color-primary, #18b981) !important; }
.knowledge-content .tiptap pre { background: var(--ui-bg-muted); border: 1px solid var(--ui-border); border-radius: 8px; padding: 1rem 1.25rem; margin: 0.5rem 0; overflow-x: auto; }
.knowledge-content .tiptap pre code { background: transparent !important; border: none !important; padding: 0; font-size: 0.875rem; line-height: 1.6; color: var(--ui-text-highlighted) !important; }

/* HR */
.knowledge-content .tiptap hr { border: none; border-top: 1px solid var(--ui-border); margin: 0.75rem 0; }

/* Links */
.knowledge-content .tiptap a { color: var(--ui-color-primary, #18b981) !important; text-decoration: underline; text-underline-offset: 2px; text-decoration-thickness: 1px; cursor: pointer; }
.knowledge-content .tiptap a:hover { opacity: 0.8; }

/* Wikilinks */
.knowledge-content .tiptap .wikilink-node {
  color: var(--ui-color-primary, #18b981);
  background: color-mix(in srgb, var(--ui-color-primary, #18b981) 10%, transparent);
  border-radius: 3px;
  padding: 0.05em 0.3em;
  cursor: pointer;
  display: inline;
  user-select: none;
  transition: background 0.1s;
  font-size: 0.9375em;
}
.knowledge-content .tiptap .wikilink-node:hover { background: color-mix(in srgb, var(--ui-color-primary, #18b981) 20%, transparent); text-decoration: underline; text-underline-offset: 2px; }

/* Placeholder */
.knowledge-content .tiptap p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: var(--ui-text-dimmed) !important; pointer-events: none; float: left; height: 0; }

/* Text styles */
.knowledge-content .tiptap strong { font-weight: 700; color: var(--ui-text-highlighted) !important; }
.knowledge-content .tiptap em { font-style: italic; }
.knowledge-content .tiptap u { text-decoration: underline; text-underline-offset: 2px; }
.knowledge-content .tiptap s { text-decoration: line-through; opacity: 0.7; }

/* Tables */
.knowledge-content .tiptap .tableWrapper { overflow-x: auto; }
.knowledge-content .tiptap table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.75rem 0;
  table-layout: fixed;
}
.knowledge-content .tiptap table td,
.knowledge-content .tiptap table th {
  border: 1px solid var(--ui-border);
  padding: 0.4rem 0.65rem;
  min-width: 60px;
  vertical-align: top;
  position: relative;
  color: var(--ui-text-highlighted) !important;
}
.knowledge-content .tiptap table th {
  font-weight: 600;
  background: var(--ui-bg-muted);
}
.knowledge-content .tiptap table .selectedCell {
  background: color-mix(in srgb, var(--ui-color-primary, #18b981) 10%, transparent) !important;
}
.knowledge-content .tiptap table .column-resize-handle {
  position: absolute;
  right: -2px;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--ui-color-primary, #18b981);
  pointer-events: none;
}
.knowledge-content .tiptap .resize-cursor { cursor: col-resize; }
</style>
