<script setup lang="ts">
import type { Task } from '~/types/tasks'
import { TaskStatus } from '~/types/tasks'
import { formatDisplay } from '#shared/utils/dateTime'

const _props = defineProps<{
  tasks: Task[]
  total: number
  page: number
  pageSize: number
  loading: boolean
}>()

const emit = defineEmits<{
  'update:page': [value: number]
  'select': [taskId: string]
  'edit': [task: Task]
  'archive': [task: Task]
  'complete': [task: Task]
}>()

const { getPriorityLabel, getPriorityColor, getStatusLabel, getStatusColor, isOverdue } = useTasks()

function getRowItems(task: Task) {
  const items = [
    {
      label: 'Editar',
      icon: 'i-lucide-pencil',
      onSelect: () => emit('edit', task)
    }
  ]

  if (task.status !== TaskStatus.Completed) {
    items.push({
      label: 'Concluir',
      icon: 'i-lucide-check-circle',
      onSelect: () => emit('complete', task)
    })
  }

  items.push({
    label: 'Arquivar',
    icon: 'i-lucide-archive',
    onSelect: () => emit('archive', task)
  })

  return items
}

function formatDueDate(dateStr: string): string {
  return formatDisplay(new Date(dateStr + 'T00:00:00'), "dd 'de' MMM'.'")
}
</script>

<template>
  <div class="space-y-4">
    <!-- Loading skeletons -->
    <template v-if="loading">
      <UCard v-for="i in 6" :key="i">
        <div class="flex items-center gap-3">
          <div class="flex-1 space-y-2">
            <USkeleton class="h-4 w-2/3" />
            <USkeleton class="h-3 w-1/3" />
          </div>
          <USkeleton class="h-5 w-16 rounded-full" />
          <USkeleton class="h-5 w-14 rounded-full" />
        </div>
      </UCard>
    </template>

    <!-- Tasks list -->
    <template v-else-if="tasks.length > 0">
      <UCard
        v-for="task in tasks"
        :key="task.id"
        class="cursor-pointer transition-colors hover:bg-elevated/50"
        @click="emit('select', task.id)"
      >
        <div class="flex items-center gap-3">
          <!-- Completion indicator -->
          <div class="shrink-0">
            <UIcon
              :name="task.status === TaskStatus.Completed ? 'i-lucide-check-circle-2' : 'i-lucide-circle'"
              class="size-5"
              :class="task.status === TaskStatus.Completed ? 'text-success' : 'text-muted'"
            />
          </div>

          <div class="flex-1 min-w-0">
            <p
              class="font-medium truncate"
              :class="task.status === TaskStatus.Completed ? 'text-muted line-through' : 'text-highlighted'"
            >
              {{ task.title }}
            </p>
            <div class="flex items-center gap-2 mt-0.5">
              <span v-if="task.list" class="text-xs text-muted">
                {{ task.list.name }}
              </span>
              <span v-if="task.dueDate" class="text-xs" :class="isOverdue(task) ? 'text-error font-medium' : 'text-muted'">
                {{ isOverdue(task) ? 'Atrasada · ' : '' }}{{ formatDueDate(task.dueDate) }}
              </span>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <UBadge
              :label="getPriorityLabel(task.priority)"
              :color="getPriorityColor(task.priority)"
              variant="subtle"
              size="xs"
            />
            <UBadge
              :label="getStatusLabel(task.status)"
              :color="getStatusColor(task.status)"
              variant="subtle"
              size="xs"
            />

            <UDropdownMenu
              :items="getRowItems(task)"
              :content="{ align: 'end' }"
            >
              <UButton
                icon="i-lucide-ellipsis-vertical"
                color="neutral"
                variant="ghost"
                size="xs"
                @click.stop
              />
            </UDropdownMenu>
          </div>
        </div>
      </UCard>
    </template>

    <!-- Empty state -->
    <div v-else class="flex flex-col items-center justify-center py-12 gap-3">
      <UIcon name="i-lucide-check-square" class="size-12 text-dimmed" />
      <p class="text-sm text-muted">
        Nenhuma tarefa encontrada
      </p>
    </div>

    <!-- Pagination -->
    <div v-if="total > pageSize" class="flex justify-center pt-2">
      <UPagination
        :model-value="page"
        :total="total"
        :items-per-page="pageSize"
        @update:model-value="emit('update:page', $event)"
      />
    </div>
  </div>
</template>
