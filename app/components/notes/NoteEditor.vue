<script setup lang="ts">
import type { Note, NoteDetail, UpdateNotePayload } from '~/types/notes'

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
  availableNotes: Note[]
  updateNote: (id: string, payload: UpdateNotePayload, options?: { silent?: boolean }) => Promise<Note | null>
  deleteNote: (id: string) => Promise<boolean>
  linkNotes: (sourceId: string, targetId: string) => Promise<NoteDetail | null>
  unlinkNotes: (sourceId: string, linkId: string) => Promise<NoteDetail | null>
}>()

const emit = defineEmits<{
  'updated': []
  'deleted': []
  'navigate-note': [noteId: string]
  'note-loaded': [note: NoteDetail | null]
  'content-change': [content: string]
}>()

const editorRef = ref<NotionStyleEditorRef | null>(null)
const noteDetail = ref<NoteDetail | null>(null)
const editTitle = ref('')
const content = ref('')
const lastSavedTitle = ref('')
const lastSavedContent = ref('')
const saveStatus = ref<SaveStatus>('idle')
const savedAt = ref<Date | null>(null)
const lastChangeAt = ref(0)
const syncingContent = ref(false)

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
  content.value = ''
  lastSavedTitle.value = ''
  lastSavedContent.value = ''
  lastChangeAt.value = 0
  saveStatus.value = 'idle'
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
  content.value = detail.content ?? ''
  lastSavedTitle.value = detail.title
  lastSavedContent.value = detail.content ?? ''
  lastChangeAt.value = 0
  saveStatus.value = 'idle'
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
        Selecione ou crie uma nota para comecar
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
      <div class="px-10 pt-8 pb-2 shrink-0">
        <input
          v-model="editTitle"
          class="w-full text-3xl font-bold bg-transparent border-none outline-none placeholder:text-muted/30 text-highlighted leading-tight"
          placeholder="Sem titulo..."
          @blur="saveNote"
        >

        <div class="flex items-center gap-3 mt-1.5">
          <span class="text-xs text-muted">Editado {{ formatDate(noteDetail.updatedAt) }}</span>
          <div class="flex items-center gap-1 text-xs shrink-0">
            <template v-if="saveStatus === 'unsaved'">
              <span class="size-1.5 rounded-full bg-amber-400 dark:bg-amber-500 animate-pulse" />
              <span class="text-muted">Nao salvo</span>
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

        <div class="px-10 py-3">
          <div class="grid grid-cols-2 gap-6">
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <h4 class="text-xs font-semibold text-muted uppercase tracking-wide flex items-center gap-1">
                  <UIcon
                    name="i-lucide-link"
                    class="size-3"
                  />
                  Vinculos ({{ noteDetail.links?.length ?? 0 }})
                </h4>
                <UButton
                  icon="i-lucide-plus"
                  size="xs"
                  variant="ghost"
                  @click="linkSearchOpen = !linkSearchOpen"
                />
              </div>

              <div
                v-if="linkSearchOpen"
                class="mb-2 space-y-1"
              >
                <UInput
                  v-model="linkSearchQuery"
                  icon="i-lucide-search"
                  placeholder="Buscar nota..."
                  size="xs"
                  autofocus
                />
                <div class="max-h-28 overflow-y-auto rounded border border-default bg-default">
                  <button
                    v-for="linkableNote in availableNotesForLink.slice(0, 10)"
                    :key="linkableNote.id"
                    class="w-full text-left px-2 py-1.5 text-xs hover:bg-elevated transition-colors truncate block"
                    @click="addLink(linkableNote.id)"
                  >
                    {{ linkableNote.title }}
                  </button>
                  <p
                    v-if="availableNotesForLink.length === 0"
                    class="px-2 py-1.5 text-xs text-muted"
                  >
                    Nenhuma nota disponivel
                  </p>
                </div>
              </div>

              <div
                v-if="noteDetail.links?.length"
                class="space-y-0.5"
              >
                <div
                  v-for="link in noteDetail.links"
                  :key="link.id"
                  class="flex items-center justify-between rounded px-2 py-1 text-xs hover:bg-elevated group"
                >
                  <button
                    class="text-primary hover:underline truncate"
                    @click="emit('navigate-note', link.targetNoteId)"
                  >
                    {{ link.targetNote?.title ?? 'Nota excluida' }}
                  </button>
                  <UButton
                    icon="i-lucide-x"
                    size="xs"
                    color="error"
                    variant="ghost"
                    class="opacity-0 group-hover:opacity-100 shrink-0"
                    @click="removeLink(link.id)"
                  />
                </div>
              </div>
              <p
                v-else
                class="text-xs text-muted"
              >
                Sem vinculos
              </p>
            </div>

            <div>
              <h4 class="text-xs font-semibold text-muted uppercase tracking-wide flex items-center gap-1 mb-1.5">
                <UIcon
                  name="i-lucide-corner-down-left"
                  class="size-3"
                />
                Referenciado por ({{ noteDetail.backlinks?.length ?? 0 }})
              </h4>

              <div
                v-if="noteDetail.backlinks?.length"
                class="space-y-0.5"
              >
                <button
                  v-for="backlink in noteDetail.backlinks"
                  :key="backlink.id"
                  class="w-full text-left rounded px-2 py-1 text-xs text-primary hover:underline hover:bg-elevated truncate block"
                  @click="emit('navigate-note', backlink.sourceNoteId)"
                >
                  {{ backlink.sourceNote?.title ?? 'Nota excluida' }}
                </button>
              </div>
              <p
                v-else
                class="text-xs text-muted"
              >
                Nenhuma nota referencia esta
              </p>
            </div>
          </div>

          <div class="flex justify-end mt-2 pt-2 border-t border-default">
            <UButton
              icon="i-lucide-trash-2"
              label="Excluir nota"
              size="xs"
              color="error"
              variant="ghost"
              @click="onDelete"
            />
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
