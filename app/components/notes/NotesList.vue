<script setup lang="ts">
import { AnimatePresence, motion } from 'motion-v'
import type { Note, NoteFolder } from '~/types/notes'
import { MAX_FOLDER_DEPTH, NOTE_TYPE_META, NoteType, NoteVisibility } from '~/types/notes'

const props = defineProps<{
  notes: Note[]
  folders: NoteFolder[]
  total: number
  page: number
  pageSize: number
  loading: boolean
  selectedId?: string | null
  sortMode?: 'updated-desc' | 'updated-asc' | 'title-asc' | 'custom'
}>()

const emit = defineEmits<{
  'update:page': [page: number]
  'select': [note: Note]
  'new-note': []
  'new-folder': []
  'pin': [note: Note]
  'duplicate': [note: Note]
  'delete': [note: Note]
  'move-to-folder': [noteId: string, folderId: string | null]
  'rename-note': [noteId: string, title: string]
  'rename-folder': [folderId: string, name: string]
  'delete-folder': [folderId: string]
  'new-note-in-folder': [folderId: string]
  'new-subfolder': [parentFolderId: string]
  'toggle-folder': [folderId: string, isExpanded: boolean]
  'reorder-note': [noteId: string, beforePosition: number | null, afterPosition: number | null, folderId: string | null]
  'reorder-folder': [folderId: string, beforePosition: number | null, afterPosition: number | null]
}>()

// ─── Folder state ──────────────────────────────────────────────────────────────

const editingFolderId = ref<string | null>(null)
const editingName = ref('')
const editInput = ref<HTMLInputElement | null>(null)
const editingNoteId = ref<string | null>(null)
const editingNoteTitle = ref('')
const noteEditInput = ref<HTMLInputElement | null>(null)

function toggleFolder(folder: NoteFolder) {
  emit('toggle-folder', folder.id, !folder.isExpanded)
}

// Runs after nextTick's DOM patch *and* the next paint frame, so it wins over a
// dropdown/context menu returning focus to its trigger button when it closes.
function focusEditInput(el: HTMLInputElement | null) {
  if (!el) return
  el.focus()
  el.select()
}

function startEdit(folder: NoteFolder) {
  editingFolderId.value = folder.id
  editingName.value = folder.name
  nextTick(() => requestAnimationFrame(() => focusEditInput(editInput.value)))
}

function commitEdit(folderId: string) {
  const name = editingName.value.trim()
  if (name) emit('rename-folder', folderId, name)
  editingFolderId.value = null
}

function startEditNote(note: Note) {
  editingNoteId.value = note.id
  editingNoteTitle.value = note.title
  nextTick(() => requestAnimationFrame(() => focusEditInput(noteEditInput.value)))
}

function commitNoteEdit(noteId: string) {
  const title = editingNoteTitle.value.trim()
  if (title) emit('rename-note', noteId, title)
  editingNoteId.value = null
}

/** Depth of a folder within `props.folders` — a root-level folder (no parent) is depth 1. */
function folderDepth(folderId: string): number {
  let depth = 1
  let current = props.folders.find(f => f.id === folderId)
  const seen = new Set<string>()

  while (current?.parentId && !seen.has(current.id)) {
    seen.add(current.id)
    depth++
    current = props.folders.find(f => f.id === current!.parentId)
  }

  return depth
}

function folderActionItems(folder: NoteFolder) {
  const atMaxDepth = folderDepth(folder.id) >= MAX_FOLDER_DEPTH
  return [[
    { label: 'Nova nota', icon: 'i-lucide-file-plus', onSelect: () => emit('new-note-in-folder', folder.id) },
    {
      label: 'Nova pasta',
      icon: 'i-lucide-folder-plus',
      disabled: atMaxDepth,
      onSelect: () => emit('new-subfolder', folder.id)
    },
    { label: 'Renomear', icon: 'i-lucide-pencil', onSelect: () => startEdit(folder) },
    { label: 'Excluir pasta', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('delete-folder', folder.id) }
  ]]
}

function noteActionItems(note: Note) {
  return [[
    { label: 'Renomear', icon: 'i-lucide-pencil', onSelect: () => startEditNote(note) },
    { label: note.pinned ? 'Desafixar' : 'Fixar', icon: 'i-lucide-pin', onSelect: () => emit('pin', note) },
    { label: 'Duplicar', icon: 'i-lucide-copy-plus', onSelect: () => emit('duplicate', note) },
    { label: 'Excluir', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('delete', note) }
  ]]
}

const rootActionItems = computed(() => [[
  { label: 'Nova nota', icon: 'i-lucide-square-pen', onSelect: () => emit('new-note') },
  { label: 'Nova pasta', icon: 'i-lucide-folder-plus', onSelect: () => emit('new-folder') }
]])

// ─── Grouped notes ─────────────────────────────────────────────────────────────

const notesByFolder = computed(() => {
  const map = new Map<string | null, Note[]>()
  for (const note of props.notes) {
    const key = note.folderId ?? null
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(note)
  }
  return map
})

const hasFolders = computed(() => props.folders.length > 0)
const isCustomSort = computed(() => props.sortMode === 'custom')

// ─── Combined siblings (folders + notes sharing a parent) ──────────────────────
// In custom sort mode, folders and notes at the same level are ordered together
// by `position`, so they can be freely interleaved (folder, note, folder, ...).
// Outside custom mode, folders keep sorting as a block before notes, matching
// the conventional "folders first" listing.

type SiblingEntry
  = { kind: 'folder', folder: NoteFolder }
    | { kind: 'note', note: Note }

function siblingPosition(entry: SiblingEntry): number {
  return entry.kind === 'folder' ? entry.folder.position : entry.note.position
}

function siblingMatches(entry: SiblingEntry, kind: SiblingEntry['kind'], id: string): boolean {
  return entry.kind === kind && (entry.kind === 'folder' ? entry.folder.id : entry.note.id) === id
}

function isPinnedEntry(entry: SiblingEntry): boolean {
  return entry.kind === 'note' && entry.note.pinned
}

const siblingsByParent = computed(() => {
  const map = new Map<string | null, SiblingEntry[]>()
  const parentIds = new Set<string | null>([null])
  for (const f of props.folders) parentIds.add(f.parentId ?? null)
  for (const n of props.notes) parentIds.add(n.folderId ?? null)

  for (const parentId of parentIds) {
    const entries: SiblingEntry[] = [
      ...props.folders
        .filter(f => (f.parentId ?? null) === parentId)
        .map(folder => ({ kind: 'folder' as const, folder })),
      ...(notesByFolder.value.get(parentId) ?? [])
        .map(note => ({ kind: 'note' as const, note }))
    ]

    if (isCustomSort.value) {
      entries.sort((a, b) => {
        // Pin priority always outranks manual position, even over folders —
        // pinned notes float to the top of their level. Among pinned notes,
        // order by when they were pinned (dragging pinned notes is disabled,
        // so there's no manual position to fall back to).
        const aPinned = isPinnedEntry(a)
        const bPinned = isPinnedEntry(b)
        if (aPinned !== bPinned) return aPinned ? -1 : 1
        if (aPinned && bPinned && a.kind === 'note' && b.kind === 'note') {
          const aTime = new Date(a.note.pinnedAt ?? a.note.createdAt).getTime()
          const bTime = new Date(b.note.pinnedAt ?? b.note.createdAt).getTime()
          return aTime - bTime
        }
        return siblingPosition(a) - siblingPosition(b)
      })
    } else {
      entries.sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
        if (a.kind === 'folder' && b.kind === 'folder') {
          return a.folder.name.localeCompare(b.folder.name, 'pt-BR', { sensitivity: 'base' })
        }
        return 0 // notes: keep the order they arrived in (already sorted upstream)
      })
    }

    map.set(parentId, entries)
  }

  return map
})

/** Positions the neighboring siblings would end up at if `excludeKind`/`excludeId` were inserted at `edge` of `targetKind`/`targetId`.
 * Pinned notes are excluded — they don't participate in manual positioning, so their (unused) `position` value must not leak into
 * neighbor calculations for draggable siblings. */
function computeNeighborPositions(
  parentId: string | null,
  targetKind: SiblingEntry['kind'],
  targetId: string,
  excludeKind: SiblingEntry['kind'],
  excludeId: string,
  edge: 'top' | 'bottom'
): { before: number | null, after: number | null } | null {
  const siblings = (siblingsByParent.value.get(parentId) ?? [])
    .filter(entry => !isPinnedEntry(entry) && !siblingMatches(entry, excludeKind, excludeId))
  const targetIndex = siblings.findIndex(entry => siblingMatches(entry, targetKind, targetId))
  if (targetIndex === -1) return null

  const insertAt = edge === 'top' ? targetIndex : targetIndex + 1
  const beforeEntry = siblings[insertAt - 1]
  const afterEntry = siblings[insertAt]
  return {
    before: beforeEntry ? siblingPosition(beforeEntry) : null,
    after: afterEntry ? siblingPosition(afterEntry) : null
  }
}

// ─── Drag & drop ───────────────────────────────────────────────────────────────
// States surfaced to the UI at every step of a drag gesture:
//  idle -> dragging (source row) -> drag-over (target row/folder) -> drop -> reordered (layout animation)

const dragOverFolderId = ref<string | null>(null)
const dragOverRoot = ref(false)
const dragOverRowKey = ref<string | null>(null)
const dragOverRowEdge = ref<'top' | 'bottom' | null>(null)
const draggingKey = ref<string | null>(null)

function clearRowDragState() {
  dragOverRowKey.value = null
  dragOverRowEdge.value = null
  dragOverFolderId.value = null
  dragOverRoot.value = false
  draggingKey.value = null
  stopAutoScroll()
}

// ─── Auto-scroll while dragging near the top/bottom edge of the list ───────────
// Attached in the capture phase on the scroll container so it keeps seeing every
// dragover regardless of row-level handlers calling stopPropagation.

const scrollContainer = ref<HTMLElement | null>(null)
const autoScrollSpeed = ref(0)
let autoScrollRaf: number | null = null

const AUTO_SCROLL_EDGE = 56
const AUTO_SCROLL_MAX_SPEED = 16

function stepAutoScroll() {
  const el = scrollContainer.value
  if (el && autoScrollSpeed.value !== 0) {
    el.scrollTop += autoScrollSpeed.value
    autoScrollRaf = requestAnimationFrame(stepAutoScroll)
  } else {
    autoScrollRaf = null
  }
}

function updateAutoScroll(e: DragEvent) {
  const el = scrollContainer.value
  if (!el || el.scrollHeight <= el.clientHeight) {
    autoScrollSpeed.value = 0
    return
  }

  const rect = el.getBoundingClientRect()
  const distFromTop = e.clientY - rect.top
  const distFromBottom = rect.bottom - e.clientY

  if (distFromTop < AUTO_SCROLL_EDGE) {
    const intensity = 1 - Math.max(distFromTop, 0) / AUTO_SCROLL_EDGE
    autoScrollSpeed.value = -Math.ceil(intensity * AUTO_SCROLL_MAX_SPEED)
  } else if (distFromBottom < AUTO_SCROLL_EDGE) {
    const intensity = 1 - Math.max(distFromBottom, 0) / AUTO_SCROLL_EDGE
    autoScrollSpeed.value = Math.ceil(intensity * AUTO_SCROLL_MAX_SPEED)
  } else {
    autoScrollSpeed.value = 0
  }

  if (autoScrollSpeed.value !== 0 && autoScrollRaf === null) {
    autoScrollRaf = requestAnimationFrame(stepAutoScroll)
  }
}

function stopAutoScroll() {
  autoScrollSpeed.value = 0
  if (autoScrollRaf !== null) {
    cancelAnimationFrame(autoScrollRaf)
    autoScrollRaf = null
  }
}

function onScrollContainerDragLeave(e: DragEvent) {
  const target = e.currentTarget as Element
  if (!e.relatedTarget || !target.contains(e.relatedTarget as Node)) {
    stopAutoScroll()
  }
}

onBeforeUnmount(stopAutoScroll)

function edgeForEvent(e: DragEvent): 'top' | 'bottom' {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  return (e.clientY - rect.top) < rect.height / 2 ? 'top' : 'bottom'
}

const ROW_EDGE_ZONE = 8

/** Three-zone hit test for dropping onto a folder row: a thin top/bottom band means
 * "reorder as a sibling", the middle band means "move inside this folder". */
function zoneForEvent(e: DragEvent): 'top' | 'middle' | 'bottom' {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const y = e.clientY - rect.top
  if (y < ROW_EDGE_ZONE) return 'top'
  if (y > rect.height - ROW_EDGE_ZONE) return 'bottom'
  return 'middle'
}

function onNoteDragStart(note: Note, e: DragEvent) {
  if (note.pinned) return // pinned notes always stay at the top of their level — no manual reordering
  e.dataTransfer?.setData('application/x-notes-note-id', note.id)
  e.dataTransfer?.setData('text/plain', note.title)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  draggingKey.value = `n-${note.id}`
}

function onFolderDragStart(folder: NoteFolder, e: DragEvent) {
  if (!isCustomSort.value) return
  e.dataTransfer?.setData('application/x-notes-folder-id', folder.id)
  e.dataTransfer?.setData('text/plain', folder.name)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
  draggingKey.value = `f-${folder.id}`
}

function onFolderDragOver(folderId: string, folder: NoteFolder, e: DragEvent) {
  if (e.dataTransfer?.types.includes('application/x-notes-note-id')) {
    // In custom mode, a thin band at the top/bottom of the row means "position
    // as a sibling of this folder" instead of "move inside it" — same 3-zone
    // pattern as most file-manager sidebars.
    if (isCustomSort.value) {
      const zone = zoneForEvent(e)
      if (zone === 'middle') {
        dragOverFolderId.value = folderId
        dragOverRowKey.value = null
        dragOverRowEdge.value = null
      } else {
        dragOverFolderId.value = null
        dragOverRowKey.value = `f-${folderId}`
        dragOverRowEdge.value = zone
      }
    } else {
      dragOverFolderId.value = folderId
    }
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    return
  }
  if (isCustomSort.value && e.dataTransfer?.types.includes('application/x-notes-folder-id')) {
    dragOverRowKey.value = `f-${folderId}`
    dragOverRowEdge.value = edgeForEvent(e)
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  }
}

function onFolderDragLeave(folderId: string, e: DragEvent) {
  const target = e.currentTarget as Element
  if (!e.relatedTarget || !target.contains(e.relatedTarget as Node)) {
    if (dragOverFolderId.value === folderId) dragOverFolderId.value = null
    if (dragOverRowKey.value === `f-${folderId}`) {
      dragOverRowKey.value = null
      dragOverRowEdge.value = null
    }
  }
}

function onFolderDrop(folderId: string, folder: NoteFolder, e: DragEvent) {
  e.stopPropagation()
  const parentId = folder.parentId ?? null

  const noteId = e.dataTransfer?.getData('application/x-notes-note-id')
  if (noteId) {
    const droppedInMiddleZone = dragOverFolderId.value === folderId
    const edge = dragOverRowEdge.value
    clearRowDragState()

    if (!droppedInMiddleZone && isCustomSort.value && edge) {
      // Dropped on the thin top/bottom band — reposition the note as a sibling
      // of this folder instead of moving it inside.
      const result = computeNeighborPositions(parentId, 'folder', folderId, 'note', noteId, edge)
      if (result) {
        emit('reorder-note', noteId, result.before, result.after, parentId)
        return
      }
    }

    emit('move-to-folder', noteId, folderId)
    return
  }

  const draggedFolderId = e.dataTransfer?.getData('application/x-notes-folder-id')
  if (draggedFolderId && isCustomSort.value) {
    const edge = dragOverRowEdge.value
    clearRowDragState()
    if (draggedFolderId === folderId || !edge) return

    const draggedFolder = props.folders.find(f => f.id === draggedFolderId)
    if (!draggedFolder || (draggedFolder.parentId ?? null) !== parentId) return // different parent — reordering doesn't reparent

    const result = computeNeighborPositions(parentId, 'folder', folderId, 'folder', draggedFolderId, edge)
    if (result) emit('reorder-folder', draggedFolderId, result.before, result.after)
  }
}

function onNoteRowDragOver(note: Note, e: DragEvent) {
  if (!isCustomSort.value || note.pinned) return // pinned notes aren't a valid reorder target — their order isn't position-based
  const isNoteDrag = e.dataTransfer?.types.includes('application/x-notes-note-id')
  const isFolderDrag = e.dataTransfer?.types.includes('application/x-notes-folder-id')
  if (!isNoteDrag && !isFolderDrag) return
  dragOverRowKey.value = `n-${note.id}`
  dragOverRowEdge.value = edgeForEvent(e)
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

function onNoteRowDragLeave(note: Note, e: DragEvent) {
  const target = e.currentTarget as Element
  if (!e.relatedTarget || !target.contains(e.relatedTarget as Node)) {
    if (dragOverRowKey.value === `n-${note.id}`) {
      dragOverRowKey.value = null
      dragOverRowEdge.value = null
    }
  }
}

function onNoteRowDrop(note: Note, e: DragEvent) {
  e.stopPropagation()
  const draggedNoteId = e.dataTransfer?.getData('application/x-notes-note-id')
  const draggedFolderId = e.dataTransfer?.getData('application/x-notes-folder-id')
  const edge = dragOverRowEdge.value
  clearRowDragState()
  if (!isCustomSort.value || !edge || note.pinned) return

  // Always target the folder the drop actually landed in — dropping something
  // from outside onto a row inside a folder moves it there *and* positions it
  // there, in one gesture. Dropping within the same folder just repositions it.
  const targetParentId = note.folderId ?? null

  if (draggedNoteId && draggedNoteId !== note.id) {
    const result = computeNeighborPositions(targetParentId, 'note', note.id, 'note', draggedNoteId, edge)
    if (result) emit('reorder-note', draggedNoteId, result.before, result.after, targetParentId)
    return
  }

  if (draggedFolderId) {
    const draggedFolder = props.folders.find(f => f.id === draggedFolderId)
    if (!draggedFolder || (draggedFolder.parentId ?? null) !== targetParentId) return // different parent — reordering doesn't reparent

    const result = computeNeighborPositions(targetParentId, 'note', note.id, 'folder', draggedFolderId, edge)
    if (result) emit('reorder-folder', draggedFolderId, result.before, result.after)
  }
}

function onRootDragOver(e: DragEvent) {
  if (e.dataTransfer?.types.includes('application/x-notes-note-id')) {
    dragOverRoot.value = true
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  }
}

function onRootDragLeave(e: DragEvent) {
  const target = e.currentTarget as Element
  if (!e.relatedTarget || !target.contains(e.relatedTarget as Node)) {
    dragOverRoot.value = false
  }
}

function onRootDrop(e: DragEvent) {
  dragOverRoot.value = false
  const noteId = e.dataTransfer?.getData('application/x-notes-note-id')
  if (noteId) emit('move-to-folder', noteId, null)
}

// ─── Unified flat list ─────────────────────────────────────────────────────────

type ListRow
  = | { kind: 'folder', folder: NoteFolder, depth: number }
    | { kind: 'note', note: Note, depth: number }

const flatList = computed<ListRow[]>(() => {
  const result: ListRow[] = []

  function addChildren(parentId: string | null, depth: number) {
    for (const entry of siblingsByParent.value.get(parentId) ?? []) {
      if (entry.kind === 'folder') {
        result.push({ kind: 'folder', folder: entry.folder, depth })
        if (entry.folder.isExpanded) {
          addChildren(entry.folder.id, depth + 1)
        }
      } else {
        result.push({ kind: 'note', note: entry.note, depth })
      }
    }
  }

  addChildren(null, 0)

  return result
})

// ─── Helpers ───────────────────────────────────────────────────────────────────

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))

function getTypeMeta(type: string) {
  return NOTE_TYPE_META[type as NoteType] ?? NOTE_TYPE_META[NoteType.Note]
}

function getVisibilityMeta(note: Note) {
  if (note.visibility === NoteVisibility.Public) return { icon: 'i-lucide-globe', tooltip: 'Nota pública' }
  if (note.visibility === NoteVisibility.Shared) return { icon: 'i-lucide-users', tooltip: 'Nota compartilhada' }
  return null
}

const rowEnter = { opacity: 0, y: -6, height: 0 }
const rowExit = { opacity: 0, height: 0, transition: { duration: 0.1, ease: 'easeIn' } }
const rowTransition = { duration: 0.12, ease: 'easeOut' }
</script>

<template>
  <UContextMenu :items="rootActionItems" class="flex flex-col h-full min-h-0">
    <div
      class="flex flex-col h-full min-h-0 transition-colors"
      :class="dragOverRoot && hasFolders ? 'bg-primary/5' : ''"
      @dragover.prevent="hasFolders ? onRootDragOver($event) : undefined"
      @dragleave="hasFolders ? onRootDragLeave($event) : undefined"
      @drop.prevent="hasFolders ? onRootDrop($event) : undefined"
    >
      <!-- Loading skeleton -->
      <div v-if="loading" class="space-y-2 p-2">
        <USkeleton v-for="i in 6" :key="i" class="h-10 w-full" />
      </div>

      <template v-else>
        <div
          ref="scrollContainer"
          class="flex-1 min-h-0 overflow-y-auto"
          @dragover.capture="updateAutoScroll"
          @dragleave.capture="onScrollContainerDragLeave"
          @drop.capture="stopAutoScroll"
        >
          <div class="p-1 space-y-0.5">
            <AnimatePresence>
              <template
                v-for="row in flatList"
                :key="row.kind === 'folder' ? `f-${row.folder.id}` : `n-${row.note.id}`"
              >
                <!-- ── Folder row ── -->
                <UContextMenu v-if="row.kind === 'folder'" :items="folderActionItems(row.folder)">
                  <motion.div
                    layout="position"
                    :initial="rowEnter"
                    :animate="{
                      opacity: draggingKey === `f-${row.folder.id}` ? 0.45 : 1,
                      y: 0,
                      height: 'auto',
                      scale: draggingKey === `f-${row.folder.id}` ? 0.97 : 1
                    }"
                    :exit="rowExit"
                    :transition="rowTransition"
                    :draggable="isCustomSort"
                    class="group/folder-row relative flex items-center w-full gap-1 rounded-lg mx-1 transition-colors cursor-pointer select-none"
                    :style="{ paddingLeft: `${0.25 + row.depth * 0.75}rem` }"
                    :class="[
                      'py-2.5 pr-3 lg:py-1.5 lg:pr-1',
                      dragOverFolderId === row.folder.id
                        ? 'bg-primary/15 ring-1 ring-primary/40'
                        : 'hover:bg-elevated/80'
                    ]"
                    @click="toggleFolder(row.folder)"
                    @dblclick.stop="startEdit(row.folder)"
                    @dragstart="onFolderDragStart(row.folder, $event)"
                    @dragover.prevent.stop="onFolderDragOver(row.folder.id, row.folder, $event)"
                    @dragleave="onFolderDragLeave(row.folder.id, $event)"
                    @drop.prevent.stop="onFolderDrop(row.folder.id, row.folder, $event)"
                    @dragend="clearRowDragState"
                  >
                    <!-- Drop indicator (reorder target) -->
                    <AnimatePresence>
                      <motion.div
                        v-if="dragOverRowKey === `f-${row.folder.id}`"
                        class="absolute left-1 right-1 h-0.5 rounded-full bg-primary origin-left pointer-events-none"
                        :class="dragOverRowEdge === 'top' ? '-top-px' : '-bottom-px'"
                        :initial="{ scaleX: 0, opacity: 0 }"
                        :animate="{ scaleX: 1, opacity: 1 }"
                        :exit="{ scaleX: 0, opacity: 0 }"
                        :transition="{ duration: 0.12 }"
                      />
                    </AnimatePresence>

                    <motion.div
                      class="shrink-0 flex items-center"
                      :animate="{ rotate: row.folder.isExpanded ? 90 : 0 }"
                      :transition="{ duration: 0.15 }"
                    >
                      <UIcon name="i-lucide-chevron-right" class="text-muted size-4 lg:size-3" />
                    </motion.div>
                    <motion.div
                      class="shrink-0 flex items-center"
                      :animate="{ scale: dragOverFolderId === row.folder.id ? 1.15 : 1 }"
                      :transition="{ duration: 0.15 }"
                    >
                      <UIcon
                        :name="row.folder.isExpanded ? 'i-lucide-folder-open' : 'i-lucide-folder'"
                        class="shrink-0 size-4 lg:size-3.5"
                        :class="dragOverFolderId === row.folder.id ? 'text-primary' : 'text-amber-500'"
                      />
                    </motion.div>

                    <input
                      v-if="editingFolderId === row.folder.id"
                      ref="editInput"
                      v-model="editingName"
                      class="flex-1 font-medium bg-transparent outline-none border-b border-primary text-sm lg:text-xs"
                      @blur="commitEdit(row.folder.id)"
                      @keydown.enter.prevent="commitEdit(row.folder.id)"
                      @keydown.escape.prevent="editingFolderId = null"
                      @click.stop
                      @dblclick.stop
                    >
                    <span v-else class="flex-1 font-medium text-highlighted truncate text-sm lg:text-xs">
                      {{ row.folder.name }}
                    </span>

                    <UDropdownMenu :items="folderActionItems(row.folder)" @click.stop>
                      <UButton
                        icon="i-lucide-ellipsis-vertical"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        class="transition-opacity shrink-0 opacity-100 lg:opacity-0 lg:group-hover/folder-row:opacity-100"
                        @click.stop
                      />
                    </UDropdownMenu>
                  </motion.div>
                </UContextMenu>

                <!-- ── Note row ── -->
                <UContextMenu v-else :items="noteActionItems(row.note)">
                  <motion.button
                    layout="position"
                    :initial="rowEnter"
                    :animate="{
                      opacity: draggingKey === `n-${row.note.id}` ? 0.45 : 1,
                      y: 0,
                      height: 'auto',
                      scale: draggingKey === `n-${row.note.id}` ? 0.97 : 1
                    }"
                    :exit="rowExit"
                    :transition="rowTransition"
                    :draggable="!row.note.pinned"
                    class="group/note relative w-full rounded-lg text-left transition-colors hover:bg-elevated/80 flex items-center gap-1"
                    :style="{ paddingLeft: `${0.25 + row.depth * 0.75}rem` }"
                    :class="[
                      'py-2.5 pr-3 lg:py-1.5 lg:pr-1',
                      { 'bg-elevated ring-1 ring-primary/30': selectedId === row.note.id },
                      row.note.pinned ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
                    ]"
                    @click="emit('select', row.note)"
                    @dblclick.stop="startEditNote(row.note)"
                    @dragstart="onNoteDragStart(row.note, $event)"
                    @dragover.prevent.stop="onNoteRowDragOver(row.note, $event)"
                    @dragleave="onNoteRowDragLeave(row.note, $event)"
                    @drop.prevent.stop="onNoteRowDrop(row.note, $event)"
                    @dragend="clearRowDragState"
                  >
                    <!-- Drop indicator (reorder target) -->
                    <AnimatePresence>
                      <motion.div
                        v-if="dragOverRowKey === `n-${row.note.id}`"
                        class="absolute left-1 right-1 h-0.5 rounded-full bg-primary origin-left pointer-events-none"
                        :class="dragOverRowEdge === 'top' ? '-top-px' : '-bottom-px'"
                        :initial="{ scaleX: 0, opacity: 0 }"
                        :animate="{ scaleX: 1, opacity: 1 }"
                        :exit="{ scaleX: 0, opacity: 0 }"
                        :transition="{ duration: 0.12 }"
                      />
                    </AnimatePresence>

                    <!-- Chevron-width spacer so the note icon lines up with folder icons at the same depth -->
                    <span class="shrink-0 size-4 lg:size-3" />

                    <div class="flex items-center gap-2 min-w-0 flex-1">
                      <span v-if="row.note.icon" class="text-sm leading-none shrink-0">{{ row.note.icon }}</span>
                      <UIcon
                        v-else
                        :name="getTypeMeta(row.note.type).icon"
                        class="shrink-0 size-4 lg:size-3.5"
                        :class="`text-${getTypeMeta(row.note.type).color}-500`"
                      />
                      <input
                        v-if="editingNoteId === row.note.id"
                        ref="noteEditInput"
                        v-model="editingNoteTitle"
                        class="min-w-0 flex-1 bg-transparent font-medium text-highlighted outline-none border-b border-primary text-sm lg:text-xs"
                        @blur="commitNoteEdit(row.note.id)"
                        @keydown.enter.prevent="commitNoteEdit(row.note.id)"
                        @keydown.escape.prevent="editingNoteId = null"
                        @click.stop
                        @dblclick.stop
                      >
                      <p v-else class="font-medium truncate flex-1 text-highlighted text-sm lg:text-xs">
                        {{ row.note.title || 'Sem título' }}
                      </p>
                      <AnimatePresence>
                        <motion.div
                          v-if="row.note.pinned"
                          class="shrink-0 flex items-center"
                          :initial="{ opacity: 0, scale: 0.5 }"
                          :animate="{ opacity: 1, scale: 1 }"
                          :exit="{ opacity: 0, scale: 0.5 }"
                          :transition="{ duration: 0.15 }"
                        >
                          <UTooltip text="Nota fixada">
                            <UIcon name="i-lucide-pin" class="size-3 text-primary" />
                          </UTooltip>
                        </motion.div>
                      </AnimatePresence>
                      <UTooltip
                        v-if="getVisibilityMeta(row.note)"
                        :text="getVisibilityMeta(row.note)!.tooltip"
                      >
                        <UIcon
                          :name="getVisibilityMeta(row.note)!.icon"
                          class="size-3 text-dimmed shrink-0"
                        />
                      </UTooltip>
                      <UDropdownMenu :items="noteActionItems(row.note)" @click.stop>
                        <UButton
                          icon="i-lucide-ellipsis-vertical"
                          color="neutral"
                          variant="ghost"
                          size="xs"
                          class="transition-opacity shrink-0 opacity-100 lg:opacity-0 lg:group-hover/note:opacity-100"
                          @click.stop
                        />
                      </UDropdownMenu>
                    </div>
                  </motion.button>
                </UContextMenu>
              </template>
            </AnimatePresence>
          </div>

          <!-- Pagination (only when not in folder mode) -->
          <div v-if="!hasFolders && totalPages > 1" class="flex justify-center py-3 border-t border-default">
            <UPagination
              :model-value="page"
              :total="total"
              :items-per-page="pageSize"
              @update:model-value="emit('update:page', $event)"
            />
          </div>
        </div>
      </template>
    </div>
  </UContextMenu>
</template>
