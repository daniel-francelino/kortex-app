<script setup lang="ts">
import type { Task, TaskSubtask } from '~/types/tasks'
import { TaskStatus } from '~/types/tasks'
import { formatDisplay } from '#shared/utils/dateTime'

const props = defineProps<{
  task: Task
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'edit': []
  'archive': []
  'updated': []
}>()

const { getPriorityLabel, getPriorityColor, getStatusLabel, getStatusColor, isOverdue, completeTask, createSubtask, updateSubtask, deleteSubtask } = useTasks()

// ─── Local state for detail (refreshable) ────────────────────────────────────
const taskDetail = ref<Task | null>(null)
const detailLoading = ref(false)

watch(() => props.open, async (isOpen) => {
  if (isOpen && props.task) {
    await loadDetail()
  }
}, { immediate: true })

watch(() => props.task?.id, async () => {
  if (props.open && props.task) {
    await loadDetail()
  }
})

async function loadDetail() {
  if (!props.task) return
  detailLoading.value = true
  try {
    const data = await $fetch<Task>(`/api/tasks/${props.task.id}`)
    taskDetail.value = data
  } catch {
    taskDetail.value = null
  } finally {
    detailLoading.value = false
  }
}

const subtasks = computed<TaskSubtask[]>(() => taskDetail.value?.subtasks ?? [])
const completedSubtaskCount = computed(() => subtasks.value.filter(s => s.completed).length)
const currentTask = computed(() => taskDetail.value ?? props.task)

// ─── New subtask form ────────────────────────────────────────────────────────
const newSubtaskTitle = ref('')
const addingSubtask = ref(false)

async function onAddSubtask() {
  if (!newSubtaskTitle.value.trim() || !props.task) return
  if (addingSubtask.value) return
  addingSubtask.value = true
  try {
    const result = await createSubtask(props.task.id, { title: newSubtaskTitle.value.trim() })
    if (result) {
      newSubtaskTitle.value = ''
      await loadDetail()
    }
  } finally {
    addingSubtask.value = false
  }
}

async function onToggleSubtask(subtask: TaskSubtask) {
  await updateSubtask(subtask.id, { completed: !subtask.completed })
  await loadDetail()
}

async function onDeleteSubtask(subtaskId: string) {
  const ok = await deleteSubtask(subtaskId)
  if (ok) {
    await loadDetail()
  }
}

// ─── Complete task ───────────────────────────────────────────────────────────
async function onCompleteTask() {
  if (!currentTask.value) return
  const ok = await completeTask(currentTask.value.id, currentTask.value.title)
  if (ok) {
    await loadDetail()
    emit('updated')
  }
}

function formatDate(dateStr: string): string {
  return formatDisplay(dateStr, 'dd/MM/yyyy')
}

function formatDueDate(dateStr: string): string {
  return formatDisplay(new Date(dateStr + 'T00:00:00'), "dd 'de' MMMM 'de' yyyy")
}
</script>

<template>
  <USlideover
    :open="props.open"
    title="Detalhes da tarefa"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div v-if="detailLoading" class="space-y-4">
        <USkeleton class="h-6 w-2/3" />
        <USkeleton class="h-4 w-full" />
        <USkeleton class="h-20 w-full" />
      </div>

      <div v-else-if="currentTask" class="space-y-6">
        <!-- Header -->
        <div class="flex items-start justify-between">
          <div class="space-y-1 flex-1 min-w-0">
            <h3
              class="text-lg font-semibold"
              :class="currentTask.status === TaskStatus.Completed ? 'text-muted line-through' : 'text-highlighted'"
            >
              {{ currentTask.title }}
            </h3>
            <p v-if="currentTask.description" class="text-sm text-muted">
              {{ currentTask.description }}
            </p>
          </div>
          <div class="flex gap-1 shrink-0">
            <UButton
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="emit('edit')"
            />
            <UButton
              icon="i-lucide-archive"
              color="error"
              variant="ghost"
              size="sm"
              @click="emit('archive')"
            />
          </div>
        </div>

        <!-- Badges -->
        <div class="flex flex-wrap gap-2">
          <UBadge
            :label="getPriorityLabel(currentTask.priority)"
            :color="getPriorityColor(currentTask.priority)"
            variant="subtle"
          />
          <UBadge
            :label="getStatusLabel(currentTask.status)"
            :color="getStatusColor(currentTask.status)"
            variant="subtle"
          />
          <UBadge
            v-if="currentTask.list"
            :label="currentTask.list.name"
            variant="subtle"
            color="neutral"
          />
          <UBadge
            v-if="isOverdue(currentTask)"
            label="Atrasada"
            color="error"
            variant="subtle"
          />
        </div>

        <!-- Due date -->
        <div v-if="currentTask.dueDate" class="text-sm">
          <span class="text-muted">Vencimento: </span>
          <span class="text-highlighted" :class="{ 'text-error': isOverdue(currentTask) }">
            {{ formatDueDate(currentTask.dueDate) }}
          </span>
        </div>

        <!-- Complete button -->
        <UButton
          v-if="currentTask.status !== TaskStatus.Completed"
          label="Marcar como concluída"
          icon="i-lucide-check-circle"
          color="success"
          variant="soft"
          block
          @click="onCompleteTask"
        />

        <!-- Subtasks section -->
        <div class="space-y-3">
          <h4 class="text-sm font-medium text-highlighted">
            Subtarefas
            <span v-if="subtasks.length > 0" class="text-muted font-normal">
              ({{ completedSubtaskCount }}/{{ subtasks.length }})
            </span>
          </h4>

          <!-- Subtask list -->
          <div v-if="subtasks.length > 0" class="space-y-2">
            <div
              v-for="subtask in subtasks"
              :key="subtask.id"
              class="flex items-center gap-2 rounded-lg border border-default p-2"
            >
              <UCheckbox
                :model-value="subtask.completed"
                size="sm"
                @update:model-value="onToggleSubtask(subtask)"
              />
              <span
                class="flex-1 text-sm"
                :class="subtask.completed ? 'text-muted line-through' : 'text-highlighted'"
              >
                {{ subtask.title }}
              </span>
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="xs"
                @click="onDeleteSubtask(subtask.id)"
              />
            </div>
          </div>

          <p v-else class="text-sm text-muted">
            Nenhuma subtarefa adicionada.
          </p>

          <!-- Add subtask input -->
          <div class="flex items-center gap-2">
            <UInput
              v-model="newSubtaskTitle"
              placeholder="Adicionar subtarefa..."
              class="flex-1"
              size="sm"
              @keydown.enter="onAddSubtask"
            />
            <UButton
              icon="i-lucide-plus"
              size="sm"
              :loading="addingSubtask"
              :disabled="addingSubtask || !newSubtaskTitle.trim()"
              @click="onAddSubtask"
            />
          </div>
        </div>

        <!-- Tags -->
        <div v-if="currentTask.tags && currentTask.tags.length > 0" class="space-y-2">
          <h4 class="text-sm font-medium text-highlighted">
            Tags
          </h4>
          <div class="flex flex-wrap gap-1">
            <UBadge
              v-for="tag in currentTask.tags"
              :key="tag.id"
              :label="tag.name"
              variant="subtle"
              color="neutral"
              size="xs"
            />
          </div>
        </div>

        <!-- Meta info -->
        <div class="space-y-2 text-sm pt-2 border-t border-default">
          <div>
            <span class="text-muted">Criada em: </span>
            <span class="text-highlighted">{{ formatDate(currentTask.createdAt) }}</span>
          </div>
          <div>
            <span class="text-muted">Atualizada em: </span>
            <span class="text-highlighted">{{ formatDate(currentTask.updatedAt) }}</span>
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>
