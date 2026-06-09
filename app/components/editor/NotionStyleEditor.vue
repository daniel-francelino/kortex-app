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
  extractEditorAttachmentRefs,
  isEditorContentEmpty,
  normalizeEditorContent,
  serializeEditorContent
} from '~/utils/editor/content'
import type { EditorAttachmentRef } from '~/utils/editor/content'

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

interface EditorUploadLimits {
  imageMaxBytes?: number
  fileMaxBytes?: number
}

interface EditorUploadTask {
  id: string
  file: File
  kind: EditorUploadKind
  name: string
  progress: number
  status: 'uploading' | 'done' | 'error' | 'canceled'
  error?: string
  xhr?: XMLHttpRequest
}

interface LinkPreviewResponse {
  url: string
  title: string
  description: string
  image: string
  siteName: string
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
  uploadCleanupEndpoint?: string
  linkPreviewEndpoint?: string
  uploadLimits?: EditorUploadLimits
  attachmentCleanupDelayMs?: number
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
  uploadEndpoint: '/api/editor/uploads',
  uploadCleanupEndpoint: '/api/editor/uploads/delete',
  linkPreviewEndpoint: '/api/editor/link-preview',
  uploadLimits: () => ({
    imageMaxBytes: 0,
    fileMaxBytes: 0
  }),
  attachmentCleanupDelayMs: 30_000
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
const uploadTasks = ref<EditorUploadTask[]>([])
let lastAttachmentRefs = new Map<string, EditorAttachmentRef>()
const pendingAttachmentCleanups = new Map<string, {
  ref: EditorAttachmentRef
  timer: ReturnType<typeof setTimeout>
}>()

const bubbleVisible = ref(false)
const bubblePos = ref({ x: 0, y: 0 })

const slashVisible = ref(false)
const slashItems = ref<NotionCommandItem[]>([])
const slashIndex = ref(0)
const slashPos = ref({ x: 0, y: 0 })
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
const mentionMenuRef = ref<{ focus: () => void } | null>(null)

const emojiVisible = ref(false)
const emojiPos = ref({ x: 0, y: 0 })
const emojiInsertPos = ref(0)

const linkPreviewVisible = ref(false)
const linkPreviewUrl = ref('')
const linkPreviewPos = ref({ x: 0, y: 0 })
const linkPreviewInsertPos = ref(0)
const linkPreviewLoading = ref(false)
const linkPreviewError = ref('')
const linkPreviewInputRef = ref<HTMLInputElement | null>(null)

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
    openEmoji: openEmojiMenu,
    openLinkPreview: openLinkPreviewMenu
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
    lastAttachmentRefs = attachmentRefsToMap(extractEditorAttachmentRefs(instance.getJSON()))
    emit('ready', instance)
    nextTick(() => {
      updateBlockTools()
      updateWikilinkSuggestion()
    })
  },
  onUpdate({ editor: instance }) {
    const value = serializeEditorContent(instance.getJSON())
    reconcileAttachmentRefs(extractEditorAttachmentRefs(instance.getJSON()))
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
      if (!document.querySelector('.kortex-bubble:hover')) bubbleVisible.value = false
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
    linkPreviewVisible.value = false
    blockVisible.value = false
  }
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
  for (const cleanup of pendingAttachmentCleanups.values()) {
    clearTimeout(cleanup.timer)
    void cleanupAttachments([cleanup.ref])
  }
  uploadTasks.value.forEach(task => task.xhr?.abort())
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
  if (!files.length) return

  for (const file of files) {
    const kind = forcedKind ?? (file.type.startsWith('image/') ? 'image' : 'file')
    const task = createUploadTask(file, kind)
    uploadTasks.value.unshift(task)
    void runUploadTask(task)
  }
}

function createUploadTask(file: File, kind: EditorUploadKind): EditorUploadTask {
  const limit = getUploadLimit(kind)
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`

  return {
    id,
    file,
    kind,
    name: file.name,
    progress: 0,
    status: limit > 0 && file.size > limit ? 'error' : 'uploading',
    error: limit > 0 && file.size > limit ? `Limite: ${formatBytes(limit)}` : undefined
  }
}

async function runUploadTask(task: EditorUploadTask) {
  if (task.status === 'error') return

  try {
    const uploaded = await uploadEditorFile(task)
    task.status = 'done'
    task.progress = 100
    insertUploadedFile(uploaded)
    setTimeout(() => dismissUploadTask(task.id), 2500)
  } catch (error) {
    if (task.status === 'canceled') return
    task.status = 'error'
    task.error = error instanceof Error ? error.message : 'Nao foi possivel enviar.'
  }
}

function uploadEditorFile(task: EditorUploadTask) {
  return new Promise<EditorUploadResponse>((resolve, reject) => {
    const form = new FormData()
    form.append('file', task.file)
    form.append('kind', task.kind)

    const xhr = new XMLHttpRequest()
    task.xhr = xhr

    xhr.open('POST', props.uploadEndpoint)
    xhr.responseType = 'json'

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      task.progress = Math.max(1, Math.round((event.loaded / event.total) * 100))
    }

    xhr.onload = () => {
      task.xhr = undefined
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr.response as EditorUploadResponse)
        return
      }

      reject(new Error(getUploadErrorMessage(xhr)))
    }

    xhr.onerror = () => {
      task.xhr = undefined
      reject(new Error('Falha de rede durante upload.'))
    }

    xhr.onabort = () => {
      task.xhr = undefined
      task.status = 'canceled'
      reject(new Error('Upload cancelado.'))
    }

    xhr.send(form)
  })
}

function cancelUploadTask(id: string) {
  const task = uploadTasks.value.find(item => item.id === id)
  if (!task) return
  task.status = 'canceled'
  task.xhr?.abort()
}

function retryUploadTask(id: string) {
  const task = uploadTasks.value.find(item => item.id === id)
  if (!task) return

  task.status = 'uploading'
  task.progress = 0
  task.error = undefined
  void runUploadTask(task)
}

function dismissUploadTask(id: string) {
  uploadTasks.value = uploadTasks.value.filter(task => task.id !== id)
}

function getUploadLimit(kind: EditorUploadKind) {
  return kind === 'image'
    ? props.uploadLimits.imageMaxBytes ?? 0
    : props.uploadLimits.fileMaxBytes ?? 0
}

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`
  return `${Math.round(value / (1024 * 1024))} MB`
}

function getUploadErrorMessage(xhr: XMLHttpRequest) {
  const response = xhr.response as { statusMessage?: string, message?: string } | null
  return response?.statusMessage || response?.message || 'Nao foi possivel enviar.'
}

function insertUploadedFile(uploaded: EditorUploadResponse) {
  const instance = editor.value
  if (!instance) return

  const attrs = {
    src: uploaded.url,
    href: uploaded.url,
    name: uploaded.name,
    alt: uploaded.name,
    caption: '',
    width: '100%',
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

function attachmentRefsToMap(refs: EditorAttachmentRef[]) {
  return new Map(refs.map(ref => [attachmentRefKey(ref), ref]))
}

function attachmentRefKey(ref: EditorAttachmentRef) {
  return `${ref.bucket}:${ref.path}`
}

function reconcileAttachmentRefs(nextRefs: EditorAttachmentRef[]) {
  const next = attachmentRefsToMap(nextRefs)

  for (const [key, cleanup] of pendingAttachmentCleanups) {
    if (!next.has(key)) continue
    clearTimeout(cleanup.timer)
    pendingAttachmentCleanups.delete(key)
  }

  for (const [key, ref] of lastAttachmentRefs) {
    if (next.has(key) || pendingAttachmentCleanups.has(key)) continue

    const timer = setTimeout(() => {
      pendingAttachmentCleanups.delete(key)
      if (lastAttachmentRefs.has(key)) return
      void cleanupAttachments([ref])
    }, props.attachmentCleanupDelayMs)

    pendingAttachmentCleanups.set(key, { ref, timer })
  }

  lastAttachmentRefs = next
}

async function cleanupAttachments(refs: EditorAttachmentRef[]) {
  if (!refs.length) return

  try {
    await $fetch(props.uploadCleanupEndpoint, {
      method: 'POST',
      body: {
        files: refs.map(ref => ({
          bucket: ref.bucket,
          path: ref.path
        }))
      }
    })
  } catch {
    toast.add({
      title: 'Limpeza pendente',
      description: 'Nao foi possivel remover anexos orfaos agora.',
      color: 'warning'
    })
  }
}

function openLinkPreviewMenu() {
  const instance = editor.value
  if (!instance) return

  linkPreviewUrl.value = ''
  linkPreviewError.value = ''
  linkPreviewInsertPos.value = instance.state.selection.from

  try {
    const rect = instance.view.coordsAtPos(linkPreviewInsertPos.value)
    linkPreviewPos.value = { x: rect.left, y: rect.bottom + 6 }
  } catch {
    linkPreviewPos.value = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  }

  linkPreviewVisible.value = true
  mentionVisible.value = false
  emojiVisible.value = false
  nextTick(() => linkPreviewInputRef.value?.focus())
}

async function insertLinkPreview() {
  const instance = editor.value
  const url = linkPreviewUrl.value.trim()
  if (!instance || !url || linkPreviewLoading.value) return

  linkPreviewLoading.value = true
  linkPreviewError.value = ''

  try {
    const preview = await $fetch<LinkPreviewResponse>(props.linkPreviewEndpoint, {
      query: { url }
    })

    instance
      .chain()
      .focus()
      .insertContentAt(linkPreviewInsertPos.value, {
        type: 'linkPreview',
        attrs: preview
      })
      .run()

    linkPreviewVisible.value = false
  } catch {
    linkPreviewError.value = 'Nao foi possivel gerar o preview.'
  } finally {
    linkPreviewLoading.value = false
  }
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
  linkPreviewVisible.value = false
  nextTick(() => mentionMenuRef.value?.focus())
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
  linkPreviewVisible.value = false
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

function copyActiveBlockLink() {
  const blockId = activeBlock.value?.node?.attrs.blockId
  if (!blockId) return

  const url = new URL(window.location.href)
  url.hash = `block-${blockId}`
  void navigator.clipboard?.writeText(url.href)
  toast.add({
    title: 'Link copiado',
    description: 'Referencia direta do bloco copiada.',
    color: 'success'
  })
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
      <EditorUploadPanel
        :tasks="uploadTasks"
        @cancel="cancelUploadTask"
        @retry="retryUploadTask"
        @dismiss="dismissUploadTask"
      />
      <EditorContent
        :editor="editor"
        class="kortex-editor-content"
      />
    </div>

    <EditorBubbleMenu
      :editor="editor"
      :visible="bubbleVisible && editable"
      :pos="bubblePos"
    />

    <EditorBlockMenu
      :visible="blockVisible && editable"
      :pos="blockPos"
      :active-index="activeBlock?.index ?? null"
      :block-count="getTopLevelBlocks().length"
      @move="moveActiveBlock"
      @transform="turnActiveBlockInto"
      @duplicate="duplicateActiveBlock"
      @copy-link="copyActiveBlockLink"
      @copy-text="copyActiveBlockText"
      @delete="deleteActiveBlock"
      @dragstart="onBlockDragStart"
      @dragend="onBlockDragEnd"
    />

    <EditorMentionMenu
      ref="mentionMenuRef"
      :visible="mentionVisible"
      :query="mentionQuery"
      :items="filteredMentionItems"
      :pos="mentionPos"
      @update:query="mentionQuery = $event"
      @select="insertMention"
      @close="closeMentionMenu"
    />

    <EditorEmojiMenu
      :visible="emojiVisible"
      :items="emojiItems"
      :pos="emojiPos"
      @select="insertEmoji"
    />

    <Teleport to="body">
      <form
        v-if="linkPreviewVisible"
        class="kortex-link-preview-menu"
        :style="{ top: `${linkPreviewPos.y}px`, left: `${linkPreviewPos.x}px` }"
        @submit.prevent="insertLinkPreview"
        @mousedown.stop
      >
        <input
          ref="linkPreviewInputRef"
          v-model="linkPreviewUrl"
          class="kortex-link-preview-input"
          placeholder="https://..."
          @keydown.escape.prevent="linkPreviewVisible = false"
        >
        <button
          type="submit"
          class="kortex-link-preview-submit"
          :disabled="linkPreviewLoading || !linkPreviewUrl.trim()"
        >
          <UIcon
            :name="linkPreviewLoading ? 'i-lucide-loader-circle' : 'i-lucide-check'"
            :class="['size-3.5', { 'animate-spin': linkPreviewLoading }]"
          />
        </button>
        <p
          v-if="linkPreviewError"
          class="kortex-link-preview-error"
        >
          {{ linkPreviewError }}
        </p>
      </form>
    </Teleport>

    <TiptapTableBar
      ref="tableBarRef"
      :editor="editor"
    />

    <EditorSlashMenu
      :visible="slashVisible"
      :items="slashItems"
      :selected-index="slashIndex"
      :pos="slashPos"
      @hover="slashIndex = $event"
      @select="selectSlashCommand"
    />

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
.kortex-emoji-menu,
.kortex-link-preview-menu {
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

.kortex-upload-panel {
  position: absolute;
  right: 0.75rem;
  top: 0.625rem;
  z-index: 2;
  width: min(320px, calc(100% - 1.5rem));
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  pointer-events: auto;
}

.kortex-upload-task {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg);
  color: var(--ui-text-muted);
  padding: 0.45rem 0.5rem;
  font-size: 0.75rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.kortex-upload-task-row {
  display: inline-flex;
  align-items: center;
  width: 100%;
  gap: 0.4rem;
}

.kortex-upload-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kortex-upload-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.35rem;
  height: 1.35rem;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
}

.kortex-upload-action:hover {
  background: var(--ui-bg-muted);
  color: var(--ui-text-highlighted);
}

.kortex-upload-progress {
  height: 3px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--ui-bg-muted);
  margin-top: 0.4rem;
}

.kortex-upload-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--ui-color-primary, #18b981);
}

.kortex-upload-error {
  margin: 0.35rem 0 0;
  color: var(--ui-color-error, #ef4444);
  line-height: 1.35;
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

.kortex-link-preview-menu {
  display: grid;
  width: 300px;
  grid-template-columns: 1fr 2rem;
  gap: 0.4rem;
}

.kortex-link-preview-input {
  min-width: 0;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  background: var(--ui-bg-muted);
  color: var(--ui-text-highlighted);
  font-size: 0.8125rem;
  outline: none;
  padding: 0.45rem 0.55rem;
}

.kortex-link-preview-input:focus {
  border-color: var(--ui-color-primary, #18b981);
}

.kortex-link-preview-submit {
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: var(--ui-color-primary, #18b981);
  color: white;
  cursor: pointer;
}

.kortex-link-preview-submit:disabled {
  cursor: default;
  opacity: 0.55;
}

.kortex-link-preview-error {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--ui-color-error, #ef4444);
  font-size: 0.75rem;
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

.kortex-editor-content .tiptap .editor-image-node {
  width: var(--editor-image-width, 100%);
  max-width: 100%;
}

.kortex-editor-content .tiptap .editor-image-frame {
  position: relative;
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

.kortex-editor-content .tiptap .editor-image-controls {
  position: absolute;
  right: 0.5rem;
  top: 0.5rem;
  display: flex;
  gap: 0.2rem;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  background: var(--ui-bg);
  padding: 0.2rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.kortex-editor-content .tiptap .editor-image-controls button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.7rem;
  height: 1.5rem;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  font-size: 0.65rem;
  font-weight: 700;
}

.kortex-editor-content .tiptap .editor-image-controls button:hover,
.kortex-editor-content .tiptap .editor-image-controls button.active {
  background: var(--ui-bg-muted);
  color: var(--ui-text-highlighted);
}

.kortex-editor-content .tiptap .editor-image-caption-input {
  display: block;
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  color: var(--ui-text-muted);
  font-size: 0.78rem;
  text-align: center;
  padding: 0.35rem 0.25rem 0;
}

.kortex-editor-content .tiptap .editor-image-error {
  margin: 0.35rem 0 0;
  color: var(--ui-color-error, #ef4444);
  font-size: 0.75rem;
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

.kortex-editor-content .tiptap [data-type="link-preview"] {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr);
  gap: 0.75rem;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg-muted);
  color: var(--ui-text-highlighted) !important;
  padding: 0.65rem;
  margin: 0.65rem 0;
  text-decoration: none;
}

.kortex-editor-content .tiptap [data-type="link-preview"]:hover {
  background: var(--ui-bg-elevated);
  opacity: 1;
}

.kortex-editor-content .tiptap [data-type="link-preview"] img,
.kortex-editor-content .tiptap [data-link-preview-icon] {
  width: 92px;
  height: 64px;
  border-radius: 6px;
  object-fit: cover;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
}

.kortex-editor-content .tiptap [data-link-preview-icon] {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-text-muted);
  font-size: 0.65rem;
  font-weight: 700;
}

.kortex-editor-content .tiptap [data-link-preview-body] {
  display: flex;
  min-width: 0;
  flex-direction: column;
  justify-content: center;
  gap: 0.2rem;
}

.kortex-editor-content .tiptap [data-link-preview-body] strong,
.kortex-editor-content .tiptap [data-link-preview-body] small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kortex-editor-content .tiptap [data-link-preview-body] small {
  color: var(--ui-text-muted);
  font-size: 0.75rem;
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
