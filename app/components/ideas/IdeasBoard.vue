<script setup lang="ts">
import type { Idea } from '~/types/ideas'
import { IDEA_STATUS_META, IdeaStatus } from '~/types/ideas'
import { formatDisplay } from '#shared/utils/dateTime'

const props = defineProps<{
  ideas: Idea[]
  loading: boolean
}>()

const emit = defineEmits<{
  'select': [idea: Idea]
  'update-status': [id: string, status: IdeaStatus]
  'create': []
}>()

const { getPriorityMeta } = useIdeas()

// Group ideas by status
const columns = computed(() => {
  const boardStatuses = [IdeaStatus.Backlog, IdeaStatus.Todo, IdeaStatus.InProgress, IdeaStatus.Done]
  return boardStatuses.map(status => ({
    status,
    meta: IDEA_STATUS_META[status],
    ideas: props.ideas.filter(i => i.status === status)
  }))
})

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  return formatDisplay(dateStr, "dd 'de' MMM'.'")
}

function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === 'done') return false
  return new Date(dueDate) < new Date()
}

// ─── Drag & Drop ──────────────────────────────────────────────────────────────

const draggedIdea = ref<Idea | null>(null)
const dragOverColumn = ref<IdeaStatus | null>(null)

function onDragStart(e: DragEvent, idea: Idea): void {
  draggedIdea.value = idea
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', idea.id)
  }
}

function onDragOver(e: DragEvent, status: IdeaStatus): void {
  e.preventDefault()
  dragOverColumn.value = status
}

function onDragLeave(): void {
  dragOverColumn.value = null
}

function onDrop(e: DragEvent, status: IdeaStatus): void {
  e.preventDefault()
  dragOverColumn.value = null
  if (draggedIdea.value && draggedIdea.value.status !== status) {
    emit('update-status', draggedIdea.value.id, status)
  }
  draggedIdea.value = null
}

function onDragEnd(): void {
  draggedIdea.value = null
  dragOverColumn.value = null
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Loading -->
    <div v-if="loading" class="flex gap-4 p-4 overflow-x-auto">
      <div v-for="i in 4" :key="i" class="w-72 shrink-0 space-y-2">
        <USkeleton class="h-8 w-full" />
        <USkeleton v-for="j in 3" :key="j" class="h-24 w-full" />
      </div>
    </div>

    <!-- Board -->
    <div v-else class="flex gap-4 p-4 overflow-x-auto flex-1">
      <div
        v-for="col in columns"
        :key="col.status"
        class="w-72 shrink-0 flex flex-col rounded-lg bg-elevated/50"
        :class="dragOverColumn === col.status ? 'ring-2 ring-primary' : ''"
        @dragover="(e: DragEvent) => onDragOver(e, col.status)"
        @dragleave="onDragLeave"
        @drop="(e: DragEvent) => onDrop(e, col.status)"
      >
        <!-- Column header -->
        <div class="flex items-center justify-between px-3 py-2 border-b border-default">
          <div class="flex items-center gap-2">
            <UIcon
              :name="col.meta.icon"
              :class="`text-${col.meta.color}-500`"
              class="size-4"
            />
            <span class="text-sm font-semibold text-highlighted">{{ col.meta.label }}</span>
            <UBadge size="xs" color="neutral" variant="subtle">
              {{ col.ideas.length }}
            </UBadge>
          </div>
          <UButton
            v-if="col.status === IdeaStatus.Backlog || col.status === IdeaStatus.Todo"
            icon="i-lucide-plus"
            size="xs"
            variant="ghost"
            @click="emit('create')"
          />
        </div>

        <!-- Cards -->
        <div class="flex-1 overflow-y-auto p-2 space-y-2">
          <div
            v-for="idea in col.ideas"
            :key="idea.id"
            class="rounded-lg border border-default bg-default p-3 cursor-pointer hover:border-primary/50 transition-all group"
            :class="idea.status === 'done' ? 'opacity-60' : ''"
            draggable="true"
            @dragstart="(e: DragEvent) => onDragStart(e, idea)"
            @dragend="onDragEnd"
            @click="emit('select', idea)"
          >
            <!-- Title -->
            <p
              class="text-sm font-medium mb-1"
              :class="idea.status === 'done' ? 'line-through text-muted' : 'text-highlighted'"
            >
              {{ idea.title }}
            </p>

            <!-- Meta row -->
            <div class="flex flex-wrap items-center gap-1.5 mt-2">
              <!-- Priority -->
              <UBadge
                v-if="getPriorityMeta(idea.priority)"
                size="xs"
                :color="getPriorityMeta(idea.priority)!.color"
                variant="subtle"
              >
                <UIcon :name="getPriorityMeta(idea.priority)!.icon" class="size-2.5" />
              </UBadge>

              <!-- Due date -->
              <span
                v-if="idea.dueDate"
                class="text-xs"
                :class="isOverdue(idea.dueDate, idea.status) ? 'text-error font-medium' : 'text-muted'"
              >
                <UIcon name="i-lucide-calendar" class="size-3 inline mr-0.5" />
                {{ formatDate(idea.dueDate) }}
              </span>

              <!-- Subtasks -->
              <span v-if="(idea.subtaskCount ?? 0) > 0" class="text-xs text-muted">
                <UIcon name="i-lucide-check-square" class="size-3 inline mr-0.5" />
                {{ idea.subtaskDoneCount }}/{{ idea.subtaskCount }}
              </span>

              <!-- Tags -->
              <UBadge
                v-for="tag in (idea.tags ?? []).slice(0, 2)"
                :key="tag.id"
                size="xs"
                color="neutral"
                variant="subtle"
              >
                #{{ tag.name }}
              </UBadge>
            </div>

            <!-- List -->
            <div v-if="idea.list" class="mt-2">
              <span class="text-xs text-muted">
                <UIcon name="i-lucide-folder" class="size-3 inline mr-0.5" />
                {{ idea.list.name }}
              </span>
            </div>
          </div>

          <!-- Empty column -->
          <div v-if="col.ideas.length === 0" class="py-8 text-center">
            <p class="text-xs text-muted">
              Vazio
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
