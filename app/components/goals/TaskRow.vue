<script setup lang="ts">
import type { GoalTask } from '~/types/goals'

defineProps<{
  task: GoalTask
}>()

const emit = defineEmits<{
  toggle: [task: GoalTask]
  delete: [taskId: string]
}>()
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
        <p class="mt-1 text-xs text-muted">
          {{ task.completed ? 'Concluída' : 'Pendente' }}
        </p>
      </div>
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
