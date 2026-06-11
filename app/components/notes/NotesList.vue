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
}>()

// ─── Folder state ──────────────────────────────────────────────────────────────

const expandedFolders = ref<Set<string>>(new Set(props.folders.map(f => f.id)))
const editingFolderId = ref<string | null>(null)
const editingName = ref('')
const editInput = ref<HTMLInputElement | null>(null)
const editingNoteId = ref<string | null>(null)
const editingNoteTitle = ref('')
const noteEditInput = ref<HTMLInputElement | null>(null)

watch(() => props.folders, (folders) => {
  for (const f of folders) {
    if (!expandedFolders.value.has(f.id)) expandedFolders.value.add(f.id)
  }
}, { deep: true })

function toggleFolder(id: string) {
  if (expandedFolders.value.has(id)) expandedFolders.value.delete(id)
  else expandedFolders.value.add(id)
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

// ─── Drag & drop ───────────────────────────────────────────────────────────────

const dragOverFolderId = ref<string | null>(null)
const dragOverRoot = ref(false)

function onNoteDragStart(note: Note, e: DragEvent) {
  e.dataTransfer?.setData('application/x-notes-note-id', note.id)
  e.dataTransfer?.setData('text/plain', note.title)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onFolderDragOver(folderId: string, e: DragEvent) {
  if (e.dataTransfer?.types.includes('application/x-notes-note-id')) {
    dragOverFolderId.value = folderId
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  }
}

function onFolderDragLeave(folderId: string, e: DragEvent) {
  const target = e.currentTarget as Element
  if (!e.relatedTarget || !target.contains(e.relatedTarget as Node)) {
    if (dragOverFolderId.value === folderId) dragOverFolderId.value = null
  }
}

function onFolderDrop(folderId: string, e: DragEvent) {
  e.stopPropagation()
  dragOverFolderId.value = null
  const noteId = e.dataTransfer?.getData('application/x-notes-note-id')
  if (noteId) emit('move-to-folder', noteId, folderId)
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

// ─── Unified flat list ─────────────────────────────────────────────────────────

type ListRow =
  | { kind: 'folder'; folder: NoteFolder; depth: number }
  | { kind: 'note'; note: Note; depth: number }

const flatList = computed<ListRow[]>(() => {
  const result: ListRow[] = []

  function addFolderWithChildren(parentId: string | null, depth: number) {
    const children = [...props.folders]
      .filter(f => f.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }))

    for (const folder of children) {
      result.push({ kind: 'folder', folder, depth })
      if (expandedFolders.value.has(folder.id)) {
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
                  class="group/folder-row flex items-center gap-1 pr-1 py-1.5 rounded-lg mx-1 transition-colors cursor-pointer select-none"
                  :style="{ paddingLeft: `${0.5 + row.depth}rem` }"
                  :class="dragOverFolderId === row.folder.id
                    ? 'bg-primary/15 ring-1 ring-primary/40'
                    : 'hover:bg-elevated/80'"
                  @click="toggleFolder(row.folder.id)"
                  @dragover.prevent.stop="onFolderDragOver(row.folder.id, $event)"
                  @dragleave="onFolderDragLeave(row.folder.id, $event)"
                  @drop.prevent.stop="onFolderDrop(row.folder.id, $event)"
                >
                  <UIcon
                    :name="expandedFolders.has(row.folder.id) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                    class="size-3 text-muted shrink-0 transition-transform"
                  />
                  <UIcon
                    :name="expandedFolders.has(row.folder.id) ? 'i-lucide-folder-open' : 'i-lucide-folder'"
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
                  :class="{ 'bg-elevated ring-1 ring-primary/30': selectedId === row.note.id }"
                  @click="emit('select', row.note)"
                  @dragstart="onNoteDragStart(row.note, $event)"
                  @drop.prevent.stop
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
