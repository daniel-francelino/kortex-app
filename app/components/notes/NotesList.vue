<script setup lang="ts">
import type { Note, NoteFolder } from '~/types/notes'
import { NOTE_TYPE_META, NoteType } from '~/types/notes'

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
  'delete': [note: Note]
  'move-to-folder': [noteId: string, folderId: string | null]
  'rename-note': [noteId: string, title: string]
  'rename-folder': [folderId: string, name: string]
  'delete-folder': [folderId: string]
  'new-note-in-folder': [folderId: string]
  'new-subfolder': [parentFolderId: string]
  'toggle-folder': [folderId: string, isExpanded: boolean]
  'reorder-note': [noteId: string, beforeId: string | null, afterId: string | null]
  'reorder-folder': [folderId: string, beforeId: string | null, afterId: string | null]
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

function startEdit(folder: NoteFolder) {
  editingFolderId.value = folder.id
  editingName.value = folder.name
  nextTick(() => editInput.value?.select())
}

function commitEdit(folderId: string) {
  const name = editingName.value.trim()
  if (name) emit('rename-folder', folderId, name)
  editingFolderId.value = null
}

function startEditNote(note: Note) {
  editingNoteId.value = note.id
  editingNoteTitle.value = note.title
  nextTick(() => noteEditInput.value?.select())
}

function commitNoteEdit(noteId: string) {
  const title = editingNoteTitle.value.trim()
  if (title) emit('rename-note', noteId, title)
  editingNoteId.value = null
}

function folderActionItems(folder: NoteFolder) {
  return [[
    { label: 'Nova nota', icon: 'i-lucide-file-plus', onSelect: () => emit('new-note-in-folder', folder.id) },
    { label: 'Nova pasta', icon: 'i-lucide-folder-plus', onSelect: () => emit('new-subfolder', folder.id) },
    { label: 'Renomear', icon: 'i-lucide-pencil', onSelect: () => startEdit(folder) },
    { label: 'Excluir pasta', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('delete-folder', folder.id) }
  ]]
}

function noteActionItems(note: Note) {
  return [[
    { label: 'Renomear', icon: 'i-lucide-pencil', onSelect: () => startEditNote(note) },
    { label: note.pinned ? 'Desafixar' : 'Fixar', icon: 'i-lucide-pin', onSelect: () => emit('pin', note) },
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

const rootNotes = computed(() => notesByFolder.value.get(null) ?? [])
const hasFolders = computed(() => props.folders.length > 0)
const isCustomSort = computed(() => props.sortMode === 'custom')

// ─── Drag & drop ───────────────────────────────────────────────────────────────

const dragOverFolderId = ref<string | null>(null)
const dragOverRoot = ref(false)
const dragOverRowKey = ref<string | null>(null)
const dragOverRowEdge = ref<'top' | 'bottom' | null>(null)

function clearRowDragState() {
  dragOverRowKey.value = null
  dragOverRowEdge.value = null
}

function edgeForEvent(e: DragEvent): 'top' | 'bottom' {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  return (e.clientY - rect.top) < rect.height / 2 ? 'top' : 'bottom'
}

function onNoteDragStart(note: Note, e: DragEvent) {
  e.dataTransfer?.setData('application/x-notes-note-id', note.id)
  e.dataTransfer?.setData('text/plain', note.title)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onFolderDragStart(folder: NoteFolder, e: DragEvent) {
  if (!isCustomSort.value) return
  e.dataTransfer?.setData('application/x-notes-folder-id', folder.id)
  e.dataTransfer?.setData('text/plain', folder.name)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onFolderDragOver(folderId: string, folder: NoteFolder, e: DragEvent) {
  if (e.dataTransfer?.types.includes('application/x-notes-note-id')) {
    dragOverFolderId.value = folderId
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
    if (dragOverRowKey.value === `f-${folderId}`) clearRowDragState()
  }
}

function onFolderDrop(folderId: string, folder: NoteFolder, e: DragEvent) {
  e.stopPropagation()

  const noteId = e.dataTransfer?.getData('application/x-notes-note-id')
  if (noteId) {
    dragOverFolderId.value = null
    emit('move-to-folder', noteId, folderId)
    return
  }

  const draggedFolderId = e.dataTransfer?.getData('application/x-notes-folder-id')
  if (draggedFolderId && isCustomSort.value) {
    const edge = dragOverRowEdge.value
    clearRowDragState()
    if (draggedFolderId === folderId || !edge) return

    const siblings = [...props.folders]
      .filter(f => f.parentId === folder.parentId && f.id !== draggedFolderId)
      .sort((a, b) => a.position - b.position)
    const targetIndex = siblings.findIndex(f => f.id === folderId)
    if (targetIndex === -1) return

    const insertAt = edge === 'top' ? targetIndex : targetIndex + 1
    const beforeId = siblings[insertAt - 1]?.id ?? null
    const afterId = siblings[insertAt]?.id ?? null
    emit('reorder-folder', draggedFolderId, beforeId, afterId)
  }
}

function onNoteRowDragOver(note: Note, e: DragEvent) {
  if (!isCustomSort.value) return
  if (!e.dataTransfer?.types.includes('application/x-notes-note-id')) return
  dragOverRowKey.value = `n-${note.id}`
  dragOverRowEdge.value = edgeForEvent(e)
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

function onNoteRowDragLeave(note: Note, e: DragEvent) {
  const target = e.currentTarget as Element
  if (!e.relatedTarget || !target.contains(e.relatedTarget as Node)) {
    if (dragOverRowKey.value === `n-${note.id}`) clearRowDragState()
  }
}

function onNoteRowDrop(note: Note, e: DragEvent) {
  e.stopPropagation()
  const draggedId = e.dataTransfer?.getData('application/x-notes-note-id')
  const edge = dragOverRowEdge.value
  clearRowDragState()
  if (!isCustomSort.value || !draggedId || draggedId === note.id || !edge) return

  const siblings = (notesByFolder.value.get(note.folderId ?? null) ?? []).filter(n => n.id !== draggedId)
  const targetIndex = siblings.findIndex(n => n.id === note.id)
  if (targetIndex === -1) return // dragged from a different folder — handled by move-to-folder instead

  const insertAt = edge === 'top' ? targetIndex : targetIndex + 1
  const beforeId = siblings[insertAt - 1]?.id ?? null
  const afterId = siblings[insertAt]?.id ?? null
  emit('reorder-note', draggedId, beforeId, afterId)
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

  function compareFolders(a: NoteFolder, b: NoteFolder): number {
    if (isCustomSort.value) return a.position - b.position
    return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
  }

  function addFolderWithChildren(parentId: string | null, depth: number) {
    const children = [...props.folders]
      .filter(f => f.parentId === parentId)
      .sort(compareFolders)

    for (const folder of children) {
      result.push({ kind: 'folder', folder, depth })
      if (folder.isExpanded) {
        for (const note of notesByFolder.value.get(folder.id) ?? []) {
          result.push({ kind: 'note', note, depth: depth + 1 })
        }
        addFolderWithChildren(folder.id, depth + 1)
      }
    }
  }

  if (hasFolders.value) {
    addFolderWithChildren(null, 0)
    for (const note of rootNotes.value) {
      result.push({ kind: 'note', note, depth: 0 })
    }
  } else {
    for (const note of props.notes) {
      result.push({ kind: 'note', note, depth: 0 })
    }
  }

  return result
})

// ─── Helpers ───────────────────────────────────────────────────────────────────

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))

function getTypeMeta(type: string) {
  return NOTE_TYPE_META[type as NoteType] ?? NOTE_TYPE_META[NoteType.Note]
}
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
        <div class="flex-1 min-h-0 overflow-y-auto">
          <div class="p-1 space-y-0.5">
            <template
              v-for="row in flatList"
              :key="row.kind === 'folder' ? `f-${row.folder.id}` : `n-${row.note.id}`"
            >
              <!-- ── Folder row ── -->
              <UContextMenu v-if="row.kind === 'folder'" :items="folderActionItems(row.folder)">
                <div
                  draggable="true"
                  class="group/folder-row flex items-center gap-1 pr-1 py-1.5 rounded-lg mx-1 transition-colors cursor-pointer select-none"
                  :style="{ paddingLeft: `${0.5 + row.depth}rem` }"
                  :class="[
                    dragOverFolderId === row.folder.id
                      ? 'bg-primary/15 ring-1 ring-primary/40'
                      : 'hover:bg-elevated/80',
                    dragOverRowKey === `f-${row.folder.id}` && dragOverRowEdge === 'top' ? 'border-t-2 border-primary' : 'border-t-2 border-transparent',
                    dragOverRowKey === `f-${row.folder.id}` && dragOverRowEdge === 'bottom' ? 'border-b-2 border-primary' : 'border-b-2 border-transparent'
                  ]"
                  @click="toggleFolder(row.folder)"
                  @dragstart="onFolderDragStart(row.folder, $event)"
                  @dragover.prevent.stop="onFolderDragOver(row.folder.id, row.folder, $event)"
                  @dragleave="onFolderDragLeave(row.folder.id, $event)"
                  @drop.prevent.stop="onFolderDrop(row.folder.id, row.folder, $event)"
                  @dragend="clearRowDragState"
                >
                  <UIcon
                    :name="row.folder.isExpanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                    class="size-3 text-muted shrink-0 transition-transform"
                  />
                  <UIcon
                    :name="row.folder.isExpanded ? 'i-lucide-folder-open' : 'i-lucide-folder'"
                    class="size-3.5 shrink-0"
                    :class="dragOverFolderId === row.folder.id ? 'text-primary' : 'text-amber-500'"
                  />

                  <input
                    v-if="editingFolderId === row.folder.id"
                    ref="editInput"
                    v-model="editingName"
                    class="flex-1 text-xs font-medium bg-transparent outline-none border-b border-primary"
                    @blur="commitEdit(row.folder.id)"
                    @keydown.enter.prevent="commitEdit(row.folder.id)"
                    @keydown.escape.prevent="editingFolderId = null"
                    @click.stop
                  >
                  <span v-else class="flex-1 text-xs font-medium text-highlighted truncate">
                    {{ row.folder.name }}
                  </span>

                  <UDropdownMenu :items="folderActionItems(row.folder)" @click.stop>
                    <UButton
                      icon="i-lucide-ellipsis-vertical"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      class="opacity-0 group-hover/folder-row:opacity-100 transition-opacity shrink-0"
                      @click.stop
                    />
                  </UDropdownMenu>
                </div>
              </UContextMenu>

              <!-- ── Note row ── -->
              <UContextMenu v-else :items="noteActionItems(row.note)">
                <button
                  draggable="true"
                  class="group/note w-full cursor-grab rounded-lg py-1.5 pr-1 text-left transition-colors hover:bg-elevated/80 active:cursor-grabbing"
                  :style="{ paddingLeft: `${0.5 + row.depth}rem` }"
                  :class="[
                    { 'bg-elevated ring-1 ring-primary/30': selectedId === row.note.id },
                    dragOverRowKey === `n-${row.note.id}` && dragOverRowEdge === 'top' ? 'border-t-2 border-primary' : 'border-t-2 border-transparent',
                    dragOverRowKey === `n-${row.note.id}` && dragOverRowEdge === 'bottom' ? 'border-b-2 border-primary' : 'border-b-2 border-transparent'
                  ]"
                  @click="emit('select', row.note)"
                  @dragstart="onNoteDragStart(row.note, $event)"
                  @dragover.prevent.stop="onNoteRowDragOver(row.note, $event)"
                  @dragleave="onNoteRowDragLeave(row.note, $event)"
                  @drop.prevent.stop="onNoteRowDrop(row.note, $event)"
                  @dragend="clearRowDragState"
                >
                  <div class="flex items-center gap-2 min-w-0">
                    <span v-if="row.note.icon" class="text-sm leading-none shrink-0">{{ row.note.icon }}</span>
                    <UIcon
                      v-else
                      :name="getTypeMeta(row.note.type).icon"
                      class="size-3.5 shrink-0"
                      :class="`text-${getTypeMeta(row.note.type).color}-500`"
                    />
                    <input
                      v-if="editingNoteId === row.note.id"
                      ref="noteEditInput"
                      v-model="editingNoteTitle"
                      class="min-w-0 flex-1 bg-transparent text-xs font-medium text-highlighted outline-none border-b border-primary"
                      @blur="commitNoteEdit(row.note.id)"
                      @keydown.enter.prevent="commitNoteEdit(row.note.id)"
                      @keydown.escape.prevent="editingNoteId = null"
                      @click.stop
                    >
                    <p v-else class="text-xs font-medium truncate flex-1 text-highlighted">
                      {{ row.note.title || 'Sem título' }}
                    </p>
                    <UDropdownMenu :items="noteActionItems(row.note)" @click.stop>
                      <UButton
                        icon="i-lucide-ellipsis-vertical"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        class="opacity-0 group-hover/note:opacity-100 transition-opacity shrink-0"
                        @click.stop
                      />
                    </UDropdownMenu>
                  </div>
                </button>
              </UContextMenu>
            </template>
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
