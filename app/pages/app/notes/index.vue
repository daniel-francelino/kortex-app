<script setup lang="ts">
import { useEventListener, useStorage } from '@vueuse/core'
import { AnimatePresence, motion } from 'motion-v'
import type {
  CreateNotePayload,
  Note,
  NoteDetail,
  NoteFolder,
  NoteVisibility,
  TrashItem,
  UpdateNotePayload
} from '~/types/notes'
import { NoteType } from '~/types/notes'

definePageMeta({ layout: 'app', ssr: false })
useSeoMeta({ title: 'Notas' })

const route = useRoute()
const router = useRouter()
const toast = useToast()

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
  duplicateNote,
  updateNote,
  createTag,
  updateTag,
  deleteTag,
  fetchNoteDetail,
  togglePin,
  deleteNote,
  linkNotes,
  unlinkNotes,
  setNoteVisibility,
  regenerateShareLink,
  fetchNoteShares,
  addNoteShare,
  updateNoteShare,
  removeNoteShare,
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
  trashItems,
  trashStatus,
  fetchTrash,
  restoreNote,
  restoreFolder,
  permanentlyDeleteNote,
  permanentlyDeleteFolder,
  refreshFolders,
  computePositionBetween,
  reorderNote,
  reorderFolder,
  sharedWithMe,
  getNoteMeta,
  isOnline,
  pendingSyncCount,
  syncingOffline,
  tempIdReconciliations
} = useNotes()

const sharedSectionExpanded = ref(true)

// ─── State ────────────────────────────────────────────────────────────────────

const selectedNoteId = ref<string | null>(
  typeof route.query.note === 'string' ? route.query.note : null
)
const activeView = ref<'editor' | 'graph' | 'trash'>('editor')
const noteViewOptions = [
  { label: 'Notas', value: 'editor', icon: 'i-lucide-file-text' },
  { label: 'Grafo', value: 'graph', icon: 'i-lucide-network' },
  { label: 'Lixeira', value: 'trash', icon: 'i-lucide-trash-2' }
]

useMobileContextNav().registerMobileContextNav('notes', noteViewOptions, activeView)

watch(activeView, (view) => {
  if (view === 'graph') {
    selectedNoteId.value = null
    refreshGraph()
  }

  if (view === 'trash') {
    selectedNoteId.value = null
    void fetchTrash()
  }
})

const createModalOpen = ref(false)
const noteEditorRef = ref<{
  isUnsaved: () => boolean
  doSave: (options?: { notifyOnFailure?: boolean }) => Promise<void>
  scrollToHeading: (blockId: string) => void
} | null>(null)

// Fire-and-forget on purpose — awaiting the full round trip here used to
// block navigation on every route change while a note was unsaved. The save
// is optimistic already (the header status is just cosmetic confirmation),
// so the risk worth guarding against isn't "did it save yet" but "did it
// fail after the user already left" — that's what notifyOnFailure covers.
onBeforeRouteLeave(() => {
  if (noteEditorRef.value?.isUnsaved()) {
    void noteEditorRef.value.doSave({ notifyOnFailure: true })
  }
})
const _sidebarTab = ref<'notes' | 'tags'>('notes')
const rightPanelOpen = useStorage('notes-right-panel-open', false)
const rightPanelView = useStorage<'outline' | 'properties' | null>('notes-right-panel-view', null)
const activeHeadingId = ref<string | null>(null)
// Shared breakpoint for the whole page's mobile layout — below it, the left
// sidebar and the main area (editor/graph/trash) take turns occupying the
// full width instead of squeezing side by side (which used to crush the
// editor down to a sliver on phone-width screens), and the right panel
// becomes a bottom sheet instead of a fixed-width column.
const isNotesMobileLayout = useMediaQuery('(max-width: 1023px)')
const showMobileMainArea = computed(() => activeView.value !== 'editor' || !!selectedNoteId.value)

function backToNotesListMobile() {
  selectedNoteId.value = null
  activeView.value = 'editor'
}
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
// Diagnostic only (see docs/notes/BUGS_AND_IMPROVEMENTS.md, item 11): reported
// as reproducing on a hard reload — the code here looks correct (noteSortOptions
// already has 'custom', useStorage's string serializer doesn't round-trip
// through JSON) and couldn't be confirmed by reading the code alone. If the
// persisted value ever doesn't match a known option, activeSortOption below
// silently falls back to the first one — wrong icon, no visible error. This
// logs the actual raw value so a real repro leaves evidence instead of just
// "the icon is wrong".
if (import.meta.client) {
  watch(noteSortMode, (value) => {
    if (!noteSortOptions.some(option => option.value === value)) {
      console.warn('[notes] notes-sort-mode value does not match any known option', JSON.stringify(value))
    }
  }, { immediate: true })
}

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
const _typeFilterModel = computed({
  get: () => filters.type || ALL_TYPE_VALUE,
  set: (v: string) => {
    filters.type = v === ALL_TYPE_VALUE ? '' : v
  }
})
const _typeFilterOptions = computed(() => [
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
      // Pin priority outranks manual position — among pinned notes, order by
      // when they were pinned (earliest first) instead of drag position, since
      // dragging is disabled for pinned notes.
      if (a.pinned) {
        return new Date(a.pinnedAt ?? a.createdAt).getTime() - new Date(b.pinnedAt ?? b.createdAt).getTime()
      }
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
  // `replace`, not `push` — this page keeps its own back/forward stack
  // (noteHistory/historyIndex below), so every note change shouldn't also
  // push a browser history entry on top of that.
  void router.replace({ query: { ...route.query, note: noteId ?? undefined } })
// `immediate` picks up a note id the page booted with (?note=<id>) — without
// it, this watcher only reacts to later changes and the initial selection
// from the URL would never actually load.
}, { immediate: true })

// Deep link to a specific block within the note the page booted with
// (?note=<id>#block-<blockId>) — the element only exists once the editor has
// rendered the note's content, which happens asynchronously, so poll briefly
// instead of assuming it's already in the DOM.
if (import.meta.client && route.hash.startsWith('#block-')) {
  const targetId = route.hash.slice(1)
  let attemptsLeft = 20
  const tryScroll = () => {
    const el = document.getElementById(targetId)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    attemptsLeft--
    if (attemptsLeft > 0) setTimeout(tryScroll, 150)
  }
  // Waits for the note itself to actually be loaded (not just for a loading
  // flag to flip once) — a cold page load can fail its first attempt and
  // succeed on retry (see fetchNoteDetail in useNotes.ts); tying this to
  // `currentNoteLoading`'s single true→false transition would consume its
  // one shot on that failed attempt and never scroll once the retry lands.
  const stopWatchingNoteDetail = watch(currentNoteDetail, (detail) => {
    if (!detail) return
    stopWatchingNoteDetail()
    setTimeout(tryScroll, 150)
  }, { immediate: true })
}

// A note created while offline is briefly identified by a temp-* id; if it's
// still selected once the mutation queue replays and the server hands back
// the real id, follow the selection so the editor doesn't go stale.
watch(() => tempIdReconciliations.size, () => {
  if (!selectedNoteId.value) return
  const realId = tempIdReconciliations.get(selectedNoteId.value)
  if (realId) selectedNoteId.value = realId
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
    const result: { level: number, text: string, blockId: string }[] = []
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
          const blockId = node.attrs?.blockId as string | undefined
          if (text && blockId)
            result.push({ level: (node.attrs?.level as number) ?? 1, text, blockId })
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

// ─── Right panel (Sumário / Propriedades) ─────────────────────────────────────

function onOpenPanel(view: 'outline' | 'properties'): void {
  rightPanelView.value = view
  rightPanelOpen.value = true
}

function onOutlineItemClick(blockId: string): void {
  noteEditorRef.value?.scrollToHeading(blockId)
}

function onActiveHeadingChange(blockId: string | null): void {
  activeHeadingId.value = blockId
}

// ─── History (back / forward) ─────────────────────────────────────────────────

const noteHistory = ref<string[]>([])
const historyIndex = ref(-1)

const canGoBack = computed(() => historyIndex.value > 0)
const canGoForward = computed(
  () => historyIndex.value < noteHistory.value.length - 1
)

// Also fire-and-forget (see onBeforeRouteLeave above) — switching to another
// note in the sidebar, or going back/forward, shouldn't wait on the network
// either.
async function saveCurrentNoteIfNeeded(): Promise<void> {
  if (noteEditorRef.value?.isUnsaved()) {
    void noteEditorRef.value.doSave({ notifyOnFailure: true })
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

async function onDuplicateNote(note: Note): Promise<void> {
  const created = await duplicateNote(note)
  if (created) await navigateTo(created.id)
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

function onReorderNote(noteId: string, beforePosition: number | null, afterPosition: number | null, folderId: string | null): void {
  void reorderNote(noteId, computePositionBetween(beforePosition, afterPosition), folderId)
}

function onReorderFolder(folderId: string, beforePosition: number | null, afterPosition: number | null): void {
  void reorderFolder(folderId, computePositionBetween(beforePosition, afterPosition))
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

function switchToTrash(): void {
  selectedNoteId.value = null
  activeView.value = 'trash'
  void fetchTrash()
}

async function onRestoreTrashItem(item: TrashItem): Promise<void> {
  // Both restoreNote/restoreFolder already sync the local store on success —
  // see useNotes.ts.
  if (item.kind === 'note') await restoreNote(item.id)
  else await restoreFolder(item.id)
}

async function onPermanentDeleteTrashItem(item: TrashItem): Promise<void> {
  if (item.kind === 'note') {
    await permanentlyDeleteNote(item.id)
  } else {
    await permanentlyDeleteFolder(item.id)
  }
}

// Bulk actions run every item with { silent: true, skipRefresh: true } (see
// useNotes.ts) so a batch of N doesn't show N toasts or trigger N redundant
// refetches — one combined refresh and one summary toast instead.
async function refreshAfterBulkTrashAction(): Promise<void> {
  refreshGraph()
  refreshNotes()
  await Promise.all([refreshFolders(), refreshAllNotes(), fetchTrash()])
}

function summarizeBulkResult(action: string, succeeded: number, failed: number): void {
  if (failed === 0) {
    toast.add({
      title: succeeded === 1 ? `1 item ${action}` : `${succeeded} itens ${action}`,
      color: 'success'
    })
    return
  }

  toast.add({
    title: succeeded === 0 ? 'Falha na operação' : 'Operação parcial',
    description: `${succeeded} com sucesso, ${failed} falharam.`,
    color: succeeded > 0 ? 'warning' : 'error'
  })
}

async function onBulkRestoreTrashItems(items: TrashItem[]): Promise<void> {
  if (items.length === 0) return

  const results = await Promise.all(items.map(item =>
    item.kind === 'note'
      ? restoreNote(item.id, { silent: true, skipRefresh: true })
      : restoreFolder(item.id, { silent: true, skipRefresh: true })
  ))

  await refreshAfterBulkTrashAction()
  summarizeBulkResult('restaurado(s)', results.filter(Boolean).length, results.filter(r => !r).length)
}

async function onBulkPermanentDeleteTrashItems(items: TrashItem[]): Promise<void> {
  if (items.length === 0) return

  const results = await Promise.all(items.map(item =>
    item.kind === 'note'
      ? permanentlyDeleteNote(item.id, { silent: true })
      : permanentlyDeleteFolder(item.id, { silent: true, skipRefresh: true })
  ))

  await refreshAfterBulkTrashAction()
  summarizeBulkResult('excluído(s) permanentemente', results.filter(Boolean).length, results.filter(r => !r).length)
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

async function onSetNoteVisibility(noteId: string, visibility: NoteVisibility): Promise<boolean> {
  const updated = await setNoteVisibility(noteId, visibility)
  if (updated && currentNoteDetail.value?.id === noteId) {
    currentNoteDetail.value = { ...currentNoteDetail.value, ...updated }
  }
  return !!updated
}

async function onRegenerateShareLink(noteId: string): Promise<Note | null> {
  const updated = await regenerateShareLink(noteId)
  if (updated && currentNoteDetail.value?.id === noteId) {
    currentNoteDetail.value = { ...currentNoteDetail.value, ...updated }
  }
  return updated
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
      <!-- Mirrors the real mobile layout below (isNotesMobileLayout /
           showMobileMainArea): one pane at a time on mobile, not both
           squeezed side by side like this used to render unconditionally. -->
      <div
        v-if="notesListInitialLoading"
        class="flex h-full"
      >
        <!-- Sidebar skeleton -->
        <div
          v-if="!isNotesMobileLayout || !showMobileMainArea"
          class="shrink-0 flex flex-col h-full border-r border-default w-full lg:w-(--notes-sidebar-width)"
          :style="{ '--notes-sidebar-width': sidebarWidth + 'px' }"
        >
          <div class="px-3 border-b border-default flex items-center h-14 gap-2 lg:h-9 lg:gap-1">
            <USkeleton
              v-for="i in 5"
              :key="i"
              class="rounded-md size-10 lg:size-7"
            />
          </div>
          <div class="flex-1 p-2 space-y-1">
            <USkeleton
              v-for="i in 10"
              :key="i"
              class="w-full rounded-lg h-11 lg:h-9"
            />
          </div>
        </div>
        <!-- Main area skeleton -->
        <div
          v-if="!isNotesMobileLayout || showMobileMainArea"
          class="flex-1 flex flex-col gap-3 max-w-3xl px-4 py-6 lg:px-16 lg:py-10"
        >
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
        <!-- Below isNotesMobileLayout, the sidebar and the main area take turns at
             full width instead of splitting the screen — a fixed/resizable pixel
             width for the sidebar left almost nothing for the editor on phones. -->
        <div
          v-if="!isNotesMobileLayout || !showMobileMainArea"
          class="shrink-0 flex flex-col h-full relative w-full lg:w-(--notes-sidebar-width)"
          :style="{ '--notes-sidebar-width': sidebarWidth + 'px' }"
        >
          <!-- Sidebar header — bigger touch targets on mobile (size="xs" is
               fine for a mouse, too small to tap reliably on a phone; the
               UButton `size` prop itself has no CSS-only equivalent, so this
               one still needs the JS breakpoint check). -->
          <div class="px-3 border-b border-default flex items-center justify-center h-14 lg:h-9">
            <div class="flex items-center justify-center gap-2 lg:gap-1">
              <UTooltip text="Nova nota">
                <UButton
                  icon="i-lucide-square-pen"
                  :size="isNotesMobileLayout ? 'lg' : 'xs'"
                  variant="ghost"
                  color="neutral"
                  :loading="creatingQuickNote"
                  @click="onQuickCreateNote()"
                />
              </UTooltip>

              <UTooltip text="Nova pasta">
                <UButton
                  icon="i-lucide-folder-plus"
                  :size="isNotesMobileLayout ? 'lg' : 'xs'"
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
                    :size="isNotesMobileLayout ? 'lg' : 'xs'"
                    variant="ghost"
                    color="neutral"
                  />
                </UTooltip>
              </UDropdownMenu>

              <UTooltip text="Buscar">
                <UButton
                  icon="i-lucide-search"
                  :size="isNotesMobileLayout ? 'lg' : 'xs'"
                  variant="ghost"
                  color="neutral"
                  @click="openNotesSearch"
                />
              </UTooltip>

              <div class="hidden lg:contents">
                <UTooltip
                  :text="activeView === 'graph' ? 'Abrir editor' : 'Abrir grafo'"
                >
                  <UButton
                    :icon="
                      activeView === 'graph'
                        ? 'i-lucide-file-text'
                        : 'i-lucide-network'
                    "
                    :size="isNotesMobileLayout ? 'lg' : 'xs'"
                    variant="ghost"
                    :color="activeView === 'graph' ? 'primary' : 'neutral'"
                    @click="
                      activeView === 'graph'
                        ? (activeView = 'editor')
                        : switchToGraph()
                    "
                  />
                </UTooltip>

                <UTooltip
                  :text="activeView === 'trash' ? 'Abrir editor' : 'Lixeira'"
                >
                  <UButton
                    icon="i-lucide-trash-2"
                    :size="isNotesMobileLayout ? 'lg' : 'xs'"
                    variant="ghost"
                    :color="activeView === 'trash' ? 'primary' : 'neutral'"
                    @click="
                      activeView === 'trash'
                        ? (activeView = 'editor')
                        : switchToTrash()
                    "
                  />
                </UTooltip>
              </div>
            </div>
          </div>

          <!-- Offline / pending sync indicator -->
          <div
            v-if="!isOnline || pendingSyncCount > 0"
            class="flex items-center gap-1.5 px-3 py-1.5 text-xs border-b border-default/50 shrink-0"
            :class="!isOnline ? 'text-warning bg-warning/5' : 'text-muted'"
          >
            <UIcon
              :name="!isOnline ? 'i-lucide-cloud-off' : syncingOffline ? 'i-lucide-loader-2' : 'i-lucide-cloud-upload'"
              class="size-3.5 shrink-0"
              :class="syncingOffline ? 'animate-spin' : ''"
            />
            <span v-if="!isOnline">Offline — as alterações serão sincronizadas ao reconectar</span>
            <span v-else-if="syncingOffline">Sincronizando alterações offline...</span>
            <span v-else>{{ pendingSyncCount }} alteração(ões) pendente(s) de sincronização</span>
          </div>

          <!-- Sidebar content -->
          <div class="flex-1 overflow-y-auto">
            <div
              v-if="sharedWithMe && sharedWithMe.length > 0"
              class="border-b border-default/50 shrink-0"
            >
              <button
                type="button"
                class="w-full flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted hover:text-highlighted transition-colors"
                @click="sharedSectionExpanded = !sharedSectionExpanded"
              >
                <UIcon
                  name="i-lucide-chevron-right"
                  class="size-3 shrink-0 transition-transform"
                  :class="sharedSectionExpanded ? 'rotate-90' : ''"
                />
                <UIcon name="i-lucide-users" class="size-3.5 shrink-0" />
                <span class="flex-1 text-left">Compartilhadas comigo</span>
                <UBadge color="neutral" variant="subtle" size="sm">
                  {{ sharedWithMe.length }}
                </UBadge>
              </button>
              <ul v-if="sharedSectionExpanded" class="pb-2">
                <li
                  v-for="sharedNote in sharedWithMe"
                  :key="sharedNote.id"
                >
                  <button
                    type="button"
                    class="w-full flex items-center gap-2 mx-1 px-2 py-1.5 rounded-md text-xs transition-colors"
                    :class="selectedNoteId === sharedNote.id ? 'bg-elevated text-highlighted' : 'text-muted hover:bg-elevated hover:text-highlighted'"
                    style="width: calc(100% - 0.5rem)"
                    @click="onSelectNote(sharedNote.id)"
                  >
                    <span
                      v-if="sharedNote.icon"
                      class="text-sm leading-none shrink-0"
                    >{{ sharedNote.icon }}</span>
                    <UIcon
                      v-else
                      :name="getNoteMeta(sharedNote.type).icon"
                      class="size-3.5 shrink-0"
                      :class="`text-${getNoteMeta(sharedNote.type).color}-500`"
                    />
                    <span class="truncate flex-1 text-left">{{ sharedNote.title || 'Sem título' }}</span>
                    <UIcon
                      v-if="sharedNote.permission === 'view'"
                      name="i-lucide-eye"
                      class="size-3 text-dimmed shrink-0"
                    />
                  </button>
                </li>
              </ul>
            </div>

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
              @duplicate="onDuplicateNote"
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

          <!-- Resize handle — hidden (not unmounted) on mobile, where the
               sidebar is always full-width; a hidden element doesn't receive
               the mousedown that would trigger startResize, so this is safe
               without a JS guard. -->
          <div
            class="hidden lg:block absolute right-0 top-0 h-full w-1 cursor-col-resize border-r border-default hover:border-primary transition-colors z-10"
            @mousedown.prevent="startResize"
          />
        </div>

        <!-- ── Main area (navbar + editor + right panel) ──────────────────────────── -->
        <div
          v-if="!isNotesMobileLayout || showMobileMainArea"
          class="flex-1 flex flex-col h-full min-w-0"
        >
          <!-- Mobile-only: back to the sidebar (folder tree / notes list) —
               also carries the current note's title/icon, since the
               editor's own breadcrumb is hidden on mobile (see NoteEditor.vue). -->
          <div class="flex lg:hidden items-center h-9 px-2 border-b border-default/50 shrink-0 gap-1 min-w-0">
            <UButton
              label="Notas"
              icon="i-lucide-arrow-left"
              size="xs"
              variant="ghost"
              color="neutral"
              class="shrink-0"
              @click="backToNotesListMobile"
            />
            <template v-if="activeView === 'editor' && currentNoteDetail">
              <UIcon name="i-lucide-chevron-right" class="size-3 text-dimmed shrink-0" />
              <span class="flex items-center gap-1 text-xs font-medium text-highlighted min-w-0 truncate">
                <span v-if="currentNoteDetail.icon" class="leading-none shrink-0">{{ currentNoteDetail.icon }}</span>
                <span class="truncate">{{ currentNoteDetail.title || 'Sem título' }}</span>
              </span>
            </template>
          </div>

          <!-- Content: editor + right panel -->
          <div class="flex-1 flex overflow-hidden">
            <!-- Graph or Editor -->
            <div class="flex-1 overflow-hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  :key="activeView"
                  class="h-full"
                  :initial="{ opacity: 0 }"
                  :animate="{ opacity: 1 }"
                  :exit="{ opacity: 0 }"
                  :transition="{ duration: 0.15 }"
                >
                  <NotesGraphView
                    v-if="activeView === 'graph'"
                    :graph-data="graphData ?? null"
                    :loading="graphStatus === 'pending' && !graphData"
                    @select-note="onGraphSelectNote"
                  />

                  <NotesTrashView
                    v-else-if="activeView === 'trash'"
                    :items="trashItems"
                    :loading="trashStatus === 'pending'"
                    @restore="onRestoreTrashItem"
                    @permanent-delete="onPermanentDeleteTrashItem"
                    @bulk-restore="onBulkRestoreTrashItems"
                    @bulk-permanent-delete="onBulkPermanentDeleteTrashItems"
                  />

                  <NotesNoteEditor
                    v-else
                    ref="noteEditorRef"
                    :note-id="selectedNoteId"
                    :note="currentNoteDetail"
                    :loading="currentNoteLoading"
                    :folders="sortedVisibleFolders"
                    :available-notes="editorAvailableNotes"
                    :is-online="isOnline"
                    :outline="outline"
                    :update-note="onUpdateNote"
                    :delete-note="onDeleteNoteById"
                    :link-notes="onLinkNotes"
                    :unlink-notes="onUnlinkNotes"
                    :set-note-visibility="onSetNoteVisibility"
                    :regenerate-share-link="onRegenerateShareLink"
                    :fetch-note-shares="fetchNoteShares"
                    :add-note-share="addNoteShare"
                    :update-note-share="updateNoteShare"
                    :remove-note-share="removeNoteShare"
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
                    @open-panel="onOpenPanel"
                    @active-heading-change="onActiveHeadingChange"
                  />
                </motion.div>
              </AnimatePresence>
            </div>

            <!-- Right panel: Sumário / Propriedades (desktop only — mobile uses the drawer below) -->
            <AnimatePresence>
              <motion.div
                v-if="rightPanelOpen && rightPanelView && !isNotesMobileLayout"
                :key="rightPanelView"
                class="w-80 shrink-0 h-full border-l border-default flex flex-col overflow-hidden"
                :initial="{ opacity: 0, x: 16 }"
                :animate="{ opacity: 1, x: 0 }"
                :exit="{ opacity: 0, x: 16 }"
                :transition="{ duration: 0.15 }"
              >
                <div class="flex items-center justify-between h-9 px-3 border-b border-default/50 shrink-0">
                  <span class="text-xs font-medium text-highlighted">
                    {{ rightPanelView === 'outline' ? 'Sumário' : 'Propriedades' }}
                  </span>
                  <UButton
                    icon="i-lucide-x"
                    size="xs"
                    variant="ghost"
                    color="neutral"
                    @click="rightPanelOpen = false"
                  />
                </div>
                <div class="flex-1 overflow-y-auto">
                  <NotesNoteRightPanelBody
                    :view="rightPanelView"
                    :outline="outline"
                    :active-heading-id="activeHeadingId"
                    :note="currentNoteDetail"
                    :tags="tags"
                    :note-type-options="noteTypeOptions"
                    :update-note="onUpdateNote"
                    :create-tag="createTag"
                    :update-tag="updateTag"
                    :delete-tag="deleteTag"
                    @click-outline-item="onOutlineItemClick"
                    @updated="onPropertiesUpdated"
                    @navigate-note="onNavigateNote"
                  />
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Right panel: bottom sheet on mobile -->
  <UDrawer
    v-if="isNotesMobileLayout"
    :open="rightPanelOpen && !!rightPanelView"
    direction="bottom"
    :title="rightPanelView === 'outline' ? 'Sumário' : 'Propriedades'"
    @update:open="(value: boolean) => { rightPanelOpen = value }"
  >
    <template #body>
      <div class="max-h-[70vh] overflow-y-auto">
        <NotesNoteRightPanelBody
          :view="rightPanelView"
          :outline="outline"
          :active-heading-id="activeHeadingId"
          :note="currentNoteDetail"
          :tags="tags"
          :note-type-options="noteTypeOptions"
          :update-note="onUpdateNote"
          :create-tag="createTag"
          :update-tag="updateTag"
          :delete-tag="deleteTag"
          @click-outline-item="onOutlineItemClick"
          @updated="onPropertiesUpdated"
          @navigate-note="onNavigateNote"
        />
      </div>
    </template>
  </UDrawer>

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
