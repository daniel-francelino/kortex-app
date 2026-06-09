<script setup lang="ts">
import type { Editor, Range } from '@tiptap/core'
import { EditorContent, useEditor } from '@tiptap/vue-3'
import type { NotionCommandItem, WikiSuggestionItem } from '~/composables/useNotionEditor'
import {
  createNotionCommandItems,
  createNotionEditorExtensions,
  createSlashCommandExtension
} from '~/composables/useNotionEditor'
import {
  isEditorContentEmpty,
  normalizeEditorContent,
  serializeEditorContent
} from '~/utils/editor/content'

type EditorSurface = 'boxed' | 'plain'
type EditorUploadKind = 'image' | 'file'
type ProseMirrorNode = Editor['state']['doc']

interface TopLevelBlock {
  index: number
  from: number
  to: number
  node: ProseMirrorNode
}

interface MentionSuggestionItem {
  id: string
  label: string
  description?: string
  kind?: string
}

interface EmojiSuggestionItem {
  emoji: string
  name: string
  label: string
}

interface EditorUploadResponse {
  bucket: string
  path: string
  url: string
  name: string
  size: number
  type: string
  kind: EditorUploadKind
}

const props = withDefaults(defineProps<{
  modelValue?: string | null
  placeholder?: string
  editable?: boolean
  minHeight?: string
  surface?: EditorSurface
  enableWikilinks?: boolean
  currentNoteId?: string | null
  availableNotes?: WikiSuggestionItem[]
  mentionItems?: MentionSuggestionItem[]
  uploadEndpoint?: string
}>(), {
  modelValue: '',
  placeholder: 'Escreva algo, ou pressione "/" para inserir blocos...',
  editable: true,
  minHeight: '8rem',
  surface: 'boxed',
  enableWikilinks: false,
  currentNoteId: null,
  availableNotes: () => [],
  mentionItems: () => [],
  uploadEndpoint: '/api/editor/uploads'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'change': [value: string]
  'ready': [editor: Editor]
  'focus': []
  'blur': []
  'wikilink-click': [noteId: string]
}>()

const toast = useToast()
const editorShellRef = ref<HTMLElement | null>(null)
const tableBarRef = ref<{ update: () => void } | null>(null)
const lastEmittedValue = ref(props.modelValue ?? '')
const imageInputRef = ref<HTMLInputElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

const bubbleVisible = ref(false)
const bubblePos = ref({ x: 0, y: 0 })
const bubbleRef = ref<HTMLElement | null>(null)

const slashVisible = ref(false)
const slashItems = ref<NotionCommandItem[]>([])
const slashIndex = ref(0)
const slashPos = ref({ x: 0, y: 0 })
const slashMenuRef = ref<HTMLElement | null>(null)
let slashRange: Range | null = null
let slashEditor: Editor | null = null

const wikiVisible = ref(false)
const wikiItems = ref<WikiSuggestionItem[]>([])
const wikiIndex = ref(0)
const wikiPos = ref({ x: 0, y: 0 })
const wikiMenuRef = ref<HTMLElement | null>(null)
let wikiRange: Range | null = null

const mentionVisible = ref(false)
const mentionQuery = ref('')
const mentionPos = ref({ x: 0, y: 0 })
const mentionInsertPos = ref(0)
const mentionInputRef = ref<HTMLInputElement | null>(null)

const emojiVisible = ref(false)
const emojiPos = ref({ x: 0, y: 0 })
const emojiInsertPos = ref(0)

const activeBlock = ref<TopLevelBlock | null>(null)
const blockVisible = ref(false)
const blockPos = ref({ x: 0, y: 0 })
const draggingBlockIndex = ref<number | null>(null)

const emojiItems: EmojiSuggestionItem[] = [
  { emoji: '\u{2728}', name: 'sparkles', label: 'Destaque' },
  { emoji: '\u{1F4A1}', name: 'idea', label: 'Ideia' },
  { emoji: '\u{2705}', name: 'done', label: 'Concluido' },
  { emoji: '\u{1F525}', name: 'fire', label: 'Urgente' },
  { emoji: '\u{1F4CC}', name: 'pin', label: 'Fixar' },
  { emoji: '\u{1F9E0}', name: 'brain', label: 'Insight' },
  { emoji: '\u{1F4DA}', name: 'books', label: 'Estudo' },
  { emoji: '\u{1F680}', name: 'rocket', label: 'Acao' }
]

const resolvedMentionItems = computed<MentionSuggestionItem[]>(() => {
  if (props.mentionItems.length) return props.mentionItems

  return props.availableNotes
    .filter(note => note.id !== props.currentNoteId)
    .map(note => ({
      id: note.id,
      label: note.title,
      description: 'Nota',
      kind: 'note'
    }))
})

const filteredMentionItems = computed(() => {
  const query = mentionQuery.value.trim().toLowerCase()
  return resolvedMentionItems.value
    .filter(item =>
      !query
      || item.label.toLowerCase().includes(query)
      || item.description?.toLowerCase().includes(query)
    )
    .slice(0, 8)
})

const commandItems = computed(() =>
  createNotionCommandItems({
    uploadImage: () => openUploadPicker('image'),
    uploadFile: () => openUploadPicker('file'),
    openMention: openMentionMenu,
    openEmoji: openEmojiMenu
  })
)

const slashCommandExtension = createSlashCommandExtension({
  onStart(payload) {
    slashEditor = payload.editor
    slashRange = payload.range
    slashItems.value = payload.items
    slashIndex.value = 0
    slashVisible.value = true

    const rect = payload.clientRect?.()
    if (rect) slashPos.value = { x: rect.left, y: rect.bottom + 6 }
  },
  onUpdate(payload) {
    slashEditor = payload.editor
    slashRange = payload.range
    slashItems.value = payload.items

    const rect = payload.clientRect?.()
    if (rect) slashPos.value = { x: rect.left, y: rect.bottom + 6 }
  },
  onKeyDown({ event }) {
    const total = slashItems.value.length
    if (event.key === 'Escape') {
      slashVisible.value = false
      return true
    }

    if (!total) return false

    if (event.key === 'ArrowDown') {
      slashIndex.value = (slashIndex.value + 1) % total
      return true
    }

    if (event.key === 'ArrowUp') {
      slashIndex.value = (slashIndex.value - 1 + total) % total
      return true
    }

    if (event.key === 'Enter') {
      const item = slashItems.value[slashIndex.value]
      if (item) selectSlashCommand(item)
      return true
    }

    return false
  },
  onExit() {
    slashVisible.value = false
    slashEditor = null
    slashRange = null
  }
}, () => commandItems.value)

const editor = useEditor({
  content: normalizeEditorContent(props.modelValue),
  extensions: createNotionEditorExtensions({
    placeholder: props.placeholder,
    slashCommand: slashCommandExtension,
    enableWikilinks: props.enableWikilinks
  }),
  editable: props.editable,
  editorProps: {
    handleClickOn(_view, _pos, _node, _nodePos, event) {
      const target = event.target as HTMLElement
      const link = target.closest('[data-wikilink-id]') as HTMLElement | null
      const noteId = link?.dataset.wikilinkId
      if (!noteId) return false

      emit('wikilink-click', noteId)
      return true
    },
    handleKeyDown(_view, event) {
      return handleWikiKeyDown(event)
    },
    handleDrop(view, event) {
      const hasEditorBlock = event.dataTransfer?.types.includes('application/x-kortex-editor-block')
      if (hasEditorBlock) return false

      const files = Array.from(event.dataTransfer?.files ?? [])
      if (!files.length) return false

      event.preventDefault()
      const dropPos = view.posAtCoords({ left: event.clientX, top: event.clientY })
      if (dropPos) editor.value?.chain().focus().setTextSelection(dropPos.pos).run()
      void uploadFiles(files)
      return true
    },
    handlePaste(_view, event) {
      const files = Array.from(event.clipboardData?.files ?? [])
      if (!files.length) return false

      event.preventDefault()
      void uploadFiles(files)
      return true
    }
  },
  onCreate({ editor: instance }) {
    emit('ready', instance)
    nextTick(() => {
      updateBlockTools()
      updateWikilinkSuggestion()
    })
  },
  onUpdate({ editor: instance }) {
    const value = serializeEditorContent(instance.getJSON())
    lastEmittedValue.value = value
    emit('update:modelValue', value)
    emit('change', value)
    updateWikilinkSuggestion()
    nextTick(updateBlockTools)
  },
  onSelectionUpdate() {
    nextTick(updateBubble)
    nextTick(() => tableBarRef.value?.update())
    nextTick(updateWikilinkSuggestion)
    nextTick(updateBlockTools)
  },
  onFocus() {
    emit('focus')
    nextTick(updateBlockTools)
  },
  onBlur() {
    emit('blur')
    setTimeout(() => {
      if (!bubbleRef.value?.matches(':hover')) bubbleVisible.value = false
    }, 150)
  }
})

watch(() => props.modelValue, (value) => {
  const nextValue = value ?? ''
  if (nextValue === lastEmittedValue.value) return
  if (!editor.value) return

  const currentValue = serializeEditorContent(editor.value.getJSON())
  if (nextValue === currentValue) return

  editor.value.commands.setContent(normalizeEditorContent(nextValue), { emitUpdate: false })
  lastEmittedValue.value = nextValue
  nextTick(() => {
    updateBlockTools()
    updateWikilinkSuggestion()
  })
})

watch(() => props.editable, (value) => {
  editor.value?.setEditable(value)
  if (!value) {
    bubbleVisible.value = false
    slashVisible.value = false
    wikiVisible.value = false
    mentionVisible.value = false
    emojiVisible.value = false
    blockVisible.value = false
  }
})

watch(slashIndex, (index) => {
  nextTick(() => {
    const item = slashMenuRef.value?.children[index] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  })
})

watch(wikiIndex, (index) => {
  nextTick(() => {
    const item = wikiMenuRef.value?.children[index] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  })
})

watch(() => props.availableNotes, () => {
  if (wikiVisible.value) updateWikilinkSuggestion()
})

onBeforeUnmount(() => {
  editor.value?.destroy()
})

function selectSlashCommand(item: NotionCommandItem) {
  if (!slashEditor || !slashRange) return
  item.command({ editor: slashEditor, range: slashRange })
  slashVisible.value = false
}

function openUploadPicker(kind: EditorUploadKind) {
  if (!props.editable) return
  if (kind === 'image') imageInputRef.value?.click()
  else fileInputRef.value?.click()
}

function onUploadInputChange(event: Event, kind: EditorUploadKind) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length) return

  void uploadFiles(files, kind)
}

async function uploadFiles(files: File[], forcedKind?: EditorUploadKind) {
  if (!files.length || uploading.value) return

  uploading.value = true

  try {
    for (const file of files) {
      const kind = forcedKind ?? (file.type.startsWith('image/') ? 'image' : 'file')
      const uploaded = await uploadEditorFile(file, kind)
      insertUploadedFile(uploaded)
    }
  } catch {
    toast.add({
      title: 'Erro',
      description: 'Nao foi possivel enviar o arquivo.',
      color: 'error'
    })
  } finally {
    uploading.value = false
  }
}

async function uploadEditorFile(file: File, kind: EditorUploadKind) {
  const form = new FormData()
  form.append('file', file)
  form.append('kind', kind)

  return await $fetch<EditorUploadResponse>(props.uploadEndpoint, {
    method: 'POST',
    body: form
  })
}

function insertUploadedFile(uploaded: EditorUploadResponse) {
  const instance = editor.value
  if (!instance) return

  const attrs = {
    src: uploaded.url,
    href: uploaded.url,
    name: uploaded.name,
    alt: uploaded.name,
    size: uploaded.size,
    mimeType: uploaded.type,
    path: uploaded.path,
    bucket: uploaded.bucket
  }

  instance.chain().focus().insertContent(
    uploaded.kind === 'image'
      ? { type: 'editorImage', attrs }
      : { type: 'editorFile', attrs }
  ).run()
}

function openMentionMenu() {
  const instance = editor.value
  if (!instance) return

  mentionQuery.value = ''
  mentionInsertPos.value = instance.state.selection.from

  try {
    const rect = instance.view.coordsAtPos(mentionInsertPos.value)
    mentionPos.value = { x: rect.left, y: rect.bottom + 6 }
  } catch {
    mentionPos.value = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  }

  mentionVisible.value = true
  emojiVisible.value = false
  nextTick(() => mentionInputRef.value?.focus())
}

function closeMentionMenu() {
  mentionVisible.value = false
  mentionQuery.value = ''
}

function insertMention(item?: MentionSuggestionItem) {
  const instance = editor.value
  if (!instance) return

  const label = item?.label ?? mentionQuery.value.trim()
  if (!label) {
    closeMentionMenu()
    return
  }

  instance
    .chain()
    .focus()
    .insertContentAt(mentionInsertPos.value, [
      {
        type: 'mention',
        attrs: {
          id: item?.id ?? label,
          label,
          kind: item?.kind ?? 'manual'
        }
      },
      {
        type: 'text',
        text: ' '
      }
    ])
    .run()

  closeMentionMenu()
}

function openEmojiMenu() {
  const instance = editor.value
  if (!instance) return

  emojiInsertPos.value = instance.state.selection.from

  try {
    const rect = instance.view.coordsAtPos(emojiInsertPos.value)
    emojiPos.value = { x: rect.left, y: rect.bottom + 6 }
  } catch {
    emojiPos.value = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  }

  emojiVisible.value = true
  mentionVisible.value = false
}

function insertEmoji(item: EmojiSuggestionItem) {
  const instance = editor.value
  if (!instance) return

  instance
    .chain()
    .focus()
    .insertContentAt(emojiInsertPos.value, [
      {
        type: 'emoji',
        attrs: {
          emoji: item.emoji,
          name: item.name
        }
      },
      {
        type: 'text',
        text: ' '
      }
    ])
    .run()

  emojiVisible.value = false
}

function updateBubble() {
  const instance = editor.value
  if (!instance?.isEditable) {
    bubbleVisible.value = false
    return
  }

  const { from, to } = instance.state.selection
  if (from === to) {
    bubbleVisible.value = false
    return
  }

  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    bubbleVisible.value = false
    return
  }

  const rect = selection.getRangeAt(0).getBoundingClientRect()
  if (!rect.width) {
    bubbleVisible.value = false
    return
  }

  bubblePos.value = {
    x: Math.round(rect.left + rect.width / 2),
    y: Math.round(rect.top)
  }
  bubbleVisible.value = true
}

function hideWikiSuggestion() {
  wikiVisible.value = false
  wikiRange = null
}

function updateWikilinkSuggestion() {
  const instance = editor.value
  if (!props.enableWikilinks || !props.editable || !instance?.isEditable) {
    hideWikiSuggestion()
    return
  }

  const { selection } = instance.state
  if (!selection.empty) {
    hideWikiSuggestion()
    return
  }

  const cursor = selection.$from
  const textBefore = cursor.parent.textBetween(0, cursor.parentOffset, '\0', '\0')
  const start = textBefore.lastIndexOf('[[')

  if (start < 0) {
    hideWikiSuggestion()
    return
  }

  const query = textBefore.slice(start + 2)
  if (query.includes(']]') || query.length > 80) {
    hideWikiSuggestion()
    return
  }

  const q = query.toLowerCase()
  const items = props.availableNotes
    .filter(note => note.id !== props.currentNoteId)
    .filter(note => !q || note.title.toLowerCase().includes(q))
    .slice(0, 8)

  wikiItems.value = items
  wikiIndex.value = 0
  wikiRange = {
    from: cursor.pos - query.length - 2,
    to: cursor.pos
  }

  try {
    const rect = instance.view.coordsAtPos(cursor.pos)
    wikiPos.value = { x: rect.left, y: rect.bottom + 6 }
    wikiVisible.value = true
  } catch {
    hideWikiSuggestion()
  }
}

function handleWikiKeyDown(event: KeyboardEvent) {
  if (!wikiVisible.value) return false

  const total = wikiItems.value.length
  if (event.key === 'Escape') {
    hideWikiSuggestion()
    return true
  }

  if (!total) return false

  if (event.key === 'ArrowDown') {
    wikiIndex.value = (wikiIndex.value + 1) % total
    return true
  }

  if (event.key === 'ArrowUp') {
    wikiIndex.value = (wikiIndex.value - 1 + total) % total
    return true
  }

  if (event.key === 'Enter') {
    const item = wikiItems.value[wikiIndex.value]
    if (item) selectWikiItem(item)
    return true
  }

  return false
}

function selectWikiItem(item: WikiSuggestionItem) {
  if (!editor.value || !wikiRange) return

  editor.value
    .chain()
    .focus()
    .deleteRange(wikiRange)
    .insertContent({ type: 'wikilink', attrs: { noteId: item.id, title: item.title } })
    .insertContent(' ')
    .run()

  hideWikiSuggestion()
}

function getTopLevelBlocks(instance = editor.value): TopLevelBlock[] {
  if (!instance) return []

  const blocks: TopLevelBlock[] = []
  instance.state.doc.forEach((node, offset, index) => {
    blocks.push({
      index,
      from: offset,
      to: offset + node.nodeSize,
      node
    })
  })

  return blocks
}

function getActiveBlock(instance = editor.value): TopLevelBlock | null {
  if (!instance) return null

  const from = instance.state.selection.from
  return getTopLevelBlocks(instance).find(block => from >= block.from && from <= block.to) ?? null
}

function updateBlockTools() {
  const instance = editor.value
  const shell = editorShellRef.value

  if (!props.editable || !instance?.isEditable || !shell) {
    blockVisible.value = false
    activeBlock.value = null
    return
  }

  const block = getActiveBlock(instance)
  if (!block) {
    blockVisible.value = false
    activeBlock.value = null
    return
  }

  try {
    const shellRect = shell.getBoundingClientRect()
    const coords = instance.view.coordsAtPos(Math.min(block.from + 1, instance.state.doc.content.size))
    activeBlock.value = block
    blockPos.value = {
      x: Math.max(8, shellRect.left - 36),
      y: Math.max(8, coords.top - 1)
    }
    blockVisible.value = true
  } catch {
    blockVisible.value = false
    activeBlock.value = null
  }
}

function reorderBlock(sourceIndex: number, targetIndex: number) {
  const instance = editor.value
  if (!instance) return

  const blocks = getTopLevelBlocks(instance)
  const boundedTarget = Math.max(0, Math.min(targetIndex, blocks.length - 1))
  if (sourceIndex === boundedTarget || !blocks[sourceIndex]) return

  const nodes = blocks.map(block => block.node)
  const moved = nodes.splice(sourceIndex, 1)[0]
  if (!moved) return

  nodes.splice(boundedTarget, 0, moved)

  const transaction = instance.state.tr.replaceWith(0, instance.state.doc.content.size, nodes)
  instance.view.dispatch(transaction.scrollIntoView())
  instance.commands.focus()
  nextTick(updateBlockTools)
}

function moveActiveBlock(direction: -1 | 1) {
  const block = activeBlock.value
  if (!block) return
  reorderBlock(block.index, block.index + direction)
}

function duplicateActiveBlock() {
  const instance = editor.value
  const block = activeBlock.value
  if (!instance || !block) return

  const transaction = instance.state.tr.insert(block.to, block.node)
  instance.view.dispatch(transaction.scrollIntoView())
  instance.commands.focus()
  nextTick(updateBlockTools)
}

function deleteActiveBlock() {
  const instance = editor.value
  const block = activeBlock.value
  if (!instance || !block) return

  if (instance.state.doc.childCount <= 1) {
    instance.commands.clearContent()
    nextTick(updateBlockTools)
    return
  }

  const transaction = instance.state.tr.delete(block.from, block.to)
  instance.view.dispatch(transaction.scrollIntoView())
  instance.commands.focus()
  nextTick(updateBlockTools)
}

function copyActiveBlockText() {
  const text = activeBlock.value?.node?.textContent ?? ''
  if (!text.trim()) return
  void navigator.clipboard?.writeText(text)
}

function turnActiveBlockInto(kind: 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'bulletList' | 'taskList') {
  const instance = editor.value
  if (!instance) return

  const chain = instance.chain().focus()

  if (kind === 'paragraph') chain.setParagraph().run()
  if (kind === 'heading1') chain.toggleHeading({ level: 1 }).run()
  if (kind === 'heading2') chain.toggleHeading({ level: 2 }).run()
  if (kind === 'heading3') chain.toggleHeading({ level: 3 }).run()
  if (kind === 'bulletList') chain.toggleBulletList().run()
  if (kind === 'taskList') chain.toggleTaskList().run()
}

function onBlockDragStart(event: DragEvent) {
  const block = activeBlock.value
  if (!block || !event.dataTransfer) return

  draggingBlockIndex.value = block.index
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('application/x-kortex-editor-block', String(block.index))
}

function onBlockDragEnd() {
  draggingBlockIndex.value = null
}

function onEditorDragOver(event: DragEvent) {
  const hasEditorBlock = event.dataTransfer?.types.includes('application/x-kortex-editor-block')
  if (!hasEditorBlock && draggingBlockIndex.value === null) return

  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
}

function onEditorDrop(event: DragEvent) {
  const data = event.dataTransfer?.getData('application/x-kortex-editor-block')
  const sourceIndex = data ? Number(data) : draggingBlockIndex.value
  if (sourceIndex === null || Number.isNaN(sourceIndex)) return

  event.preventDefault()
  reorderBlock(sourceIndex, findDropTargetIndex(event.clientY))
  draggingBlockIndex.value = null
}

function findDropTargetIndex(clientY: number): number {
  const instance = editor.value
  if (!instance) return 0

  const blocks = getTopLevelBlocks(instance)
  for (const block of blocks) {
    try {
      const top = instance.view.coordsAtPos(Math.min(block.from + 1, instance.state.doc.content.size)).top
      const bottom = instance.view.coordsAtPos(Math.min(block.to, instance.state.doc.content.size)).bottom
      const midpoint = top + ((bottom - top) / 2)
      if (clientY < midpoint) return block.index
    } catch {
      continue
    }
  }

  return Math.max(0, blocks.length - 1)
}

function focus() {
  editor.value?.commands.focus()
}

function setContent(value?: string | null) {
  editor.value?.commands.setContent(normalizeEditorContent(value), { emitUpdate: false })
  lastEmittedValue.value = value ?? ''
}

function getContent() {
  if (!editor.value) return props.modelValue ?? ''
  return serializeEditorContent(editor.value.getJSON())
}

function clearContent() {
  editor.value?.commands.clearContent()
}

function getEditor() {
  return editor.value
}

defineExpose({
  focus,
  setContent,
  getContent,
  clearContent,
  getEditor,
  isEmpty: () => isEditorContentEmpty(getContent())
})
</script>

<template>
  <div
    class="kortex-editor"
    :class="[`kortex-editor--${surface}`, { 'is-readonly': !editable }]"
    :style="{ '--kortex-editor-min-height': minHeight }"
  >
    <input
      ref="imageInputRef"
      class="sr-only"
      type="file"
      accept="image/*"
      multiple
      @change="onUploadInputChange($event, 'image')"
    >
    <input
      ref="fileInputRef"
      class="sr-only"
      type="file"
      multiple
      @change="onUploadInputChange($event, 'file')"
    >

    <div
      ref="editorShellRef"
      class="kortex-editor-shell"
      @dragover="onEditorDragOver"
      @drop="onEditorDrop"
    >
      <div
        v-if="uploading"
        class="kortex-upload-status"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-3.5 animate-spin"
        />
        <span>Enviando...</span>
      </div>
      <EditorContent
        :editor="editor"
        class="kortex-editor-content"
      />
    </div>

    <Teleport to="body">
      <div
        v-if="bubbleVisible && editable"
        ref="bubbleRef"
        class="kortex-bubble"
        :style="{ left: `${bubblePos.x}px`, top: `${bubblePos.y}px` }"
        @mousedown.prevent
      >
        <button
          type="button"
          :class="['kortex-menu-btn', { active: editor?.isActive('bold') }]"
          title="Negrito"
          @click="editor?.chain().focus().toggleBold().run()"
        >
          <UIcon name="i-lucide-bold" class="size-3.5" />
        </button>
        <button
          type="button"
          :class="['kortex-menu-btn', { active: editor?.isActive('italic') }]"
          title="Italico"
          @click="editor?.chain().focus().toggleItalic().run()"
        >
          <UIcon name="i-lucide-italic" class="size-3.5" />
        </button>
        <button
          type="button"
          :class="['kortex-menu-btn', { active: editor?.isActive('underline') }]"
          title="Sublinhado"
          @click="editor?.chain().focus().toggleUnderline().run()"
        >
          <UIcon name="i-lucide-underline" class="size-3.5" />
        </button>
        <button
          type="button"
          :class="['kortex-menu-btn', { active: editor?.isActive('strike') }]"
          title="Tachado"
          @click="editor?.chain().focus().toggleStrike().run()"
        >
          <UIcon name="i-lucide-strikethrough" class="size-3.5" />
        </button>
        <button
          type="button"
          :class="['kortex-menu-btn', { active: editor?.isActive('code') }]"
          title="Codigo inline"
          @click="editor?.chain().focus().toggleCode().run()"
        >
          <UIcon name="i-lucide-code" class="size-3.5" />
        </button>
        <div class="kortex-menu-sep" />
        <button
          type="button"
          :class="['kortex-menu-btn kortex-menu-btn--text', { active: editor?.isActive('heading', { level: 1 }) }]"
          title="Titulo 1"
          @click="editor?.chain().focus().toggleHeading({ level: 1 }).run()"
        >
          H1
        </button>
        <button
          type="button"
          :class="['kortex-menu-btn kortex-menu-btn--text', { active: editor?.isActive('heading', { level: 2 }) }]"
          title="Titulo 2"
          @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()"
        >
          H2
        </button>
        <button
          type="button"
          :class="['kortex-menu-btn kortex-menu-btn--text', { active: editor?.isActive('heading', { level: 3 }) }]"
          title="Titulo 3"
          @click="editor?.chain().focus().toggleHeading({ level: 3 }).run()"
        >
          H3
        </button>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="blockVisible && editable"
        class="kortex-block-menu"
        :style="{ left: `${blockPos.x}px`, top: `${blockPos.y}px` }"
        @mousedown.stop
      >
        <button
          type="button"
          class="kortex-block-handle"
          title="Arrastar bloco"
          draggable="true"
          @dragstart="onBlockDragStart"
          @dragend="onBlockDragEnd"
        >
          <UIcon name="i-lucide-grip-vertical" class="size-4" />
        </button>
        <button
          type="button"
          class="kortex-menu-btn"
          title="Mover para cima"
          :disabled="activeBlock?.index === 0"
          @click="moveActiveBlock(-1)"
        >
          <UIcon name="i-lucide-arrow-up" class="size-3.5" />
        </button>
        <button
          type="button"
          class="kortex-menu-btn"
          title="Mover para baixo"
          :disabled="activeBlock?.index === getTopLevelBlocks().length - 1"
          @click="moveActiveBlock(1)"
        >
          <UIcon name="i-lucide-arrow-down" class="size-3.5" />
        </button>
        <div class="kortex-menu-sep kortex-menu-sep--vertical" />
        <button
          type="button"
          class="kortex-menu-btn kortex-menu-btn--text"
          title="Texto"
          @click="turnActiveBlockInto('paragraph')"
        >
          T
        </button>
        <button
          type="button"
          class="kortex-menu-btn kortex-menu-btn--text"
          title="Titulo 1"
          @click="turnActiveBlockInto('heading1')"
        >
          H1
        </button>
        <button
          type="button"
          class="kortex-menu-btn"
          title="Lista"
          @click="turnActiveBlockInto('bulletList')"
        >
          <UIcon name="i-lucide-list" class="size-3.5" />
        </button>
        <button
          type="button"
          class="kortex-menu-btn"
          title="Tarefa"
          @click="turnActiveBlockInto('taskList')"
        >
          <UIcon name="i-lucide-list-checks" class="size-3.5" />
        </button>
        <div class="kortex-menu-sep kortex-menu-sep--vertical" />
        <button
          type="button"
          class="kortex-menu-btn"
          title="Duplicar bloco"
          @click="duplicateActiveBlock"
        >
          <UIcon name="i-lucide-copy-plus" class="size-3.5" />
        </button>
        <button
          type="button"
          class="kortex-menu-btn"
          title="Copiar texto do bloco"
          @click="copyActiveBlockText"
        >
          <UIcon name="i-lucide-copy" class="size-3.5" />
        </button>
        <button
          type="button"
          class="kortex-menu-btn kortex-menu-btn--danger"
          title="Apagar bloco"
          @click="deleteActiveBlock"
        >
          <UIcon name="i-lucide-trash-2" class="size-3.5" />
        </button>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="mentionVisible"
        class="kortex-mention-menu"
        :style="{ top: `${mentionPos.y}px`, left: `${mentionPos.x}px` }"
        @mousedown.prevent
      >
        <input
          ref="mentionInputRef"
          v-model="mentionQuery"
          class="kortex-mention-input"
          placeholder="@mencao"
          @keydown.escape.prevent="closeMentionMenu"
          @keydown.enter.prevent="insertMention(filteredMentionItems[0])"
        >

        <template v-if="filteredMentionItems.length">
          <button
            v-for="item in filteredMentionItems"
            :key="item.id"
            type="button"
            class="kortex-mention-item"
            @click="insertMention(item)"
          >
            <span class="kortex-mention-avatar">
              {{ item.label.slice(0, 1).toUpperCase() }}
            </span>
            <span class="kortex-mention-copy">
              <span>{{ item.label }}</span>
              <small v-if="item.description">{{ item.description }}</small>
            </span>
          </button>
        </template>

        <button
          v-else-if="mentionQuery.trim()"
          type="button"
          class="kortex-mention-item"
          @click="insertMention()"
        >
          <span class="kortex-mention-avatar">@</span>
          <span class="kortex-mention-copy">
            <span>{{ mentionQuery.trim() }}</span>
            <small>Mencao manual</small>
          </span>
        </button>

        <p
          v-else
          class="kortex-menu-empty"
        >
          Digite uma mencao
        </p>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="emojiVisible"
        class="kortex-emoji-menu"
        :style="{ top: `${emojiPos.y}px`, left: `${emojiPos.x}px` }"
        @mousedown.prevent
      >
        <button
          v-for="item in emojiItems"
          :key="item.name"
          type="button"
          class="kortex-emoji-item"
          :title="item.label"
          @click="insertEmoji(item)"
        >
          <span>{{ item.emoji }}</span>
        </button>
      </div>
    </Teleport>

    <TiptapTableBar
      ref="tableBarRef"
      :editor="editor"
    />

    <Teleport to="body">
      <div
        v-if="slashVisible && slashItems.length > 0"
        ref="slashMenuRef"
        class="kortex-slash-menu"
        :style="{ top: `${slashPos.y}px`, left: `${slashPos.x}px` }"
      >
        <p class="kortex-menu-label">
          Blocos basicos
        </p>
        <button
          v-for="(item, index) in slashItems"
          :key="item.title"
          type="button"
          :class="['kortex-command-item', { selected: index === slashIndex }]"
          @mouseenter="slashIndex = index"
          @click="selectSlashCommand(item)"
        >
          <span class="kortex-command-icon">
            <UIcon :name="item.icon" class="size-4" />
          </span>
          <span class="kortex-command-text">
            <span class="kortex-command-title">{{ item.title }}</span>
            <span class="kortex-command-desc">{{ item.description }}</span>
          </span>
        </button>
      </div>
    </Teleport>

    <Teleport to="body">
      <div
        v-if="wikiVisible && enableWikilinks"
        ref="wikiMenuRef"
        class="kortex-wiki-menu"
        :style="{ top: `${wikiPos.y}px`, left: `${wikiPos.x}px` }"
      >
        <p class="kortex-menu-label">
          Notas
        </p>
        <template v-if="wikiItems.length">
          <button
            v-for="(item, index) in wikiItems"
            :key="item.id"
            type="button"
            :class="['kortex-wiki-item', { selected: index === wikiIndex }]"
            @mouseenter="wikiIndex = index"
            @click="selectWikiItem(item)"
          >
            <UIcon name="i-lucide-file-text" class="size-3.5 shrink-0 text-muted" />
            <span class="truncate">{{ item.title }}</span>
          </button>
        </template>
        <p v-else class="kortex-menu-empty">
          Nenhuma nota encontrada
        </p>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.kortex-editor {
  position: relative;
  width: 100%;
}

.kortex-editor-shell {
  position: relative;
  min-height: var(--kortex-editor-min-height, 8rem);
}

.kortex-editor--boxed .kortex-editor-shell {
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius, 0.375rem);
  padding: 0.625rem 0.875rem;
  background: var(--ui-bg);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.kortex-editor--plain .kortex-editor-shell {
  padding: 0;
  background: transparent;
}

.kortex-editor--boxed .kortex-editor-shell:focus-within {
  border-color: var(--ui-color-primary, #18b981);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--ui-color-primary, #18b981) 15%, transparent);
}

.kortex-bubble,
.kortex-block-menu {
  position: fixed;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 1px;
  padding: 3px 4px;
  border-radius: 8px;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.08);
  white-space: nowrap;
}

.kortex-bubble {
  transform: translateX(-50%) translateY(calc(-100% - 8px));
}

.kortex-block-menu {
  transform: translateX(-100%);
}

.kortex-menu-btn,
.kortex-block-handle {
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
  transition: background 0.1s, color 0.1s, opacity 0.1s;
}

.kortex-menu-btn--text {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0;
}

.kortex-menu-btn:hover,
.kortex-block-handle:hover {
  background: var(--ui-bg-muted);
  color: var(--ui-text-highlighted);
}

.kortex-menu-btn.active {
  background: var(--ui-bg-elevated);
  color: var(--ui-color-primary, #18b981);
}

.kortex-menu-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.kortex-menu-btn--danger:hover {
  background: color-mix(in srgb, var(--ui-color-error, #ef4444) 10%, transparent);
  color: var(--ui-color-error, #ef4444);
}

.kortex-menu-sep {
  width: 1px;
  height: 16px;
  background: var(--ui-border);
  margin: 0 2px;
  flex-shrink: 0;
}

.kortex-menu-sep--vertical {
  margin: 0 1px;
}

.kortex-slash-menu,
.kortex-wiki-menu,
.kortex-mention-menu,
.kortex-emoji-menu {
  position: fixed;
  z-index: 9999;
  overflow-y: auto;
  border-radius: 8px;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 6px;
}

.kortex-slash-menu {
  width: 272px;
  max-height: 360px;
}

.kortex-wiki-menu {
  width: 240px;
  max-height: 260px;
}

.kortex-mention-menu {
  width: 260px;
  max-height: 300px;
}

.kortex-emoji-menu {
  display: grid;
  grid-template-columns: repeat(4, 36px);
  gap: 4px;
}

.kortex-upload-status {
  position: absolute;
  right: 0.75rem;
  top: 0.625rem;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  border: 1px solid var(--ui-border);
  border-radius: 999px;
  background: var(--ui-bg);
  color: var(--ui-text-muted);
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  pointer-events: none;
}

.kortex-menu-label {
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--ui-text-dimmed);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 4px 8px 6px;
  margin: 0;
}

.kortex-command-item,
.kortex-wiki-item {
  display: flex;
  align-items: center;
  width: 100%;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--ui-text-highlighted);
  cursor: pointer;
  text-align: left;
  transition: background 0.08s;
}

.kortex-command-item {
  gap: 10px;
  padding: 5px 6px;
}

.kortex-wiki-item {
  gap: 8px;
  padding: 5px 8px;
  font-size: 0.8125rem;
  min-width: 0;
}

.kortex-command-item:hover,
.kortex-command-item.selected,
.kortex-wiki-item:hover,
.kortex-wiki-item.selected {
  background: var(--ui-bg-muted);
}

.kortex-command-icon {
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

.kortex-command-item.selected .kortex-command-icon,
.kortex-command-item:hover .kortex-command-icon {
  background: var(--ui-bg);
  color: var(--ui-text-highlighted);
}

.kortex-command-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.kortex-command-title {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--ui-text-highlighted);
  line-height: 1.3;
}

.kortex-command-desc {
  font-size: 0.75rem;
  color: var(--ui-text-muted);
  line-height: 1.3;
}

.kortex-menu-empty {
  padding: 8px;
  font-size: 0.8125rem;
  color: var(--ui-text-muted);
  text-align: center;
  margin: 0;
}

.kortex-mention-input {
  width: 100%;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  background: var(--ui-bg-muted);
  color: var(--ui-text-highlighted);
  font-size: 0.8125rem;
  outline: none;
  padding: 0.45rem 0.55rem;
  margin-bottom: 0.35rem;
}

.kortex-mention-input:focus {
  border-color: var(--ui-color-primary, #18b981);
}

.kortex-mention-item {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  width: 100%;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-highlighted);
  padding: 0.4rem 0.45rem;
  text-align: left;
  cursor: pointer;
}

.kortex-mention-item:hover {
  background: var(--ui-bg-muted);
}

.kortex-mention-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.55rem;
  height: 1.55rem;
  border-radius: 999px;
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  color: var(--ui-text-muted);
  font-size: 0.75rem;
  font-weight: 700;
  flex-shrink: 0;
}

.kortex-mention-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.05rem;
  font-size: 0.8125rem;
}

.kortex-mention-copy span,
.kortex-mention-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kortex-mention-copy small {
  color: var(--ui-text-muted);
  font-size: 0.7rem;
}

.kortex-emoji-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 1.2rem;
}

.kortex-emoji-item:hover {
  background: var(--ui-bg-muted);
}
</style>

<style>
.kortex-editor-content .tiptap {
  outline: none;
  min-height: var(--kortex-editor-min-height, 8rem);
  font-family: inherit;
  font-size: 0.96rem;
  line-height: 1.78;
  color: var(--ui-text-highlighted) !important;
  background: transparent !important;
  caret-color: var(--ui-color-primary, #18b981);
}

.kortex-editor-content .tiptap p {
  margin: 0;
  color: var(--ui-text-highlighted) !important;
}

.kortex-editor-content .tiptap > * + * {
  margin-top: 0.28rem;
}

.kortex-editor-content .tiptap h1,
.kortex-editor-content .tiptap h2,
.kortex-editor-content .tiptap h3 {
  color: var(--ui-text-highlighted) !important;
  letter-spacing: 0;
}

.kortex-editor-content .tiptap h1 {
  font-size: 1.875rem;
  font-weight: 700;
  line-height: 1.25;
  margin: 1rem 0 0.25rem;
}

.kortex-editor-content .tiptap h2 {
  font-size: 1.375rem;
  font-weight: 650;
  line-height: 1.3;
  margin: 0.75rem 0 0.2rem;
}

.kortex-editor-content .tiptap h3 {
  font-size: 1.125rem;
  font-weight: 650;
  line-height: 1.4;
  margin: 0.5rem 0 0.15rem;
}

.kortex-editor-content .tiptap ul {
  list-style-type: disc;
  padding-left: 1.5rem;
  margin: 0.1rem 0;
  color: var(--ui-text-highlighted) !important;
}

.kortex-editor-content .tiptap ol {
  list-style-type: decimal;
  padding-left: 1.5rem;
  margin: 0.1rem 0;
  color: var(--ui-text-highlighted) !important;
}

.kortex-editor-content .tiptap ul ul {
  list-style-type: circle;
}

.kortex-editor-content .tiptap ul ul ul {
  list-style-type: square;
}

.kortex-editor-content .tiptap li {
  margin: 0.1rem 0;
  display: list-item;
}

.kortex-editor-content .tiptap li p {
  margin: 0;
}

.kortex-editor-content .tiptap ul[data-type="taskList"] {
  padding-left: 0.25rem;
  list-style: none;
}

.kortex-editor-content .tiptap ul[data-type="taskList"] li {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.kortex-editor-content .tiptap ul[data-type="taskList"] li > label {
  flex-shrink: 0;
  user-select: none;
  padding-top: 0.25rem;
}

.kortex-editor-content .tiptap ul[data-type="taskList"] li > label input[type="checkbox"] {
  cursor: pointer;
  accent-color: var(--ui-color-primary, #18b981);
  width: 15px;
  height: 15px;
}

.kortex-editor-content .tiptap ul[data-type="taskList"] li > div {
  flex: 1;
}

.kortex-editor-content .tiptap ul[data-type="taskList"] li[data-checked="true"] > div {
  text-decoration: line-through;
  opacity: 0.5;
}

.kortex-editor-content .tiptap blockquote {
  border-left: 3px solid var(--ui-color-primary, #18b981);
  padding: 0.25rem 0 0.25rem 0.875rem;
  margin: 0.5rem 0;
  color: var(--ui-text-muted) !important;
  font-style: italic;
  background: color-mix(in srgb, var(--ui-color-primary, #18b981) 5%, transparent);
  border-radius: 0 4px 4px 0;
}

.kortex-editor-content .tiptap blockquote p {
  margin: 0;
  color: var(--ui-text-muted) !important;
}

.kortex-editor-content .tiptap code {
  font-family: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
  background: color-mix(in srgb, var(--ui-color-primary, #18b981) 10%, var(--ui-bg-muted));
  border: 1px solid color-mix(in srgb, var(--ui-color-primary, #18b981) 20%, var(--ui-border));
  border-radius: 4px;
  padding: 0.1em 0.35em;
  font-size: 0.85em;
  color: var(--ui-color-primary, #18b981) !important;
}

.kortex-editor-content .tiptap pre {
  background: var(--ui-bg-muted);
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 1rem 1.25rem;
  margin: 0.5rem 0;
  overflow-x: auto;
}

.kortex-editor-content .tiptap pre code {
  background: transparent !important;
  border: none !important;
  padding: 0;
  font-size: 0.875rem;
  line-height: 1.6;
  color: var(--ui-text-highlighted) !important;
}

.kortex-editor-content .tiptap hr {
  border: none;
  border-top: 1px solid var(--ui-border);
  margin: 0.75rem 0;
}

.kortex-editor-content .tiptap a {
  color: var(--ui-color-primary, #18b981) !important;
  text-decoration: underline;
  text-underline-offset: 2px;
  text-decoration-thickness: 1px;
  cursor: pointer;
}

.kortex-editor-content .tiptap a:hover {
  opacity: 0.8;
}

.kortex-editor-content .tiptap .wikilink-node {
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

.kortex-editor-content .tiptap .wikilink-node:hover {
  background: color-mix(in srgb, var(--ui-color-primary, #18b981) 20%, transparent);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.kortex-editor-content .tiptap [data-type="callout"] {
  display: grid;
  grid-template-columns: 1.6rem minmax(0, 1fr);
  gap: 0.65rem;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--ui-color-primary, #18b981) 6%, var(--ui-bg));
  padding: 0.7rem 0.8rem;
  margin: 0.55rem 0;
}

.kortex-editor-content .tiptap [data-callout-icon] {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 0.1rem;
  line-height: 1.4;
}

.kortex-editor-content .tiptap [data-callout-content] {
  min-width: 0;
}

.kortex-editor-content .tiptap [data-callout-content] > *:first-child {
  margin-top: 0;
}

.kortex-editor-content .tiptap [data-callout-content] > *:last-child {
  margin-bottom: 0;
}

.kortex-editor-content .tiptap [data-type="editor-image"] {
  margin: 0.8rem 0;
}

.kortex-editor-content .tiptap [data-type="editor-image"] img {
  display: block;
  width: 100%;
  max-height: 520px;
  object-fit: contain;
  border-radius: 8px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-muted);
}

.kortex-editor-content .tiptap [data-type="editor-image"] figcaption {
  margin-top: 0.35rem;
  color: var(--ui-text-muted);
  font-size: 0.78rem;
  text-align: center;
}

.kortex-editor-content .tiptap [data-type="editor-file"] {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg-muted);
  color: var(--ui-text-highlighted) !important;
  padding: 0.65rem 0.75rem;
  margin: 0.55rem 0;
  text-decoration: none;
}

.kortex-editor-content .tiptap [data-type="editor-file"]:hover {
  background: var(--ui-bg-elevated);
  opacity: 1;
}

.kortex-editor-content .tiptap [data-file-icon] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2rem;
  height: 2rem;
  border-radius: 6px;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  color: var(--ui-text-muted);
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  flex-shrink: 0;
}

.kortex-editor-content .tiptap [data-file-name] {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kortex-editor-content .tiptap .mention-node {
  color: var(--ui-color-primary, #18b981);
  background: color-mix(in srgb, var(--ui-color-primary, #18b981) 10%, transparent);
  border-radius: 999px;
  padding: 0.05em 0.4em;
  font-weight: 500;
  white-space: nowrap;
}

.kortex-editor-content .tiptap .emoji-node {
  display: inline-block;
  transform: translateY(0.05em);
}

.kortex-editor-content .tiptap .ProseMirror-selectednode[data-type="editor-image"] img,
.kortex-editor-content .tiptap .ProseMirror-selectednode[data-type="editor-file"] {
  outline: 2px solid color-mix(in srgb, var(--ui-color-primary, #18b981) 45%, transparent);
  outline-offset: 2px;
}

.kortex-editor-content .tiptap p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: var(--ui-text-dimmed) !important;
  pointer-events: none;
  float: left;
  height: 0;
  font-style: normal;
}

.kortex-editor-content .tiptap strong {
  font-weight: 700;
  color: var(--ui-text-highlighted) !important;
}

.kortex-editor-content .tiptap em {
  font-style: italic;
}

.kortex-editor-content .tiptap u {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.kortex-editor-content .tiptap s {
  text-decoration: line-through;
  opacity: 0.7;
}

.kortex-editor-content .tiptap[contenteditable="false"] {
  cursor: default;
  user-select: text;
}

.kortex-editor-content .tiptap .tableWrapper {
  overflow-x: auto;
}

.kortex-editor-content .tiptap table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.75rem 0;
  table-layout: fixed;
}

.kortex-editor-content .tiptap table td,
.kortex-editor-content .tiptap table th {
  border: 1px solid var(--ui-border);
  padding: 0.4rem 0.65rem;
  min-width: 60px;
  vertical-align: top;
  position: relative;
  color: var(--ui-text-highlighted) !important;
}

.kortex-editor-content .tiptap table th {
  font-weight: 600;
  background: var(--ui-bg-muted);
}

.kortex-editor-content .tiptap table .selectedCell {
  background: color-mix(in srgb, var(--ui-color-primary, #18b981) 10%, transparent) !important;
}

.kortex-editor-content .tiptap table .column-resize-handle {
  position: absolute;
  right: -2px;
  top: 0;
  bottom: 0;
  width: 4px;
  background: var(--ui-color-primary, #18b981);
  pointer-events: none;
}

.kortex-editor-content .tiptap .resize-cursor {
  cursor: col-resize;
}
</style>
