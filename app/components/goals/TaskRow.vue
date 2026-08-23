<script setup lang="ts">
import type { GoalTask } from '~/types/goals'

defineProps<{
  task: GoalTask
}>()

const emit = defineEmits<{
  'toggle': [task: GoalTask]
  'delete': [taskId: string]
  'due-date': [task: GoalTask, dueDate: string | null]
}>()

function formatDueDate(dueDate: string): string {
  return new Date(`${dueDate}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}
</script>

<template>
  <div class="rounded-xl border border-default/60 bg-default/30 p-3">
    <div class="flex items-start gap-3">
      <UCheckbox
        :model-value="task.completed"
        size="sm"
        @update:model-value="emit('toggle', task)"
      />
      <div class="min-w-0 flex-1">
        <p
          class="text-sm font-medium leading-5"
          :class="task.completed ? 'text-muted line-through' : 'text-highlighted'"
        >
          {{ task.title }}
        </p>
        <div class="mt-1 flex items-center gap-2 text-xs text-muted">
          <span>{{ task.completed ? 'Concluída' : 'Pendente' }}</span>
          <span v-if="task.dueDate">· {{ formatDueDate(task.dueDate) }}</span>
        </div>
      </div>
      <UPopover :content="{ align: 'end' }">
        <UButton
          icon="i-lucide-calendar"
          :color="task.dueDate ? 'primary' : 'neutral'"
          variant="ghost"
          size="xs"
          aria-label="Definir data de vencimento"
        />
        <template #content>
          <div class="space-y-2 p-3">
            <p class="text-xs font-medium text-highlighted">
              Data de vencimento
            </p>
            <input
              type="date"
              :value="task.dueDate ?? ''"
              class="rounded-md border border-default bg-default px-2 py-1 text-sm text-highlighted"
              @change="emit('due-date', task, ($event.target as HTMLInputElement).value || null)"
            >
            <UButton
              v-if="task.dueDate"
              label="Remover data"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="emit('due-date', task, null)"
            />
          </div>
        </template>
      </UPopover>
      <UButton
        icon="i-lucide-trash-2"
        color="neutral"
        variant="ghost"
        size="xs"
        aria-label="Excluir tarefa"
        @click="emit('delete', task.id)"
      />
    </div>
  </div>
</template>
