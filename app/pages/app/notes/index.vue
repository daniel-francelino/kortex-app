<script setup lang="ts">
import { useEventListener, useStorage } from '@vueuse/core'
import type {
  CreateNotePayload,
  Note,
  NoteDetail,
  NoteFolder,
  UpdateNotePayload
} from '~/types/notes'
import { NoteType } from '~/types/notes'

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
  allNotesStatus,
  refreshAllNotes,
  createFolder,
  updateFolder,
  deleteFolder,
  moveNoteToFolder,
  getFolderDeletionImpact,
  setFolderExpanded,
  computePositionBetween,
  reorderNote,
  reorderFolder
} = useNotes()

// ─── State ────────────────────────────────────────────────────────────────────

const selectedNoteId = ref<string | null>(null)
const activeView = ref<'editor' | 'graph'>('editor')
const createModalOpen = ref(false)
const noteEditorRef = ref<{
  isUnsaved: () => boolean
  doSave: () => Promise<void>
} | null>(null)

onBeforeRouteLeave(async () => {
  if (noteEditorRef.value?.isUnsaved()) {
    await noteEditorRef.value.doSave()
  }
})
const sidebarTab = ref<'notes' | 'tags'>('notes')
const rightTab = ref<'properties' | 'outline'>('properties')
const creatingQuickNote = ref(false)
const creatingQuickFolder = ref(false)
const searchDialogOpen = ref(false)
const deleteFolderTarget = ref<{ id: string, name: string, noteCount: number, subfolderCount: number } | null>(null)

const sidebarWidth = useStorage('notes-sidebar-width', 288)

function startResize(e: MouseEvent) {
  const startX = e.clientX
  const startWidth = sidebarWidth.value

  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'

  const stopMove = useEventListener(window, 'mousemove', (event: MouseEvent) => {
    sidebarWidth.value = Math.max(180, Math.min(520, startWidth + event.clientX - startX))
  })

  const stopUp = useEventListener(window, 'mouseup', () => {
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    stopMove()
    stopUp()
  })
}

const noteSortMode = useStorage<'updated-desc' | 'updated-asc' | 'title-asc' | 'custom'>(
  'notes-sort-mode',
  'updated-desc'
)
const noteSortOptions = [
  {
    label: 'Mais recentes',
    value: 'updated-desc' as const,
    icon: 'i-lucide-arrow-down-wide-narrow'
  },
  {
    label: 'Mais antigas',
    value: 'updated-asc' as const,
    icon: 'i-lucide-arrow-up-wide-narrow'
  },
  {
    label: 'A-Z',
    value: 'title-asc' as const,
    icon: 'i-lucide-arrow-down-a-z'
  },
  {
    label: 'Personalizado',
    value: 'custom' as const,
    icon: 'i-lucide-grip-vertical'
  }
]
const activeSortOption = computed(
  () =>
    noteSortOptions.find(option => option.value === noteSortMode.value)
    ?? noteSortOptions[0]!
)
const sortMenuItems = computed(() => [
  noteSortOptions.map(option => ({
    label: option.label,
    icon: option.icon,
    type: 'checkbox' as const,
    checked: noteSortMode.value === option.value,
    onUpdateChecked: () => {
      noteSortMode.value = option.value
    }
  }))
])

const ALL_TYPE_VALUE = '__all__'
const typeFilterModel = computed({
  get: () => filters.type || ALL_TYPE_VALUE,
  set: (v: string) => {
    filters.type = v === ALL_TYPE_VALUE ? '' : v
  }
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

watch(
  folders,
  (value) => {
    if (Array.isArray(value)) {
      visibleFolders.value = value
    }
  },
  { immediate: true }
)

watch(
  [notesData, allNotes, visibleFolders],
  () => {
    const paginatedNotes = notesData.value?.data
    // When folders are present, always use allNotes as the single source of
    // truth so the folder tree and root list never show conflicting data.
    // Return null (= keep current) if allNotes is still loading to avoid a
    // flash that replaces the folder view with the paginated flat list.
    const nextNotes
      = visibleFolders.value.length > 0
        ? Array.isArray(allNotes.value) ? allNotes.value : null
        : paginatedNotes

    if (nextNotes) {
      visibleNotes.value = nextNotes
      hasLoadedNotesListOnce.value = true
    }

    if (notesData.value) {
      visibleNotesTotal.value = notesData.value.total
    }
  },
  { immediate: true }
)

const notesListInitialLoading = computed(
  () =>
    !hasLoadedNotesListOnce.value
    && (notesStatus.value === 'pending' || allNotesStatus.value === 'pending')
)

const sortedVisibleFolders = computed(() =>
  [...visibleFolders.value].sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
  )
)

const sortedVisibleNotes = computed(() => {
  const notes = [...visibleNotes.value]

  return notes.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1

    if (noteSortMode.value === 'custom') {
      return a.position - b.position
    }

    if (noteSortMode.value === 'title-asc') {
      return (a.title || 'Sem título').localeCompare(
        b.title || 'Sem título',
        'pt-BR',
        { sensitivity: 'base' }
      )
    }

    const left = new Date(a.updatedAt).getTime()
    const right = new Date(b.updatedAt).getTime()
    return noteSortMode.value === 'updated-asc' ? left - right : right - left
  })
})

// ─── Note detail (shared between editor + right panel) ────────────────────────

const currentNoteDetail = ref<NoteDetail | null>(null)
const currentNoteLoading = ref(false)
const currentContent = ref('')
const hasLoadedNoteDetailOnce = ref(false)
let currentNoteRequestId = 0

async function loadCurrentNoteDetail(
  noteId: string | null
): Promise<NoteDetail | null> {
  const requestId = ++currentNoteRequestId

  if (!noteId) {
    currentNoteDetail.value = null
    currentContent.value = ''
    currentNoteLoading.value = false
    return null
  }

  currentNoteLoading.value = true

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

watch(selectedNoteId, (noteId) => {
  void loadCurrentNoteDetail(noteId)
})

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
    const result: { level: number, text: string }[] = []
    function walk(
      nodes: {
        type: string
        attrs?: Record<string, unknown>
        content?: unknown[]
      }[]
    ) {
      for (const node of nodes) {
        if (node.type === 'heading') {
          const text = (node.content ?? [])
            .map((c: unknown) => (c as { text?: string }).text ?? '')
            .join('')
          if (text)
            result.push({ level: (node.attrs?.level as number) ?? 1, text })
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
const canGoForward = computed(
  () => historyIndex.value < noteHistory.value.length - 1
)

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

function openNotesSearch(): void {
  searchQuery.value = ''
  searchDialogOpen.value = true
}

function onSearchNoteSelected(noteId: string): void {
  void navigateTo(noteId)
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
    historyIndex.value = Math.min(
      historyIndex.value,
      noteHistory.value.length - 1
    )
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

async function onMoveToFolder(
  noteId: string,
  folderId: string | null
): Promise<void> {
  await moveNoteToFolder(noteId, folderId)
}

function getAvailableName(baseName: string, existingNames: string[]): string {
  const names = new Set(
    existingNames.map(name => name.trim().toLocaleLowerCase('pt-BR'))
  )
  if (!names.has(baseName.toLocaleLowerCase('pt-BR'))) return baseName

  let index = 1
  let nextName = `${baseName} ${index}`
  while (names.has(nextName.toLocaleLowerCase('pt-BR'))) {
    index++
    nextName = `${baseName} ${index}`
  }
  return nextName
}

// Expands the target folder and every ancestor above it, so a note created
// inside a collapsed folder (or nested inside a collapsed parent) is actually
// visible in the tree right away instead of looking like it wasn't created there.
function expandFolderChain(folderId: string): void {
  let currentId: string | null = folderId
  const visited = new Set<string>()

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId)
    setFolderExpanded(currentId, true)
    const folder = visibleFolders.value.find(f => f.id === currentId)
    currentId = folder?.parentId ?? null
  }
}

async function onQuickCreateNote(folderId?: string | null): Promise<void> {
  if (creatingQuickNote.value) return

  creatingQuickNote.value = true
  try {
    const title = getAvailableName(
      'Untitled',
      visibleNotes.value.map(note => note.title)
    )
    const note = await createNote({
      title,
      type: NoteType.Note,
      folderId: folderId ?? null
    })

    if (note) {
      if (folderId) expandFolderChain(folderId)
      await refreshAllNotes()
      await navigateTo(note.id)
    }
  } finally {
    creatingQuickNote.value = false
  }
}

async function onQuickCreateFolder(parentId?: string): Promise<void> {
  if (creatingQuickFolder.value) return

  creatingQuickFolder.value = true
  try {
    const siblingNames = parentId
      ? visibleFolders.value.filter(f => f.parentId === parentId).map(f => f.name)
      : visibleFolders.value.filter(f => !f.parentId).map(f => f.name)
    const name = getAvailableName('Nova pasta', siblingNames)
    const folder = await createFolder({ name, parentId: parentId ?? null })
    if (folder && parentId) expandFolderChain(parentId)
  } finally {
    creatingQuickFolder.value = false
  }
}

async function onRenameFolder(folderId: string, name: string): Promise<void> {
  await updateFolder(folderId, { name })
}

async function onRenameNote(noteId: string, title: string): Promise<void> {
  const note = await onUpdateNote(noteId, { title })
  if (note) {
    refreshNotes()
    refreshAllNotes()
  }
}

function onDeleteFolder(folderId: string): void {
  const folder = visibleFolders.value.find(f => f.id === folderId)
  if (!folder) return
  const impact = getFolderDeletionImpact(folderId)
  deleteFolderTarget.value = { id: folderId, name: folder.name, ...impact }
}

async function confirmDeleteFolder(): Promise<void> {
  const target = deleteFolderTarget.value
  if (!target) return
  deleteFolderTarget.value = null
  await deleteFolder(target.id)
}

function onToggleFolder(folderId: string, isExpanded: boolean): void {
  setFolderExpanded(folderId, isExpanded)
}

function onReorderNote(noteId: string, beforeId: string | null, afterId: string | null): void {
  const beforePos = beforeId ? (visibleNotes.value.find(n => n.id === beforeId)?.position ?? null) : null
  const afterPos = afterId ? (visibleNotes.value.find(n => n.id === afterId)?.position ?? null) : null
  void reorderNote(noteId, computePositionBetween(beforePos, afterPos))
}

function onReorderFolder(folderId: string, beforeId: string | null, afterId: string | null): void {
  const beforePos = beforeId ? (visibleFolders.value.find(f => f.id === beforeId)?.position ?? null) : null
  const afterPos = afterId ? (visibleFolders.value.find(f => f.id === afterId)?.position ?? null) : null
  void reorderFolder(folderId, computePositionBetween(beforePos, afterPos))
}

async function onPinNote(note: Note): Promise<void> {
  await togglePin(note)
}

function onNavigateNote(noteId: string): void {
  void navigateTo(noteId)
}

function onNavigateToFolder(_folderId: string): void {
  // sidebar always visible — no action needed for now
}

function onGraphSelectNote(noteId: string): void {
  void navigateTo(noteId)
}

function switchToGraph(): void {
  selectedNoteId.value = null
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

async function onLinkNotes(
  sourceId: string,
  targetId: string
): Promise<NoteDetail | null> {
  const ok = await linkNotes(sourceId, { targetNoteId: targetId })
  if (!ok) return null
  return await reloadNoteDetail(sourceId)
}

async function onUnlinkNotes(
  sourceId: string,
  linkId: string
): Promise<NoteDetail | null> {
  const ok = await unlinkNotes(linkId)
  if (!ok) return null
  return await reloadNoteDetail(sourceId)
}
</script>

<template>
  <UDashboardPanel
    id="notes"
    :ui="{
      body: 'p-0 sm:p-0'
    }"
  >
    <template #header>
      <!-- Navbar -->
      <UDashboardNavbar title="Notas">
        <template #leading>
          <AppSidebarCollapse />
        </template>

        <template #right>
          <NotificationsButton />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- ── Initial load skeleton ─────────────────────────────────────────────────── -->
      <div v-if="notesListInitialLoading" class="flex h-full">
        <!-- Sidebar skeleton -->
        <div
          class="shrink-0 flex flex-col h-full border-r border-default"
          :style="{ width: sidebarWidth + 'px' }"
        >
          <div class="px-3 h-9 border-b border-default flex items-center gap-1">
            <USkeleton v-for="i in 5" :key="i" class="size-7 rounded-md" />
          </div>
          <div class="flex-1 p-2 space-y-1">
            <USkeleton v-for="i in 10" :key="i" class="h-9 w-full rounded-lg" />
          </div>
        </div>
        <!-- Main area skeleton -->
        <div class="flex-1 flex flex-col px-16 py-10 gap-3 max-w-3xl">
          <USkeleton class="h-8 w-2/5 mb-2" />
          <USkeleton class="h-4 w-full" />
          <USkeleton class="h-4 w-full" />
          <USkeleton class="h-4 w-4/6" />
          <USkeleton class="h-4 w-full mt-4" />
          <USkeleton class="h-4 w-5/6" />
          <USkeleton class="h-4 w-full" />
          <USkeleton class="h-4 w-3/6 mt-4" />
          <USkeleton class="h-4 w-full" />
          <USkeleton class="h-4 w-full" />
        </div>
      </div>

      <div v-else class="flex h-full">
        <!-- ── Left sidebar (notes list + tags) ──────────────────────────────────── -->
        <div
          class="shrink-0 flex flex-col h-full relative"
          :style="{ width: sidebarWidth + 'px' }"
        >
          <!-- Sidebar header -->
          <div class="px-3 h-9 border-b border-default flex items-center">
            <div class="flex items-center justify-center gap-1">
              <UTooltip text="Nova nota">
                <UButton
                  icon="i-lucide-square-pen"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  :loading="creatingQuickNote"
                  @click="onQuickCreateNote()"
                />
              </UTooltip>

              <UTooltip text="Nova pasta">
                <UButton
                  icon="i-lucide-folder-plus"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  :loading="creatingQuickFolder"
                  @click="onQuickCreateFolder()"
                />
              </UTooltip>

              <UDropdownMenu :items="sortMenuItems">
                <UTooltip :text="`Ordenar: ${activeSortOption.label}`">
                  <UButton
                    :icon="activeSortOption.icon"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                  />
                </UTooltip>
              </UDropdownMenu>

              <UTooltip text="Buscar">
                <UButton
                  icon="i-lucide-search"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  @click="openNotesSearch"
                />
              </UTooltip>

              <UTooltip
                :text="activeView === 'graph' ? 'Abrir editor' : 'Abrir grafo'"
              >
                <UButton
                  :icon="
                    activeView === 'graph'
                      ? 'i-lucide-file-text'
                      : 'i-lucide-network'
                  "
                  size="xs"
                  variant="ghost"
                  :color="activeView === 'graph' ? 'primary' : 'neutral'"
                  @click="
                    activeView === 'graph'
                      ? (activeView = 'editor')
                      : switchToGraph()
                  "
                />
              </UTooltip>
            </div>
          </div>

          <!-- Sidebar content -->
          <div class="flex-1 overflow-y-auto">
            <NotesList
              :notes="sortedVisibleNotes"
              :folders="sortedVisibleFolders"
              :total="visibleNotesTotal"
              :page="page"
              :page-size="pageSize"
              :loading="notesListInitialLoading"
              :selected-id="selectedNoteId"
              :sort-mode="noteSortMode"
              @select="onSelectNote"
              @new-note="onQuickCreateNote()"
              @new-folder="onQuickCreateFolder"
              @new-subfolder="onQuickCreateFolder"
              @new-note-in-folder="onQuickCreateNote"
              @update:page="page = $event"
              @pin="onPinNote"
              @delete="onDeleteNote"
              @move-to-folder="onMoveToFolder"
              @rename-note="onRenameNote"
              @rename-folder="onRenameFolder"
              @delete-folder="onDeleteFolder"
              @toggle-folder="onToggleFolder"
              @reorder-note="onReorderNote"
              @reorder-folder="onReorderFolder"
            />
          </div>

          <!-- Resize handle -->
          <div
            class="absolute right-0 top-0 h-full w-1 cursor-col-resize border-r border-default hover:border-primary transition-colors z-10"
            @mousedown.prevent="startResize"
          />
        </div>

        <!-- ── Main area (navbar + editor + right panel) ──────────────────────────── -->
        <div class="flex-1 flex flex-col h-full min-w-0">
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
                :folders="sortedVisibleFolders"
                :available-notes="editorAvailableNotes"
                :update-note="onUpdateNote"
                :delete-note="onDeleteNoteById"
                :link-notes="onLinkNotes"
                :unlink-notes="onUnlinkNotes"
                :can-go-back="canGoBack"
                :can-go-forward="canGoForward"
                @updated="onNoteUpdated"
                @deleted="onNoteDeleted"
                @go-back="goBack"
                @go-forward="goForward"
                @navigate-note="onNavigateNote"
                @navigate-to-folder="onNavigateToFolder"
                @note-loaded="onNoteLoaded"
                @content-change="onContentChange"
              />
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Create Modal -->
  <NotesNoteCreateModal
    :open="createModalOpen"
    :note-type-options="noteTypeOptions"
    :create-note="onCreateNote"
    @update:open="createModalOpen = $event"
    @saved="onNoteSaved"
  />

  <NotesSearchDialog
    :open="searchDialogOpen"
    :query="searchQuery"
    :notes="editorAvailableNotes"
    :folders="sortedVisibleFolders"
    :results="searchResults"
    :searching="searching"
    :selected-id="selectedNoteId"
    @update:open="searchDialogOpen = $event"
    @update:query="searchQuery = $event"
    @select="onSearchNoteSelected"
  />

  <!-- Delete folder confirmation -->
  <UModal
    :open="!!deleteFolderTarget"
    @update:open="(value: boolean) => { if (!value) deleteFolderTarget = null }"
  >
    <template #header>
      <h3 class="text-lg font-semibold">
        Excluir pasta "{{ deleteFolderTarget?.name }}"?
      </h3>
    </template>

    <template #body>
      <p class="text-sm text-muted">
        <template v-if="deleteFolderTarget && (deleteFolderTarget.noteCount > 0 || deleteFolderTarget.subfolderCount > 0)">
          Isso vai excluir permanentemente
          <strong>{{ deleteFolderTarget.noteCount }}</strong> nota(s) e
          <strong>{{ deleteFolderTarget.subfolderCount }}</strong> subpasta(s) contidas nela.
          Essa ação não pode ser desfeita.
        </template>
        <template v-else>
          Essa ação não pode ser desfeita.
        </template>
      </p>

      <div class="flex justify-end gap-2 pt-4">
        <UButton
          label="Cancelar"
          color="neutral"
          variant="subtle"
          @click="deleteFolderTarget = null"
        />
        <UButton
          label="Excluir"
          color="error"
          @click="confirmDeleteFolder"
        />
      </div>
    </template>
  </UModal>
</template>
