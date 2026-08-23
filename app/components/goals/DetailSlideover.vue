<script setup lang="ts">
import type { Goal, GoalTask, GoalHabitLink } from '~/types/goals'
import { GoalStatus } from '~/types/goals'

const props = defineProps<{
  goal: Goal
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'edit': []
  'archive': []
  'updated': []
}>()

const {
  getLifeCategoryLabel,
  getTimeCategoryLabel,
  getStatusColor,
  getStatusLabel,
  completeGoal,
  createTask,
  updateTask,
  deleteTask,
  linkHabit,
  unlinkHabit
} = useGoalActions()

// ─── Local state for goal detail (refreshable) ──────────────────────────────
const goalDetail = ref<Goal | null>(null)
const detailLoading = ref(false)
const showHabitLinker = ref(false)
const newTaskTitle = ref('')
const addingTask = ref(false)

watch(() => props.open, async (isOpen) => {
  if (isOpen && props.goal) {
    await loadDetail()
    return
  }

  showHabitLinker.value = false
  newTaskTitle.value = ''
}, { immediate: true })

watch(() => props.goal?.id, async () => {
  showHabitLinker.value = false
  newTaskTitle.value = ''

  if (props.open && props.goal) {
    await loadDetail()
  }
})

async function loadDetail() {
  if (!props.goal) return
  detailLoading.value = true
  try {
    const data = await $fetch<Goal>(`/api/goals/${props.goal.id}`)
    goalDetail.value = data
  } catch {
    goalDetail.value = null
  } finally {
    detailLoading.value = false
  }
}

const tasks = computed<GoalTask[]>(() => goalDetail.value?.tasks ?? [])
const habitLinks = computed<GoalHabitLink[]>(() => goalDetail.value?.habitLinks ?? [])
const completedTaskCount = computed(() => tasks.value.filter(t => t.completed).length)
const remainingTaskCount = computed(() => Math.max(tasks.value.length - completedTaskCount.value, 0))
const currentGoal = computed(() => goalDetail.value ?? props.goal)
const progressValue = computed(() => {
  const value = Number(currentGoal.value?.progress ?? 0)
  if (Number.isNaN(value)) return 0
  return Math.min(100, Math.max(0, value))
})
const progressDescription = computed(() => {
  if (tasks.value.length === 0) {
    return ''
  }

  const taskWord = tasks.value.length === 1 ? 'tarefa' : 'tarefas'
  const completedWord = completedTaskCount.value === 1 ? 'concluída' : 'concluídas'

  if (remainingTaskCount.value === 0) {
    return `${completedTaskCount.value} ${taskWord} ${completedWord}. Meta pronta para conclusão.`
  }

  return `${completedTaskCount.value} de ${tasks.value.length} ${taskWord} ${completedWord}. Restam ${remainingTaskCount.value}.`
})
const canCompleteGoal = computed(() =>
  currentGoal.value?.status === GoalStatus.Active
)

// ─── New task form ───────────────────────────────────────────────────────────
async function onAddTask() {
  const goalId = currentGoal.value?.id
  if (!newTaskTitle.value.trim() || !goalId) return
  if (addingTask.value) return
  addingTask.value = true
  try {
    const result = await createTask(goalId, { title: newTaskTitle.value.trim() })
    if (result) {
      newTaskTitle.value = ''
      await loadDetail()
      emit('updated')
    }
  } finally {
    addingTask.value = false
  }
}

async function onToggleTask(task: GoalTask) {
  const updatedTask = await updateTask(task.id, { completed: !task.completed })
  if (updatedTask) {
    await loadDetail()
    emit('updated')
  }
}

async function onDeleteTask(taskId: string) {
  const ok = await deleteTask(taskId)
  if (ok) {
    await loadDetail()
    emit('updated')
  }
}

// ─── Complete goal ───────────────────────────────────────────────────────────
async function onCompleteGoal() {
  if (!currentGoal.value || !canCompleteGoal.value) return
  const ok = await completeGoal(currentGoal.value.id, currentGoal.value.title)
  if (ok) {
    await loadDetail()
    emit('updated')
  }
}

// ─── Habit linking ───────────────────────────────────────────────────────────
async function onLinkHabit(habitId: string) {
  const goalId = currentGoal.value?.id
  if (!goalId) return

  const result = await linkHabit(goalId, { habitId })
  if (result) {
    showHabitLinker.value = false
    await loadDetail()
    emit('updated')
  }
}

async function onUnlinkHabit(linkId: string) {
  const ok = await unlinkHabit(linkId)
  if (ok) {
    await loadDetail()
    emit('updated')
  }
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'

  const parsed = new Date(dateStr)
  if (Number.isNaN(parsed.getTime())) return '—'

  return parsed.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

function getStatusIcon(status: GoalStatus): string {
  switch (status) {
    case GoalStatus.Completed:
      return 'i-lucide-check-circle'
    case GoalStatus.Archived:
      return 'i-lucide-archive'
    default:
      return 'i-lucide-activity'
  }
}
</script>

<template>
  <USlideover
    :open="props.open"
    title="Detalhes da meta"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div v-if="detailLoading" class="space-y-4">
        <USkeleton class="h-10 w-10 rounded-xl" />
        <USkeleton class="h-6 w-2/3" />
        <USkeleton class="h-4 w-full" />
        <USkeleton class="h-24 w-full" />
        <USkeleton class="h-32 w-full" />
      </div>

      <div v-else-if="currentGoal" class="space-y-6">
        <!-- Header -->
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0 flex-1 space-y-2">
            <div class="flex items-start gap-3">
              <div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <UIcon name="i-lucide-target" class="size-5" />
              </div>
              <div class="min-w-0 space-y-1">
                <h3
                  class="text-lg font-semibold leading-tight"
                  :class="currentGoal.status === GoalStatus.Completed ? 'text-muted line-through' : 'text-highlighted'"
                >
                  {{ currentGoal.title }}
                </h3>
                <p v-if="currentGoal.description" class="text-sm leading-6 text-muted">
                  {{ currentGoal.description }}
                </p>
                <p v-else class="text-sm text-muted">
                  -
                </p>
              </div>
            </div>
          </div>
          <div class="flex gap-1 shrink-0">
            <UButton
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="sm"
              aria-label="Editar meta"
              @click="emit('edit')"
            />
            <UButton
              icon="i-lucide-archive"
              color="error"
              variant="ghost"
              size="sm"
              aria-label="Arquivar meta"
              @click="emit('archive')"
            />
          </div>
        </div>

        <!-- Badges -->
        <div class="flex flex-wrap gap-2">
          <UBadge
            color="primary"
            variant="subtle"
            size="sm"
          >
            <template #leading>
              <UIcon name="i-lucide-compass" class="size-3.5" />
            </template>
            {{ getLifeCategoryLabel(currentGoal.lifeCategory) }}
          </UBadge>
          <UBadge
            color="neutral"
            variant="subtle"
            size="sm"
          >
            <template #leading>
              <UIcon name="i-lucide-calendar-range" class="size-3.5" />
            </template>
            {{ getTimeCategoryLabel(currentGoal.timeCategory) }}
          </UBadge>
          <UBadge
            :color="getStatusColor(currentGoal.status)"
            variant="subtle"
            size="sm"
          >
            <template #leading>
              <UIcon :name="getStatusIcon(currentGoal.status)" class="size-3.5" />
            </template>
            {{ getStatusLabel(currentGoal.status) }}
          </UBadge>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <UCard class="border-default/60 bg-default/30">
            <div class="flex items-center gap-3">
              <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
                <UIcon name="i-lucide-list-checks" class="size-4" />
              </div>
              <div>
                <p class="text-2xl font-semibold text-highlighted tabular-nums">
                  {{ completedTaskCount }}/{{ tasks.length }}
                </p>
                <p class="text-xs text-muted">
                  Tarefas concluídas
                </p>
              </div>
            </div>
          </UCard>

          <UCard class="border-default/60 bg-default/30">
            <div class="flex items-center gap-3">
              <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info">
                <UIcon name="i-lucide-link-2" class="size-4" />
              </div>
              <div>
                <p class="text-2xl font-semibold text-highlighted tabular-nums">
                  {{ habitLinks.length }}
                </p>
                <p class="text-xs text-muted">
                  Hábitos vinculados
                </p>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Progress -->
        <UCard class="border-default/60 bg-default/30">
          <div class="space-y-3">
            <div class="flex items-start justify-between gap-3">
              <div class="space-y-1">
                <p class="text-sm font-semibold text-highlighted">
                  Evolução da meta
                </p>
                <p class="text-xs text-muted">
                  {{ progressDescription }}
                </p>
              </div>
              <span class="text-sm font-medium text-highlighted tabular-nums">
                {{ completedTaskCount }}/{{ tasks.length }}
              </span>
            </div>
            <UProgress :model-value="progressValue" :max="100" size="md" />
          </div>
        </UCard>

        <!-- Complete goal button -->
        <UButton
          v-if="canCompleteGoal"
          label="Marcar como concluída"
          icon="i-lucide-trophy"
          color="success"
          variant="soft"
          block
          @click="onCompleteGoal"
        />

        <!-- Tasks section -->
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-list-todo" class="size-4 text-primary" />
            <h4 class="text-sm font-semibold text-highlighted">
              Tarefas
            </h4>
            <span class="text-xs text-muted">
              {{ completedTaskCount }}/{{ tasks.length }}
            </span>
          </div>

          <div v-if="tasks.length > 0" class="space-y-2">
            <div
              v-for="task in tasks"
              :key="task.id"
              class="rounded-xl border border-default/60 bg-default/30 p-3"
            >
              <div class="flex items-start gap-3">
                <UCheckbox
                  :model-value="task.completed"
                  size="sm"
                  @update:model-value="onToggleTask(task)"
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
                  @click="onDeleteTask(task.id)"
                />
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <UInput
              v-model="newTaskTitle"
              placeholder="Adicionar próxima tarefa..."
              class="flex-1"
              size="sm"
              @keydown.enter="onAddTask"
            />
            <UButton
              icon="i-lucide-plus"
              size="sm"
              :loading="addingTask"
              :disabled="addingTask || !newTaskTitle.trim()"
              aria-label="Adicionar tarefa"
              @click="onAddTask"
            />
          </div>
        </div>

        <!-- Linked habits section -->
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-link-2" class="size-4 text-primary" />
              <h4 class="text-sm font-semibold text-highlighted">
                Hábitos vinculados
              </h4>
              <span class="text-xs text-muted">
                {{ habitLinks.length }}
              </span>
            </div>
            <UButton
              v-if="!showHabitLinker"
              icon="i-lucide-link"
              label="Vincular"
              size="xs"
              color="neutral"
              variant="subtle"
              @click="showHabitLinker = true"
            />
          </div>

          <div v-if="habitLinks.length > 0" class="space-y-2">
            <div
              v-for="link in habitLinks"
              :key="link.id"
              class="flex items-center justify-between gap-3 rounded-xl border border-default/60 bg-default/30 p-3"
            >
              <div class="flex min-w-0 items-center gap-3">
                <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <UIcon name="i-lucide-calendar-check" class="size-4" />
                </div>
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-highlighted">
                    {{ link.habitName ?? 'Hábito sem nome' }}
                  </p>
                </div>
              </div>
              <UButton
                icon="i-lucide-unlink"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="Desvincular hábito"
                @click="onUnlinkHabit(link.id)"
              />
            </div>
          </div>

          <div
            v-else-if="!showHabitLinker"
            class="rounded-xl border border-dashed border-default px-4 py-5 text-sm text-muted"
          >
            Nenhum hábito vinculado. Conectar um hábito recorrente ajuda a transformar a meta em prática.
          </div>

          <!-- Habit linker -->
          <GoalsHabitLinker
            v-if="showHabitLinker"
            :existing-habit-ids="habitLinks.map(l => l.habitId)"
            @link="onLinkHabit"
            @cancel="showHabitLinker = false"
          />
        </div>

        <!-- Meta info -->
        <UCard class="border-default/60 bg-default/30">
          <div class="space-y-3">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-info" class="size-4 text-primary" />
              <h4 class="text-sm font-semibold text-highlighted">
                Informações da meta
              </h4>
            </div>

            <div class="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div class="space-y-1">
                <p class="text-xs uppercase tracking-wide text-muted">
                  Criada em
                </p>
                <p class="font-medium text-highlighted">
                  {{ formatDate(currentGoal.createdAt) }}
                </p>
              </div>

              <div class="space-y-1">
                <p class="text-xs uppercase tracking-wide text-muted">
                  Atualizada em
                </p>
                <p class="font-medium text-highlighted">
                  {{ formatDate(currentGoal.updatedAt) }}
                </p>
              </div>

              <div v-if="currentGoal.archivedAt" class="space-y-1">
                <p class="text-xs uppercase tracking-wide text-muted">
                  Arquivada em
                </p>
                <p class="font-medium text-highlighted">
                  {{ formatDate(currentGoal.archivedAt) }}
                </p>
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </USlideover>
</template>
