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
  'pin': [note: Note]
  'delete': [note: Note]
  'move-to-folder': [noteId: string, folderId: string | null]
  'rename-folder': [folderId: string, name: string]
  'delete-folder': [folderId: string]
}>()

// ─── Folder state ──────────────────────────────────────────────────────────────

const expandedFolders = ref<Set<string>>(new Set(props.folders.map(f => f.id)))
const editingFolderId = ref<string | null>(null)
const editingName = ref('')
const editInput = ref<HTMLInputElement | null>(null)

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

// ─── Helpers ───────────────────────────────────────────────────────────────────

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))

function getTypeMeta(type: string) {
  return NOTE_TYPE_META[type as NoteType] ?? NOTE_TYPE_META[NoteType.Note]
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

const hasFolders = computed(() => props.folders.length > 0)
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Loading skeleton -->
    <div v-if="loading" class="space-y-2 p-2">
      <USkeleton v-for="i in 6" :key="i" class="h-10 w-full" />
    </div>

    <template v-else>
      <!-- Folders section -->
      <div v-if="hasFolders" class="shrink-0">
        <!-- Folder rows -->
        <div
          v-for="folder in folders"
          :key="folder.id"
          class="group/folder"
        >
          <!-- Folder header (drop target) -->
          <div
            class="flex items-center gap-1 px-2 py-1.5 rounded-lg mx-1 transition-colors cursor-pointer select-none"
            :class="dragOverFolderId === folder.id
              ? 'bg-primary/15 ring-1 ring-primary/40'
              : 'hover:bg-elevated/80'"
            @click="toggleFolder(folder.id)"
            @dragover.prevent="onFolderDragOver(folder.id, $event)"
            @dragleave="onFolderDragLeave(folder.id, $event)"
            @drop.prevent="onFolderDrop(folder.id, $event)"
          >
            <UIcon
              :name="expandedFolders.has(folder.id) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
              class="size-3 text-muted shrink-0 transition-transform"
            />
            <UIcon
              :name="expandedFolders.has(folder.id) ? 'i-lucide-folder-open' : 'i-lucide-folder'"
              class="size-3.5 shrink-0"
              :class="dragOverFolderId === folder.id ? 'text-primary' : 'text-amber-500'"
            />

            <!-- Inline rename -->
            <input
              v-if="editingFolderId === folder.id"
              ref="editInput"
              v-model="editingName"
              class="flex-1 text-xs font-medium bg-transparent outline-none border-b border-primary"
              @blur="commitEdit(folder.id)"
              @keydown.enter.prevent="commitEdit(folder.id)"
              @keydown.escape.prevent="editingFolderId = null"
              @click.stop
            />
            <span v-else class="flex-1 text-xs font-medium text-highlighted truncate">
              {{ folder.name }}
            </span>

            <span class="text-xs text-dimmed shrink-0 tabular-nums">
              {{ (notesByFolder.get(folder.id) ?? []).length }}
            </span>

            <!-- Folder context menu -->
            <UDropdownMenu
              :items="[[
                { label: 'Renomear', icon: 'i-lucide-pencil', onSelect: () => startEdit(folder) },
                { label: 'Excluir pasta', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('delete-folder', folder.id) }
              ]]"
              @click.stop
            >
              <UButton
                icon="i-lucide-ellipsis-vertical"
                color="neutral"
                variant="ghost"
                size="xs"
                class="opacity-0 group-hover/folder:opacity-100 shrink-0"
                @click.stop
              />
            </UDropdownMenu>
          </div>

          <!-- Notes inside folder -->
          <div v-if="expandedFolders.has(folder.id)" class="pl-5">
            <div
              v-if="(notesByFolder.get(folder.id) ?? []).length === 0"
              class="px-3 py-1.5 text-xs text-dimmed italic"
            >
              Pasta vazia — arraste notas aqui
            </div>
            <button
              v-for="note in notesByFolder.get(folder.id) ?? []"
              :key="note.id"
              draggable="true"
              class="w-full text-left rounded-lg px-2 py-1.5 transition-colors hover:bg-elevated/80 group cursor-grab active:cursor-grabbing"
              :class="{ 'bg-elevated ring-1 ring-primary/30': selectedId === note.id }"
              @click="emit('select', note)"
              @dragstart="onNoteDragStart(note, $event)"
            >
              <div class="flex items-center gap-2 min-w-0">
                <UIcon
                  :name="getTypeMeta(note.type).icon"
                  class="size-3.5 shrink-0"
                  :class="`text-${getTypeMeta(note.type).color}-500`"
                />
                <p class="text-xs font-medium truncate flex-1 text-highlighted">{{ note.title || 'Sem título' }}</p>
                <span class="text-xs text-dimmed shrink-0">{{ formatDate(note.updatedAt) }}</span>
              </div>
            </button>
          </div>
        </div>

        <!-- Divider before root notes -->
        <div
          v-if="rootNotes.length > 0 || dragOverRoot"
          class="flex items-center gap-2 px-3 py-1 mt-1 transition-colors"
          :class="dragOverRoot ? 'bg-primary/5' : ''"
          @dragover.prevent="onRootDragOver"
          @dragleave="onRootDragLeave"
          @drop.prevent="onRootDrop"
        >
          <div class="flex-1 h-px bg-border" />
          <span class="text-xs text-dimmed shrink-0">Sem pasta</span>
          <div class="flex-1 h-px bg-border" />
        </div>
      </div>

      <!-- Root notes (no folder, or all notes when no folders exist) -->
      <div
        class="flex-1 overflow-y-auto"
        :class="hasFolders ? '' : ''"
        @dragover.prevent="hasFolders ? onRootDragOver($event) : undefined"
        @dragleave="hasFolders ? onRootDragLeave($event) : undefined"
        @drop.prevent="hasFolders ? onRootDrop($event) : undefined"
      >
        <!-- Empty state -->
        <div
          v-if="!hasFolders && notes.length === 0"
          class="flex flex-col items-center justify-center py-12 gap-3 px-4"
        >
          <UIcon name="i-lucide-file-text" class="size-12 text-dimmed" />
          <p class="text-sm text-muted text-center">Nenhuma nota encontrada</p>
          <UButton icon="i-lucide-plus" label="Criar nota" size="sm" @click="emit('new-note')" />
        </div>

        <div v-else class="space-y-0.5 p-1">
          <button
            v-for="note in hasFolders ? rootNotes : notes"
            :key="note.id"
            draggable="true"
            class="w-full text-left rounded-lg px-3 py-2.5 transition-colors hover:bg-elevated/80 group cursor-grab active:cursor-grabbing"
            :class="{ 'bg-elevated ring-1 ring-primary/30': selectedId === note.id }"
            @click="emit('select', note)"
            @dragstart="onNoteDragStart(note, $event)"
          >
            <div class="flex items-start gap-2">
              <UIcon
                :name="getTypeMeta(note.type).icon"
                class="size-4 mt-0.5 shrink-0"
                :class="`text-${getTypeMeta(note.type).color}-500`"
              />
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5">
                  <UIcon v-if="note.pinned" name="i-lucide-pin" class="size-3 text-primary shrink-0" />
                  <p class="text-sm font-medium truncate">{{ note.title }}</p>
                </div>
                <div class="flex items-center gap-2 mt-0.5">
                  <span class="text-xs text-muted">{{ formatDate(note.updatedAt) }}</span>
                  <UBadge v-if="(note.linkCount ?? 0) > 0" size="xs" color="primary" variant="subtle">
                    <UIcon name="i-lucide-link" class="size-2.5 mr-0.5" />
                    {{ note.linkCount }}
                  </UBadge>
                </div>
                <div v-if="note.tags && note.tags.length > 0" class="flex flex-wrap gap-1 mt-1">
                  <UBadge v-for="tag in note.tags.slice(0, 3)" :key="tag.id" size="xs" color="neutral" variant="subtle">
                    #{{ tag.name }}
                  </UBadge>
                  <UBadge v-if="note.tags.length > 3" size="xs" color="neutral" variant="subtle">
                    +{{ note.tags.length - 3 }}
                  </UBadge>
                </div>
              </div>
              <UDropdownMenu
                :items="[[
                  { label: note.pinned ? 'Desafixar' : 'Fixar', icon: 'i-lucide-pin', onSelect: () => emit('pin', note) },
                  { label: 'Excluir', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('delete', note) }
                ]]"
              >
                <UButton
                  icon="i-lucide-ellipsis-vertical"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  class="opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </UDropdownMenu>
            </div>
          </button>
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
</template>
