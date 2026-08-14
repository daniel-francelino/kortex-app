<script setup lang="ts">
import type { CreateNoteSharePayload, Note, NoteDetail, NoteFolder, NoteShare, UpdateNotePayload, UpdateNoteSharePayload } from '~/types/notes'
import { NOTE_TYPE_META, NoteType, NoteVisibility } from '~/types/notes'

interface NotionStyleEditorRef {
  focus: () => void
  setContent: (value?: string | null) => void
  getContent: () => string
  clearContent: () => void
  insertWikilink: (noteId: string, title: string) => void
}

type SaveStatus = 'idle' | 'unsaved' | 'saved' | 'offline-pending' | 'error'

type OutlineItem = { level: number, text: string, blockId: string }

const props = defineProps<{
  noteId: string | null
  note: NoteDetail | null
  loading: boolean
  folders: NoteFolder[]
  availableNotes: Note[]
  isOnline: boolean
  outline: OutlineItem[]
  updateNote: (id: string, payload: UpdateNotePayload, options?: { silent?: boolean }) => Promise<Note | null>
  deleteNote: (id: string) => Promise<boolean>
  linkNotes: (sourceId: string, targetId: string) => Promise<NoteDetail | null>
  unlinkNotes: (sourceId: string, linkId: string) => Promise<NoteDetail | null>
  setNoteVisibility: (noteId: string, visibility: NoteVisibility) => Promise<boolean>
  regenerateShareLink: (noteId: string) => Promise<Note | null>
  fetchNoteShares: (noteId: string) => Promise<NoteShare[]>
  addNoteShare: (noteId: string, payload: CreateNoteSharePayload) => Promise<NoteShare | null>
  updateNoteShare: (noteId: string, shareId: string, payload: UpdateNoteSharePayload) => Promise<NoteShare | null>
  removeNoteShare: (noteId: string, shareId: string) => Promise<boolean>
  canGoBack: boolean
  canGoForward: boolean
}>()

const emit = defineEmits<{
  'updated': []
  'deleted': []
  'go-back': []
  'go-forward': []
  'navigate-note': [noteId: string]
  'navigate-to-folder': [folderId: string]
  'note-loaded': [note: NoteDetail | null]
  'content-change': [content: string]
  'open-panel': [view: 'outline' | 'properties']
  'active-heading-change': [blockId: string | null]
}>()

const editorRef = ref<NotionStyleEditorRef | null>(null)
const titleRef = ref<HTMLTextAreaElement | null>(null)
const scrollContainerRef = ref<HTMLElement | null>(null)
const activeHeadingId = ref<string | null>(null)
let headingObserver: IntersectionObserver | null = null
let headingElements: HTMLElement[] = []
const noteDetail = ref<NoteDetail | null>(null)
const editTitle = ref('')
const editIcon = ref<string | null>(null)
const editType = ref<NoteType>(NoteType.Note)
const content = ref('')
const lastSavedTitle = ref('')
const lastSavedContent = ref('')
const saveStatus = ref<SaveStatus>('idle')
const savedAt = ref<Date | null>(null)
const lastChangeAt = ref(0)
const syncingContent = ref(false)
const iconPickerOpen = ref(false)
const typePickerOpen = ref(false)
const shareDialogOpen = ref(false)

const isDragOver = ref(false)

const savedAtText = computed(() =>
  savedAt.value?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) ?? ''
)

const dirty = computed(() => {
  if (!noteDetail.value) return false
  return editTitle.value !== lastSavedTitle.value || content.value !== lastSavedContent.value
})

const showInitialLoading = computed(() => props.loading && !noteDetail.value)
const isOwner = computed(() => (noteDetail.value?.accessRole ?? 'owner') === 'owner')
const canEdit = computed(() => (noteDetail.value?.accessRole ?? 'owner') !== 'view')

const SAVE_AFTER_MS = 60_000
const POLL_INTERVAL_MS = 10_000
let pollTimer: ReturnType<typeof setInterval> | null = null

watch(() => props.noteId, (noteId) => {
  if (!noteId) {
    resetNoteState()
    return
  }

  if (noteDetail.value && noteDetail.value.id !== noteId) {
    resetNoteState()
  }
})

watch(() => props.note, (note) => {
  void syncNote(note)
}, { immediate: true })

watch(editTitle, (value) => {
  if (noteDetail.value && value !== lastSavedTitle.value) markDirty()
})

watch(() => props.outline, () => {
  nextTick(setupHeadingObserver)
})

onMounted(() => {
  pollTimer = setInterval(() => {
    if (!dirty.value || lastChangeAt.value === 0) return
    if (Date.now() - lastChangeAt.value < SAVE_AFTER_MS) return
    void saveNote()
  }, POLL_INTERVAL_MS)

  nextTick(setupHeadingObserver)
})

onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }

  headingObserver?.disconnect()
  headingObserver = null

  if (saveStatus.value === 'unsaved') void saveNote()
})

// Tracks which heading the reader has scrolled past, so the outline panel
// can highlight the current section (VitePress/GitBook-style "you are here").
function setupHeadingObserver() {
  headingObserver?.disconnect()
  headingObserver = null
  headingElements = []

  if (!scrollContainerRef.value || props.outline.length < 2) {
    if (activeHeadingId.value !== null) {
      activeHeadingId.value = null
      emit('active-heading-change', null)
    }
    return
  }

  headingElements = props.outline
    .map(item => document.getElementById(`block-${item.blockId}`))
    .filter((el): el is HTMLElement => !!el)

  if (headingElements.length === 0) return

  headingObserver = new IntersectionObserver(() => updateActiveHeading(), {
    root: scrollContainerRef.value,
    rootMargin: '0px 0px -70% 0px',
    threshold: 0
  })

  for (const el of headingElements) headingObserver.observe(el)
}

function updateActiveHeading() {
  if (!scrollContainerRef.value || headingElements.length === 0) return

  const containerTop = scrollContainerRef.value.getBoundingClientRect().top
  let current: HTMLElement | null = null

  for (const el of headingElements) {
    if (el.getBoundingClientRect().top - containerTop <= 80) current = el
    else break
  }

  const nextId = (current ?? headingElements[0])?.id.replace('block-', '') ?? null
  if (nextId !== activeHeadingId.value) {
    activeHeadingId.value = nextId
    emit('active-heading-change', nextId)
  }
}

function scrollToHeading(blockId: string) {
  const el = document.getElementById(`block-${blockId}`)
  if (!el) return

  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.add('kortex-block-flash')
  window.setTimeout(() => el.classList.remove('kortex-block-flash'), 1200)
}

function resetNoteState() {
  noteDetail.value = null
  emit('note-loaded', null)
  syncingContent.value = true
  editTitle.value = ''
  editIcon.value = null
  editType.value = NoteType.Note
  content.value = ''
  lastSavedTitle.value = ''
  lastSavedContent.value = ''
  lastChangeAt.value = 0
  saveStatus.value = 'idle'
  iconPickerOpen.value = false
  typePickerOpen.value = false
  shareDialogOpen.value = false
  editorRef.value?.clearContent()
  nextTick(() => {
    syncingContent.value = false
  })
}

async function syncNote(detail: NoteDetail | null) {
  if (!detail) {
    resetNoteState()
    return
  }

  const isSameNote = noteDetail.value?.id === detail.id
  noteDetail.value = detail
  emit('note-loaded', detail)

  if (isSameNote) return

  syncingContent.value = true
  editTitle.value = detail.title
  editIcon.value = detail.icon ?? null
  editType.value = detail.type
  content.value = detail.content ?? ''
  lastSavedTitle.value = detail.title
  lastSavedContent.value = detail.content ?? ''
  lastChangeAt.value = 0
  saveStatus.value = 'idle'
  iconPickerOpen.value = false
  typePickerOpen.value = false

  await nextTick()
  editorRef.value?.setContent(content.value)
  autoGrowTitle()
  syncingContent.value = false
}

function markDirty() {
  if (!noteDetail.value || syncingContent.value) return
  lastChangeAt.value = Date.now()
  saveStatus.value = 'unsaved'
}

// The title is a <textarea>, not an <input>, specifically so long titles
// wrap instead of overflowing/clipping horizontally (an <input> never wraps,
// no matter the CSS — that's what was cutting titles off on narrow screens).
// It grows with content instead of scrolling internally.
function autoGrowTitle() {
  const el = titleRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

function onTitleEnter() {
  // Titles aren't multi-line content — Enter moves on to the body instead
  // of inserting a line break, same as pressing Enter after a Notion title.
  editorRef.value?.focus()
}

async function setIcon(icon: string | null) {
  if (!noteDetail.value || !canEdit.value) return
  editIcon.value = icon
  iconPickerOpen.value = false
  typePickerOpen.value = false
  const result = await props.updateNote(noteDetail.value.id, { icon }, { silent: true })
  if (result) emit('updated')
}

async function setType(type: NoteType) {
  if (!noteDetail.value || !canEdit.value) return
  editType.value = type
  typePickerOpen.value = false
  const result = await props.updateNote(noteDetail.value.id, { type }, { silent: true })
  if (result) emit('updated')
}

function onEditorChange(value: string) {
  emit('content-change', value)
  if (syncingContent.value) return
  if (noteDetail.value && value !== lastSavedContent.value) markDirty()
}

async function saveNote(options?: { notifyOnFailure?: boolean }) {
  if (!noteDetail.value || !dirty.value || !canEdit.value) return

  // Captured up front: when this is called on navigation (see `doSave`
  // below), the caller doesn't wait for this to finish — the user can
  // switch to a different note (or a whole other page) before this
  // resolves. Everything below reads local snapshots, not live refs, and
  // only touches this component's reactive state if it's still showing the
  // note that was actually being saved.
  const savingNoteId = noteDetail.value.id
  const savingTitle = editTitle.value
  const savingContent = content.value
  const noteLabel = savingTitle || 'Sem título'

  function notifyFailure() {
    if (!options?.notifyOnFailure) return
    useToast().add({
      title: 'Não foi possível salvar',
      description: `Alterações em "${noteLabel}" podem não ter sido salvas.`,
      color: 'error'
    })
  }

  try {
    const result = await props.updateNote(
      savingNoteId,
      {
        title: savingTitle,
        content: savingContent
      },
      { silent: true }
    )

    const stillSameNote = noteDetail.value?.id === savingNoteId

    if (result) {
      if (stillSameNote) {
        lastSavedTitle.value = savingTitle
        lastSavedContent.value = savingContent
        lastChangeAt.value = 0
        saveStatus.value = props.isOnline ? 'saved' : 'offline-pending'
        savedAt.value = new Date()
        // Wikilink/backlink sync needs a real round trip against the server —
        // skip it while offline, the mutation queue will replay the content
        // save itself, and links can resync next time this note saves online.
        // Also skipped if the user has since switched notes: it reads/writes
        // `noteDetail`/`content`, which by now belong to a different note.
        if (props.isOnline) void syncLinksFromContent()
      }
      emit('updated')
    } else {
      if (stillSameNote) saveStatus.value = 'error'
      notifyFailure()
    }
  } catch {
    if (noteDetail.value?.id === savingNoteId) saveStatus.value = 'error'
    notifyFailure()
  }
}

interface ContentNode {
  type: string
  attrs?: Record<string, unknown>
  content?: ContentNode[]
}

function extractLinkedNoteIds(contentJson: string): string[] {
  try {
    const doc = JSON.parse(contentJson) as { content?: ContentNode[] }
    const ids: string[] = []

    function walk(nodes: ContentNode[]) {
      for (const node of nodes) {
        if (node.type === 'wikilink' && typeof node.attrs?.noteId === 'string') {
          ids.push(node.attrs.noteId)
        }
        if (node.type === 'mention' && node.attrs?.kind === 'note' && typeof node.attrs.id === 'string') {
          ids.push(node.attrs.id)
        }
        if (node.content) walk(node.content)
      }
    }

    walk(doc.content ?? [])
    return [...new Set(ids)]
  } catch {
    return []
  }
}

async function syncLinksFromContent() {
  if (!noteDetail.value) return

  const linkedIds = extractLinkedNoteIds(content.value)
  const currentLinks = noteDetail.value.links ?? []
  const currentTargetIds = new Set(currentLinks.map(l => l.targetNoteId))
  const newTargetIds = new Set(linkedIds)

  const toAdd = linkedIds.filter(id => !currentTargetIds.has(id))
  const toRemove = currentLinks.filter(l => !newTargetIds.has(l.targetNoteId))

  if (toAdd.length === 0 && toRemove.length === 0) return

  const sourceId = noteDetail.value.id
  let latestDetail: NoteDetail | null = null

  for (const targetId of toAdd) {
    const detail = await props.linkNotes(sourceId, targetId)
    if (detail) latestDetail = detail
  }

  for (const link of toRemove) {
    const detail = await props.unlinkNotes(sourceId, link.id)
    if (detail) latestDetail = detail
  }

  if (latestDetail) {
    noteDetail.value = latestDetail
    emit('note-loaded', latestDetail)
  }
}

interface BreadcrumbItem {
  label: string
  folderId: string | null
  isNote: boolean
  icon?: string | null
  noteType?: string
}

const breadcrumbItems = computed((): BreadcrumbItem[] => {
  if (!noteDetail.value) return []

  const folderPath: NoteFolder[] = []
  let currentFolderId = noteDetail.value.folderId

  while (currentFolderId) {
    const folder = props.folders.find(f => f.id === currentFolderId)
    if (!folder) break
    folderPath.unshift(folder)
    currentFolderId = folder.parentId
  }

  return [
    ...folderPath.map(f => ({ label: f.name, folderId: f.id, isNote: false })),
    {
      label: noteDetail.value.title || 'Sem título',
      folderId: null,
      isNote: true,
      icon: editIcon.value,
      noteType: editType.value
    }
  ]
})

function getTypeMeta(type: string) {
  return NOTE_TYPE_META[type as NoteType] ?? NOTE_TYPE_META[NoteType.Note]
}

const typeMenuItems = computed(() => [
  Object.entries(NOTE_TYPE_META).map(([value, meta]) => ({
    label: meta.label,
    icon: meta.icon,
    type: 'checkbox' as const,
    checked: editType.value === value,
    onUpdateChecked: () => setType(value as NoteType)
  }))
])

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function onDragOver(event: DragEvent) {
  if (event.dataTransfer?.types.includes('application/x-notes-note-id')) {
    isDragOver.value = true
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'link'
  }
}

function onDragLeave(event: DragEvent) {
  const target = event.currentTarget as Element
  if (!event.relatedTarget || !target.contains(event.relatedTarget as Node)) {
    isDragOver.value = false
  }
}

function onDrop(event: DragEvent) {
  isDragOver.value = false
  if (!canEdit.value) return
  const droppedNoteId = event.dataTransfer?.getData('application/x-notes-note-id')
  if (!droppedNoteId || droppedNoteId === noteDetail.value?.id) return

  const droppedNote = props.availableNotes.find(n => n.id === droppedNoteId)
  if (!droppedNote) return

  editorRef.value?.insertWikilink(droppedNoteId, droppedNote.title || 'Sem título')
}

defineExpose({
  isUnsaved: () => saveStatus.value === 'unsaved',
  doSave: saveNote,
  scrollToHeading
})
</script>

<template>
  <div class="notes-editor flex flex-col h-full">
    <div
      v-if="!noteId"
      class="flex flex-col items-center justify-center h-full gap-3 text-center"
    >
      <UIcon
        name="i-lucide-file-text"
        class="size-14 text-dimmed"
      />
      <p class="text-sm text-muted">
        Selecione ou crie uma nota para começar
      </p>
    </div>

    <div
      v-else-if="showInitialLoading"
      class="p-10 space-y-4"
    >
      <USkeleton class="h-10 w-3/4" />
      <USkeleton class="h-3 w-1/3" />
      <div class="space-y-2 mt-6">
        <USkeleton class="h-4 w-full" />
        <USkeleton class="h-4 w-5/6" />
        <USkeleton class="h-4 w-4/5" />
        <USkeleton class="h-4 w-full" />
      </div>
    </div>

    <template v-else-if="noteDetail">
      <!-- Top bar: nav | breadcrumb | timestamp -->
      <div class="flex items-center h-9 px-3 border-b border-default/50 shrink-0 gap-2">
        <!-- Left: nav buttons + add-icon trigger -->
        <div class="flex items-center gap-0.5 shrink-0">
          <!-- History nav — redundant on mobile with the "Notas" back button
               that returns to the list (see index.vue's mobile header).
               `contents` keeps these two as direct flex children at lg+, same
               as the `<template>` fragment this replaces. -->
          <div class="hidden lg:contents">
            <UTooltip text="Voltar">
              <UButton
                icon="i-lucide-arrow-left"
                size="xs"
                variant="ghost"
                color="neutral"
                :disabled="!canGoBack"
                @click="emit('go-back')"
              />
            </UTooltip>
            <UTooltip text="Avançar">
              <UButton
                icon="i-lucide-arrow-right"
                size="xs"
                variant="ghost"
                color="neutral"
                :disabled="!canGoForward"
                @click="emit('go-forward')"
              />
            </UTooltip>
          </div>
          <UPopover v-if="!editIcon && canEdit" v-model:open="iconPickerOpen">
            <UTooltip text="Adicionar ícone">
              <UButton
                icon="i-lucide-smile-plus"
                size="xs"
                variant="ghost"
                color="neutral"
              />
            </UTooltip>
            <template #content>
              <AppEmojiPicker @select="(emoji) => setIcon(emoji)" />
            </template>
          </UPopover>
          <UDropdownMenu v-model:open="typePickerOpen" :items="typeMenuItems" :disabled="!canEdit">
            <UTooltip :text="`Tipo: ${getTypeMeta(editType).label}`">
              <UButton
                :icon="getTypeMeta(editType).icon"
                size="xs"
                variant="ghost"
                color="neutral"
                :disabled="!canEdit"
              />
            </UTooltip>
          </UDropdownMenu>
        </div>

        <!-- Center: breadcrumb — hidden on mobile (the note title already
             shows next to the "Notas" back button, see index.vue); the <nav>
             itself stays as an empty flex-1 spacer so the icons on the right
             remain pinned to the edge. -->
        <nav class="flex-1 flex items-center justify-center min-w-0 overflow-hidden">
          <div class="hidden lg:flex items-center gap-0.5 text-xs text-muted min-w-0">
            <template
              v-for="(item, i) in breadcrumbItems"
              :key="i"
            >
              <UIcon
                v-if="i > 0"
                name="i-lucide-chevron-right"
                class="size-3 text-dimmed shrink-0"
              />
              <button
                v-if="!item.isNote"
                type="button"
                class="flex items-center gap-1 min-w-0 max-w-28 hover:text-highlighted hover:bg-elevated rounded px-1.5 py-0.5 transition-colors"
                @click="emit('navigate-to-folder', item.folderId!)"
              >
                <UIcon
                  name="i-lucide-folder"
                  class="size-3 text-amber-500 shrink-0"
                />
                <span class="truncate">{{ item.label }}</span>
              </button>
              <span
                v-else
                class="flex items-center gap-1 text-highlighted font-medium px-1 min-w-0"
              >
                <span
                  v-if="item.icon"
                  class="text-sm leading-none shrink-0"
                >{{ item.icon }}</span>
                <UIcon
                  v-else
                  :name="getTypeMeta(item.noteType ?? '').icon"
                  class="size-3 shrink-0"
                  :class="`text-${getTypeMeta(item.noteType ?? '').color}-500`"
                />
                <span class="truncate max-w-48">{{ item.label }}</span>
              </span>
            </template>
          </div>
        </nav>

        <!-- Right: outline/properties buttons + share button + unified save / edited indicator -->
        <div class="flex items-center gap-2 text-xs text-muted whitespace-nowrap shrink-0">
          <UTooltip :text="outline.length < 2 ? 'Adicione títulos (H1/H2/H3) para gerar um sumário' : 'Sumário'">
            <UButton
              icon="i-lucide-list"
              size="xs"
              variant="ghost"
              color="neutral"
              :disabled="outline.length < 2"
              @click="emit('open-panel', 'outline')"
            />
          </UTooltip>
          <UTooltip text="Propriedades">
            <UButton
              icon="i-lucide-sliders-horizontal"
              size="xs"
              variant="ghost"
              color="neutral"
              @click="emit('open-panel', 'properties')"
            />
          </UTooltip>
          <UTooltip
            v-if="isOwner"
            text="Compartilhar"
          >
            <UButton
              :icon="noteDetail.visibility === NoteVisibility.Private ? 'i-lucide-lock' : noteDetail.visibility === NoteVisibility.Public ? 'i-lucide-globe' : 'i-lucide-users'"
              size="xs"
              :color="noteDetail.visibility === NoteVisibility.Private ? 'neutral' : 'primary'"
              variant="ghost"
              @click="shareDialogOpen = true"
            />
          </UTooltip>
          <UBadge
            v-else-if="!canEdit"
            icon="i-lucide-eye"
            color="neutral"
            variant="subtle"
            size="sm"
          >
            Somente leitura
          </UBadge>
          <UBadge
            v-else
            icon="i-lucide-pencil"
            color="neutral"
            variant="subtle"
            size="sm"
          >
            Compartilhada com você
          </UBadge>
          <!-- Save status: icons only on mobile (no room for the descriptive
               text), except the error state, which stays actionable/tappable
               with a shorter label instead of disappearing. -->
          <template v-if="saveStatus === 'unsaved'">
            <span class="size-1.5 rounded-full bg-amber-400 dark:bg-amber-500 animate-pulse" />
            <span class="hidden lg:inline">Não salvo</span>
          </template>
          <template v-else-if="saveStatus === 'saved'">
            <UIcon name="i-lucide-check-circle" class="size-3 text-success" />
            <span class="hidden lg:inline">Salvo às {{ savedAtText }}</span>
          </template>
          <template v-else-if="saveStatus === 'offline-pending'">
            <UIcon name="i-lucide-cloud-off" class="size-3 text-warning" />
            <span class="hidden lg:inline">Salvo localmente — sincroniza ao reconectar</span>
          </template>
          <template v-else-if="saveStatus === 'error'">
            <UIcon name="i-lucide-alert-circle" class="size-3 text-error" />
            <button
              type="button"
              class="text-error underline underline-offset-2 cursor-pointer"
              @click="saveNote"
            >
              <span class="lg:hidden">Erro</span>
              <span class="hidden lg:inline">Erro — Tentar novamente</span>
            </button>
          </template>
          <template v-else>
            <span class="hidden lg:inline">Editado {{ formatDate(noteDetail.updatedAt) }}</span>
          </template>
        </div>
      </div>

      <!-- Content: emoji icon + title + save status -->
      <div class="pt-8 pb-2 shrink-0 px-4 lg:pl-16 lg:pr-10">
        <div class="flex items-center gap-2.5">
          <UPopover
            v-if="editIcon && canEdit"
            v-model:open="iconPickerOpen"
          >
            <button
              type="button"
              class="text-4xl leading-none shrink-0 select-none hover:opacity-70 transition-opacity -mt-0.5"
            >
              {{ editIcon }}
            </button>
            <template #content>
              <AppEmojiPicker @select="(emoji) => setIcon(emoji)" />
              <button
                type="button"
                class="w-full text-xs text-muted hover:text-error text-center py-1.5 border-t border-default"
                @click="setIcon(null)"
              >
                Remover ícone
              </button>
            </template>
          </UPopover>
          <span
            v-else-if="editIcon"
            class="text-4xl leading-none shrink-0 select-none -mt-0.5"
          >{{ editIcon }}</span>

          <textarea
            ref="titleRef"
            v-model="editTitle"
            rows="1"
            class="flex-1 font-bold bg-transparent border-none outline-none resize-none overflow-hidden placeholder:text-muted/30 text-highlighted leading-tight text-2xl lg:text-3xl"
            placeholder="Sem titulo..."
            :readonly="!canEdit"
            @input="autoGrowTitle"
            @keydown.enter.prevent="onTitleEnter"
            @blur="saveNote"
          />
        </div>
      </div>

      <div
        ref="scrollContainerRef"
        class="flex-1 overflow-y-auto pb-10 cursor-text px-4 lg:pl-16 lg:pr-10"
        @click.self="editorRef?.focus()"
      >
        <EditorNotionStyleEditor
          ref="editorRef"
          v-model="content"
          surface="plain"
          min-height="300px"
          placeholder="Escreva algo... use / para blocos, [[ para vincular notas."
          enable-wikilinks
          :editable="canEdit"
          :current-note-id="noteDetail.id"
          :available-notes="availableNotes"
          @change="onEditorChange"
          @wikilink-click="emit('navigate-note', $event)"
        />
      </div>

      <div
        class="border-t border-default shrink-0 transition-colors duration-150"
        :class="isDragOver ? 'bg-primary/5 border-primary/50' : ''"
        @dragover.prevent="onDragOver"
        @dragleave="onDragLeave"
        @drop.prevent="onDrop"
      >
        <div
          v-if="isDragOver"
          class="flex items-center justify-center gap-2 py-2 text-xs text-primary font-medium"
        >
          <UIcon
            name="i-lucide-link"
            class="size-3.5"
          />
          Soltar para vincular nota
        </div>
      </div>

      <NotesNoteShareDialog
        v-model:open="shareDialogOpen"
        :note-id="noteDetail.id"
        :visibility="noteDetail.visibility"
        :share-token="noteDetail.shareToken"
        :set-visibility="setNoteVisibility"
        :regenerate-share-link="regenerateShareLink"
        :fetch-shares="fetchNoteShares"
        :add-share="addNoteShare"
        :update-share="updateNoteShare"
        :remove-share="removeNoteShare"
      />
    </template>
  </div>
</template>
