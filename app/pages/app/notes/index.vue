<script setup lang="ts">
import type { CreateNotePayload, Note, NoteDetail, NoteFolder, UpdateNotePayload } from '~/types/notes'

definePageMeta({ layout: 'app', ssr: false })
useSeoMeta({ title: 'Notas' })

const {
  notesData,
  notesStatus,
  tags,
  graphData,
  graphStatus,
  searchQuery,
  searchResults,
  searching,
  page,
  pageSize,
  filters,
  refreshNotes,
  refreshGraph,
  noteTypeOptions,
  createNote,
  updateNote,
  fetchNoteDetail,
  togglePin,
  deleteNote,
  linkNotes,
  unlinkNotes,
  folders,
  allNotes,
  refreshAllNotes,
  createFolder,
  updateFolder,
  deleteFolder,
  moveNoteToFolder
} = useNotes()

// ─── State ────────────────────────────────────────────────────────────────────

const selectedNoteId = ref<string | null>(null)
const activeView = ref<'editor' | 'graph'>('editor')
const createModalOpen = ref(false)
const noteEditorRef = ref<{ isUnsaved: () => boolean, doSave: () => Promise<void> } | null>(null)

onBeforeRouteLeave(async () => {
  if (noteEditorRef.value?.isUnsaved()) {
    await noteEditorRef.value.doSave()
  }
})
const sidebarTab = ref<'notes' | 'tags'>('notes')
const zenMode = ref(false)
const rightTab = ref<'properties' | 'outline'>('properties')

const ALL_TYPE_VALUE = '__all__'
const typeFilterModel = computed({
  get: () => filters.type || ALL_TYPE_VALUE,
  set: (v: string) => { filters.type = v === ALL_TYPE_VALUE ? '' : v }
})
const typeFilterOptions = computed(() => [
  { label: 'Todos tipos', value: ALL_TYPE_VALUE },
  ...noteTypeOptions
])

// Keep the last rendered list stable while requests refresh in the background.
const visibleFolders = ref<NoteFolder[]>([])
const visibleNotes = ref<Note[]>([])
const visibleNotesTotal = ref(0)
const hasLoadedNotesListOnce = ref(false)

watch(folders, (value) => {
  if (Array.isArray(value)) {
    visibleFolders.value = value
  }
}, { immediate: true })

watch([notesData, allNotes, visibleFolders], () => {
  const paginatedNotes = notesData.value?.data
  const nextNotes = visibleFolders.value.length > 0
    ? (Array.isArray(allNotes.value) ? allNotes.value : paginatedNotes)
    : paginatedNotes

  if (nextNotes) {
    visibleNotes.value = nextNotes
    hasLoadedNotesListOnce.value = true
  }

  if (notesData.value) {
    visibleNotesTotal.value = notesData.value.total
  }
}, { immediate: true })

const notesListInitialLoading = computed(() =>
  !hasLoadedNotesListOnce.value && (notesStatus.value === 'pending' || allNotesStatus.value === 'pending')
)

// ─── Note detail (shared between editor + right panel) ────────────────────────

const currentNoteDetail = ref<NoteDetail | null>(null)
const currentNoteLoading = ref(false)
const currentContent = ref('')
const hasLoadedNoteDetailOnce = ref(false)
let currentNoteRequestId = 0

async function loadCurrentNoteDetail(noteId: string | null): Promise<NoteDetail | null> {
  const requestId = ++currentNoteRequestId

  if (!noteId) {
    currentNoteDetail.value = null
    currentContent.value = ''
    currentNoteLoading.value = false
    return null
  }

  currentNoteLoading.value = !hasLoadedNoteDetailOnce.value && !currentNoteDetail.value

  try {
    const detail = await fetchNoteDetail(noteId)
    if (requestId !== currentNoteRequestId) return null

    currentNoteDetail.value = detail
    currentContent.value = detail?.content ?? ''
    if (detail) {
      hasLoadedNoteDetailOnce.value = true
    }
    return detail
  } finally {
    if (requestId === currentNoteRequestId) {
      currentNoteLoading.value = false
    }
  }
}

watch(selectedNoteId, noteId => { void loadCurrentNoteDetail(noteId) })

function onNoteLoaded(note: NoteDetail | null) {
  currentNoteDetail.value = note
  currentContent.value = note?.content ?? ''
}

function onContentChange(content: string) {
  currentContent.value = content
}

// ─── Outline parsing ──────────────────────────────────────────────────────────

const outline = computed(() => {
  if (!currentContent.value) return []
  try {
    const doc = JSON.parse(currentContent.value)
    const result: { level: number; text: string }[] = []
    function walk(nodes: { type: string; attrs?: Record<string, unknown>; content?: unknown[] }[]) {
      for (const node of nodes) {
        if (node.type === 'heading') {
          const text = (node.content ?? [])
            .map((c: unknown) => (c as { text?: string }).text ?? '')
            .join('')
          if (text) result.push({ level: (node.attrs?.level as number) ?? 1, text })
        }
        if (node.content) walk(node.content as typeof nodes)
      }
    }
    walk(doc.content ?? [])
    return result
  } catch {
    return []
  }
})

// ─── History (back / forward) ─────────────────────────────────────────────────

const noteHistory = ref<string[]>([])
const historyIndex = ref(-1)

const canGoBack = computed(() => historyIndex.value > 0)
const canGoForward = computed(() => historyIndex.value < noteHistory.value.length - 1)

async function saveCurrentNoteIfNeeded(): Promise<void> {
  if (noteEditorRef.value?.isUnsaved()) {
    await noteEditorRef.value.doSave()
  }
}

async function navigateTo(noteId: string) {
  if (selectedNoteId.value === noteId) return
  await saveCurrentNoteIfNeeded()
  // Truncate forward history
  noteHistory.value = noteHistory.value.slice(0, historyIndex.value + 1)
  noteHistory.value.push(noteId)
  historyIndex.value++
  selectedNoteId.value = noteId
  activeView.value = 'editor'
}

async function goBack() {
  if (!canGoBack.value) return
  await saveCurrentNoteIfNeeded()
  historyIndex.value--
  selectedNoteId.value = noteHistory.value[historyIndex.value] ?? null
}

async function goForward() {
  if (!canGoForward.value) return
  await saveCurrentNoteIfNeeded()
  historyIndex.value++
  selectedNoteId.value = noteHistory.value[historyIndex.value] ?? null
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

function onSelectNote(note: string | Note): void {
  const id = typeof note === 'string' ? note : note.id
  void navigateTo(id)
}

function onNoteSaved(note: { id: string }): void {
  createModalOpen.value = false
  void navigateTo(note.id)
}

function onNoteUpdated(): void {
  refreshNotes()
  refreshAllNotes()
}

function onNoteDeleted(): void {
  // Remove deleted note from history
  const deletedId = selectedNoteId.value
  if (deletedId) {
    noteHistory.value = noteHistory.value.filter(id => id !== deletedId)
    historyIndex.value = Math.min(historyIndex.value, noteHistory.value.length - 1)
  }
  selectedNoteId.value = noteHistory.value[historyIndex.value] ?? null
  currentNoteDetail.value = null
}

async function onDeleteNoteById(noteId: string): Promise<boolean> {
  const ok = await deleteNote(noteId)
  if (ok) {
    await refreshAllNotes()
  }
  return ok
}

async function onDeleteNote(note: Note): Promise<void> {
  const ok = await onDeleteNoteById(note.id)
  if (ok && selectedNoteId.value === note.id) {
    onNoteDeleted()
  }
}

async function onMoveToFolder(noteId: string, folderId: string | null): Promise<void> {
  await moveNoteToFolder(noteId, folderId)
}

async function onCreateFolder(name: string): Promise<void> {
  await createFolder({ name })
}

async function onRenameFolder(folderId: string, name: string): Promise<void> {
  await updateFolder(folderId, { name })
}

async function onDeleteFolder(folderId: string): Promise<void> {
  await deleteFolder(folderId)
}

async function onPinNote(note: Note): Promise<void> {
  await togglePin(note)
}

function onNavigateNote(noteId: string): void {
  void navigateTo(noteId)
}

function onGraphSelectNote(noteId: string): void {
  void navigateTo(noteId)
}

function switchToGraph(): void {
  activeView.value = 'graph'
  refreshGraph()
}

function onPropertiesUpdated(): void {
  refreshNotes()
}

const editorAvailableNotes = computed<Note[]>(() => {
  if (Array.isArray(allNotes.value)) return allNotes.value
  return notesData.value?.data ?? visibleNotes.value
})

async function onCreateNote(payload: CreateNotePayload): Promise<Note | null> {
  const note = await createNote(payload)
  if (note) {
    await refreshAllNotes()
  }
  return note
}

async function onUpdateNote(
  noteId: string,
  payload: UpdateNotePayload,
  options?: { silent?: boolean }
): Promise<Note | null> {
  const note = await updateNote(noteId, payload, options)

  if (note && currentNoteDetail.value?.id === noteId) {
    currentNoteDetail.value = { ...currentNoteDetail.value, ...note }
  }

  return note
}

async function reloadNoteDetail(noteId: string): Promise<NoteDetail | null> {
  const detail = await fetchNoteDetail(noteId)
  if (selectedNoteId.value === noteId) {
    currentNoteDetail.value = detail
    currentContent.value = detail?.content ?? ''
  }
  return detail
}

async function onLinkNotes(sourceId: string, targetId: string): Promise<NoteDetail | null> {
  const ok = await linkNotes(sourceId, { targetNoteId: targetId })
  if (!ok) return null
  return await reloadNoteDetail(sourceId)
}

async function onUnlinkNotes(sourceId: string, linkId: string): Promise<NoteDetail | null> {
  const ok = await unlinkNotes(linkId)
  if (!ok) return null
  return await reloadNoteDetail(sourceId)
}
</script>

<template>
  <UDashboardPanel id="notes" class="flex-row!">
    <!-- ── Left sidebar (notes list + tags) ──────────────────────────────────── -->
    <div
      v-show="!zenMode"
      class="w-72 shrink-0 flex flex-col border-r border-default h-full transition-all"
    >
      <!-- Sidebar header -->
      <div class="px-3 py-2 border-b border-default">
        <div class="flex items-center justify-between mb-2">
          <h2 class="text-sm font-semibold text-highlighted">Notas</h2>
          <div class="flex items-center gap-1">
            <UButton icon="i-lucide-plus" size="xs" @click="createModalOpen = true" />
            <UButton
              :icon="activeView === 'graph' ? 'i-lucide-file-text' : 'i-lucide-network'"
              size="xs"
              variant="ghost"
              :color="activeView === 'graph' ? 'primary' : 'neutral'"
              @click="activeView === 'graph' ? activeView = 'editor' : switchToGraph()"
            />
          </div>
        </div>

        <UInput
          v-model="searchQuery"
          icon="i-lucide-search"
          placeholder="Buscar notas..."
          size="xs"
          class="w-full"
        />
      </div>

      <!-- Sidebar content -->
      <div class="flex-1 overflow-y-auto">
        <!-- Search results -->
        <div v-if="searchQuery && searchQuery.length >= 2" class="p-2">
          <div v-if="searchResults.length > 0" class="space-y-1">
            <button
              v-for="result in searchResults"
              :key="result.id"
              class="w-full text-left rounded px-2 py-2 hover:bg-elevated transition-colors"
              :class="selectedNoteId === result.id ? 'bg-elevated ring-1 ring-primary' : ''"
              @click="onSelectNote(result.id)"
            >
              <p class="text-sm font-medium text-highlighted truncate">{{ result.title }}</p>
              <p v-if="result.excerpt" class="text-xs text-muted truncate mt-0.5">{{ result.excerpt }}</p>
            </button>
          </div>
          <p v-else-if="!searching" class="text-xs text-muted text-center py-4">Nenhum resultado</p>
        </div>

        <!-- Notes list -->
        <div v-else>
          <NotesList
            :notes="visibleNotes"
            :folders="visibleFolders"
            :total="visibleNotesTotal"
            :page="page"
            :page-size="pageSize"
            :loading="notesListInitialLoading"
            :selected-id="selectedNoteId"
            @select="onSelectNote"
            @new-note="createModalOpen = true"
            @update:page="page = $event"
            @pin="onPinNote"
            @delete="onDeleteNote"
            @move-to-folder="onMoveToFolder"
            @create-folder="onCreateFolder"
            @rename-folder="onRenameFolder"
            @delete-folder="onDeleteFolder"
          />
        </div>       
      </div>

      <!-- Filters -->
      <div v-if="sidebarTab === 'notes' && !searchQuery" class="border-t border-default px-3 py-2 shrink-0">
        <div class="flex items-center gap-2">
          <USelect
            v-model="typeFilterModel"
            :items="typeFilterOptions"
            value-key="value"
            size="xs"
            class="flex-1"
          />
          <UButton
            :icon="filters.pinned ? 'i-lucide-pin' : 'i-lucide-pin-off'"
            size="xs"
            :variant="filters.pinned ? 'solid' : 'ghost'"
            :color="filters.pinned ? 'primary' : 'neutral'"
            @click="filters.pinned = filters.pinned ? '' : 'true'"
          />
        </div>
      </div>
    </div>

    <!-- ── Main area (navbar + editor + right panel) ──────────────────────────── -->
    <div class="flex-1 flex flex-col h-full min-w-0">
      <!-- Navbar -->
      <UDashboardNavbar>
        <template #leading>
          <AppSidebarCollapse />

          <!-- Zen mode toggle -->
          <UTooltip :text="zenMode ? 'Sair do modo foco' : 'Modo foco'">
            <UButton
              :icon="zenMode ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'"
              size="xs"
              variant="ghost"
              color="neutral"
              class="ml-1"
              @click="zenMode = !zenMode"
            />
          </UTooltip>

          <!-- History back / forward -->
          <div class="flex items-center gap-0.5 ml-1">
            <UTooltip text="Voltar">
              <UButton
                icon="i-lucide-arrow-left"
                size="xs"
                variant="ghost"
                color="neutral"
                :disabled="!canGoBack"
                @click="goBack"
              />
            </UTooltip>
            <UTooltip text="Avançar">
              <UButton
                icon="i-lucide-arrow-right"
                size="xs"
                variant="ghost"
                color="neutral"
                :disabled="!canGoForward"
                @click="goForward"
              />
            </UTooltip>
          </div>

          <!-- Current note title breadcrumb -->
          <span v-if="currentNoteDetail" class="ml-2 text-sm font-medium text-highlighted truncate max-w-xs">
            {{ currentNoteDetail.title || 'Sem título' }}
          </span>
          <span v-else class="ml-2 text-sm font-medium text-muted">
            {{ activeView === 'graph' ? 'Grafo de Notas' : 'Editor' }}
          </span>
        </template>

        <template #right>
          <NotificationsButton />
        </template>
      </UDashboardNavbar>

      <!-- Content: editor + right panel -->
      <div class="flex-1 flex overflow-hidden">
        <!-- Graph or Editor -->
        <div class="flex-1 overflow-hidden">
          <NotesGraphView
            v-if="activeView === 'graph'"
            :graph-data="graphData ?? null"
            :loading="graphStatus === 'pending' && !graphData"
            @select-note="onGraphSelectNote"
          />

          <NotesNoteEditor
            v-else
            ref="noteEditorRef"
            :note-id="selectedNoteId"
            :note="currentNoteDetail"
            :loading="currentNoteLoading"
            :available-notes="editorAvailableNotes"
            :update-note="onUpdateNote"
            :delete-note="onDeleteNoteById"
            :link-notes="onLinkNotes"
            :unlink-notes="onUnlinkNotes"
            @updated="onNoteUpdated"
            @deleted="onNoteDeleted"
            @navigate-note="onNavigateNote"
            @note-loaded="onNoteLoaded"
            @content-change="onContentChange"
          />
        </div>

        <!-- Right panel: Properties / Outline -->
        <div
          v-show="!zenMode && !!selectedNoteId && activeView === 'editor'"
          class="w-60 shrink-0 border-l border-default flex flex-col overflow-hidden"
        >
          <!-- Tab bar -->
          <div class="flex border-b border-default shrink-0">
            <button
              class="flex-1 px-3 py-2 text-xs font-medium transition-colors"
              :class="rightTab === 'properties' ? 'text-primary border-b-2 border-primary' : 'text-muted hover:text-default'"
              @click="rightTab = 'properties'"
            >
              Propriedades
            </button>
            <button
              class="flex-1 px-3 py-2 text-xs font-medium transition-colors"
              :class="rightTab === 'outline' ? 'text-primary border-b-2 border-primary' : 'text-muted hover:text-default'"
              @click="rightTab = 'outline'"
            >
              Esboço
            </button>
          </div>

          <!-- Properties -->
          <div v-show="rightTab === 'properties'" class="flex-1 overflow-y-auto">
            <NotesNotePropertiesPanel
              :note="currentNoteDetail"
              :tags="tags ?? []"
              :note-type-options="noteTypeOptions"
              :update-note="onUpdateNote"
              @updated="onPropertiesUpdated"
              @navigate-note="onNavigateNote"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Create Modal -->
    <NotesNoteCreateModal
      :open="createModalOpen"
      :note-type-options="noteTypeOptions"
      :create-note="onCreateNote"
      @update:open="createModalOpen = $event"
      @saved="onNoteSaved"
    />
  </UDashboardPanel>
</template>
