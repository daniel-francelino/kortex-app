<script setup lang="ts">
import type { KnowledgeNote } from '~/types/knowledge'
import { NOTE_TYPE_META, NoteType } from '~/types/knowledge'

const props = defineProps<{
  notes: KnowledgeNote[]
  total: number
  page: number
  pageSize: number
  loading: boolean
  selectedId?: string | null
}>()

const emit = defineEmits<{
  'update:page': [page: number]
  'select': [note: KnowledgeNote]
  'new-note': []
  'pin': [note: KnowledgeNote]
  'delete': [note: KnowledgeNote]
}>()

function onDragStart(note: KnowledgeNote, e: DragEvent) {
  e.dataTransfer?.setData('application/x-knowledge-note-id', note.id)
  e.dataTransfer?.setData('text/plain', note.title)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'link'
}

const totalPages = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)))

function getTypeMeta(type: string) {
  return NOTE_TYPE_META[type as NoteType] ?? NOTE_TYPE_META[NoteType.Note]
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Loading skeleton -->
    <div v-if="loading" class="space-y-2 p-2">
      <USkeleton v-for="i in 8" :key="i" class="h-14 w-full" />
    </div>

    <!-- Empty state -->
    <div v-else-if="notes.length === 0" class="flex flex-col items-center justify-center py-12 gap-3 px-4">
      <UIcon name="i-lucide-file-text" class="size-12 text-dimmed" />
      <p class="text-sm text-muted text-center">
        Nenhuma nota encontrada
      </p>
      <UButton
        icon="i-lucide-plus"
        label="Criar nota"
        size="sm"
        @click="emit('new-note')"
      />
    </div>

    <!-- Notes list -->
    <div v-else class="flex-1 overflow-y-auto">
      <div class="space-y-0.5 p-1">
        <button
          v-for="note in notes"
          :key="note.id"
          draggable="true"
          class="w-full text-left rounded-lg px-3 py-2.5 transition-colors hover:bg-elevated/80 group cursor-grab active:cursor-grabbing"
          :class="{ 'bg-elevated ring-1 ring-primary/30': selectedId === note.id }"
          @click="emit('select', note)"
          @dragstart="onDragStart(note, $event)"
        >
          <div class="flex items-start gap-2">
            <UIcon
              :name="getTypeMeta(note.type).icon"
              class="size-4 mt-0.5 shrink-0"
              :class="`text-${getTypeMeta(note.type).color}-500`"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <UIcon
                  v-if="note.pinned"
                  name="i-lucide-pin"
                  class="size-3 text-primary shrink-0"
                />
                <p class="text-sm font-medium truncate">
                  {{ note.title }}
                </p>
              </div>
              <div class="flex items-center gap-2 mt-0.5">
                <span class="text-xs text-muted">{{ formatDate(note.updatedAt) }}</span>
                <UBadge
                  v-if="(note.linkCount ?? 0) > 0"
                  size="xs"
                  color="primary"
                  variant="subtle"
                >
                  <UIcon name="i-lucide-link" class="size-2.5 mr-0.5" />
                  {{ note.linkCount }}
                </UBadge>
                <UBadge
                  v-if="(note.backlinkCount ?? 0) > 0"
                  size="xs"
                  color="info"
                  variant="subtle"
                >
                  <UIcon name="i-lucide-corner-down-left" class="size-2.5 mr-0.5" />
                  {{ note.backlinkCount }}
                </UBadge>
              </div>
              <div v-if="note.tags && note.tags.length > 0" class="flex flex-wrap gap-1 mt-1">
                <UBadge
                  v-for="tag in note.tags.slice(0, 3)"
                  :key="tag.id"
                  size="xs"
                  color="neutral"
                  variant="subtle"
                >
                  #{{ tag.name }}
                </UBadge>
                <UBadge
                  v-if="note.tags.length > 3"
                  size="xs"
                  color="neutral"
                  variant="subtle"
                >
                  +{{ note.tags.length - 3 }}
                </UBadge>
              </div>
            </div>
            <UDropdownMenu
              :items="[
                [
                  { label: note.pinned ? 'Desafixar' : 'Fixar', icon: 'i-lucide-pin', onSelect: () => emit('pin', note) },
                  { label: 'Excluir', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => emit('delete', note) }
                ]
              ]"
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

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="flex justify-center py-3 border-t border-default">
        <UPagination
          :model-value="page"
          :total="total"
          :items-per-page="pageSize"
          @update:model-value="emit('update:page', $event)"
        />
      </div>
    </div>
  </div>
</template>
