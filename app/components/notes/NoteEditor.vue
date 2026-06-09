<script setup lang="ts">
import type { Note, NoteDetail, NoteFolder, UpdateNotePayload } from '~/types/notes'
import { NOTE_TYPE_META, NoteType } from '~/types/notes'

interface NotionStyleEditorRef {
  focus: () => void
  setContent: (value?: string | null) => void
  getContent: () => string
  clearContent: () => void
}

type SaveStatus = 'idle' | 'unsaved' | 'saved' | 'error'

const props = defineProps<{
  noteId: string | null
  note: NoteDetail | null
  loading: boolean
  folders: NoteFolder[]
  availableNotes: Note[]
  updateNote: (id: string, payload: UpdateNotePayload, options?: { silent?: boolean }) => Promise<Note | null>
  deleteNote: (id: string) => Promise<boolean>
  linkNotes: (sourceId: string, targetId: string) => Promise<NoteDetail | null>
  unlinkNotes: (sourceId: string, linkId: string) => Promise<NoteDetail | null>
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
}>()

const editorRef = ref<NotionStyleEditorRef | null>(null)
const noteDetail = ref<NoteDetail | null>(null)
const editTitle = ref('')
const editIcon = ref<string | null>(null)
const content = ref('')
const lastSavedTitle = ref('')
const lastSavedContent = ref('')
const saveStatus = ref<SaveStatus>('idle')
const savedAt = ref<Date | null>(null)
const lastChangeAt = ref(0)
const syncingContent = ref(false)
const iconPickerOpen = ref(false)

const linkSearchOpen = ref(false)
const linkSearchQuery = ref('')
const isDragOver = ref(false)

const savedAtText = computed(() =>
  savedAt.value?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) ?? ''
)

const dirty = computed(() => {
  if (!noteDetail.value) return false
  return editTitle.value !== lastSavedTitle.value || content.value !== lastSavedContent.value
})

const showInitialLoading = computed(() => props.loading && !noteDetail.value)

const availableNotesForLink = computed(() => {
  if (!noteDetail.value) return []

  const linked = new Set([
    ...(noteDetail.value.links ?? []).map(link => link.targetNoteId),
    noteDetail.value.id
  ])

  return props.availableNotes
    .filter(note => !linked.has(note.id))
    .filter(note => !linkSearchQuery.value || note.title.toLowerCase().includes(linkSearchQuery.value.toLowerCase()))
})

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

onMounted(() => {
  pollTimer = setInterval(() => {
    if (!dirty.value || lastChangeAt.value === 0) return
    if (Date.now() - lastChangeAt.value < SAVE_AFTER_MS) return
    void saveNote()
  }, POLL_INTERVAL_MS)
})

onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }

  if (saveStatus.value === 'unsaved') void saveNote()
})

function resetNoteState() {
  noteDetail.value = null
  emit('note-loaded', null)
  syncingContent.value = true
  editTitle.value = ''
  editIcon.value = null
  content.value = ''
  lastSavedTitle.value = ''
  lastSavedContent.value = ''
  lastChangeAt.value = 0
  saveStatus.value = 'idle'
  iconPickerOpen.value = false
  linkSearchOpen.value = false
  linkSearchQuery.value = ''
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
  content.value = detail.content ?? ''
  lastSavedTitle.value = detail.title
  lastSavedContent.value = detail.content ?? ''
  lastChangeAt.value = 0
  saveStatus.value = 'idle'
  iconPickerOpen.value = false
  linkSearchOpen.value = false
  linkSearchQuery.value = ''

  await nextTick()
  editorRef.value?.setContent(content.value)
  syncingContent.value = false
}

function markDirty() {
  if (!noteDetail.value || syncingContent.value) return
  lastChangeAt.value = Date.now()
  saveStatus.value = 'unsaved'
}

async function setIcon(icon: string | null) {
  if (!noteDetail.value) return
  editIcon.value = icon
  iconPickerOpen.value = false
  const result = await props.updateNote(noteDetail.value.id, { icon }, { silent: true })
  if (result) emit('updated')
}

function onEditorChange(value: string) {
  emit('content-change', value)
  if (syncingContent.value) return
  if (noteDetail.value && value !== lastSavedContent.value) markDirty()
}

async function saveNote() {
  if (!noteDetail.value || !dirty.value) return

  try {
    const result = await props.updateNote(
      noteDetail.value.id,
      {
        title: editTitle.value,
        content: content.value
      },
      { silent: true }
    )

    if (result) {
      lastSavedTitle.value = editTitle.value
      lastSavedContent.value = content.value
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

async function onDelete() {
  if (!noteDetail.value) return

  const ok = await props.deleteNote(noteDetail.value.id)
  if (!ok) return

  resetNoteState()
  emit('deleted')
}

async function addLink(targetId: string) {
  if (!noteDetail.value) return

  const detail = await props.linkNotes(noteDetail.value.id, targetId)
  if (!detail) return

  noteDetail.value = detail
  emit('note-loaded', detail)
  linkSearchOpen.value = false
  linkSearchQuery.value = ''
}

async function removeLink(linkId: string) {
  if (!noteDetail.value) return

  const detail = await props.unlinkNotes(noteDetail.value.id, linkId)
  if (!detail) return

  noteDetail.value = detail
  emit('note-loaded', detail)
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
      noteType: noteDetail.value.type
    }
  ]
})

function getTypeMeta(type: string) {
  return NOTE_TYPE_META[type as NoteType] ?? NOTE_TYPE_META[NoteType.Note]
}

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
  const droppedNoteId = event.dataTransfer?.getData('application/x-notes-note-id')
  if (droppedNoteId && droppedNoteId !== noteDetail.value?.id) {
    void addLink(droppedNoteId)
  }
}

defineExpose({
  isUnsaved: () => saveStatus.value === 'unsaved',
  doSave: saveNote
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
          <UPopover v-if="!editIcon" v-model:open="iconPickerOpen">
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
        </div>

        <!-- Center: breadcrumb -->
        <nav class="flex-1 flex items-center justify-center min-w-0 overflow-hidden">
          <div class="flex items-center gap-0.5 text-xs text-muted min-w-0">
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

        <!-- Right: last edited timestamp -->
        <span class="text-xs text-muted whitespace-nowrap shrink-0">
          Editado {{ formatDate(noteDetail.updatedAt) }}
        </span>
      </div>

      <!-- Content: emoji icon + title + save status -->
      <div class="px-10 pt-8 pb-2 shrink-0">
        <div class="flex items-center gap-2.5">
          <UPopover
            v-if="editIcon"
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

          <input
            v-model="editTitle"
            class="flex-1 text-3xl font-bold bg-transparent border-none outline-none placeholder:text-muted/30 text-highlighted leading-tight"
            placeholder="Sem titulo..."
            @blur="saveNote"
          >
        </div>

        <div class="flex items-center gap-3 mt-1.5">
          <div class="flex items-center gap-1 text-xs shrink-0">
            <template v-if="saveStatus === 'unsaved'">
              <span class="size-1.5 rounded-full bg-amber-400 dark:bg-amber-500 animate-pulse" />
              <span class="text-muted">Não salvo</span>
            </template>
            <template v-else-if="saveStatus === 'saved'">
              <UIcon
                name="i-lucide-check-circle"
                class="size-3 text-success"
              />
              <span class="text-muted">Salvo as {{ savedAtText }}</span>
            </template>
            <template v-else-if="saveStatus === 'error'">
              <UIcon
                name="i-lucide-alert-circle"
                class="size-3 text-error"
              />
              <button
                type="button"
                class="text-primary underline underline-offset-2 cursor-pointer"
                @click="saveNote"
              >
                Tentar novamente
              </button>
            </template>
          </div>
        </div>
      </div>

      <div
        class="flex-1 overflow-y-auto px-10 pb-10 cursor-text"
        @click.self="editorRef?.focus()"
      >
        <EditorNotionStyleEditor
          ref="editorRef"
          v-model="content"
          surface="plain"
          min-height="300px"
          placeholder="Escreva algo... use / para blocos, [[ para vincular notas."
          enable-wikilinks
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
    </template>
  </div>
</template>
