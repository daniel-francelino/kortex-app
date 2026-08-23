<script setup lang="ts">
import type { Goal, GoalTask, GoalHabitLink, GoalMilestone } from '~/types/goals'
import { GoalStatus, GoalProgressType } from '~/types/goals'

const props = defineProps<{
  goal: Goal
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'edit': []
  'archive': []
  'updated': []
  'create-habit': [goalId: string]
}>()

const {
  getLifeCategoryLabel,
  getTimeCategoryLabel,
  getStatusColor,
  getStatusLabel,
  completeGoal,
  updateGoal,
  createTask,
  updateTask,
  deleteTask,
  createMilestone,
  updateMilestone,
  deleteMilestone,
  linkHabit,
  unlinkHabit
} = useGoalActions()

// ─── Local state for goal detail (refreshable) ──────────────────────────────
const goalDetail = ref<Goal | null>(null)
const detailLoading = ref(false)
const showHabitLinker = ref(false)
const newTaskTitle = ref('')
const newTaskMilestoneId = ref<string | undefined>(undefined)
const addingTask = ref(false)
const showNewMilestoneInput = ref(false)
const newMilestoneTitle = ref('')
const addingMilestone = ref(false)
const expandedMilestones = reactive(new Set<string>())

watch(() => props.open, async (isOpen) => {
  if (isOpen && props.goal) {
    await loadDetail()
    return
  }

  showHabitLinker.value = false
  newTaskTitle.value = ''
  newTaskMilestoneId.value = undefined
  showNewMilestoneInput.value = false
  newMilestoneTitle.value = ''
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
const milestones = computed<GoalMilestone[]>(() => goalDetail.value?.milestones ?? [])
const habitLinks = computed<GoalHabitLink[]>(() => goalDetail.value?.habitLinks ?? [])
const completedTaskCount = computed(() => tasks.value.filter(t => t.completed).length)
const remainingTaskCount = computed(() => Math.max(tasks.value.length - completedTaskCount.value, 0))
const currentGoal = computed(() => goalDetail.value ?? props.goal)

const unassignedTasks = computed(() => tasks.value.filter(t => !t.milestoneId))

function tasksForMilestone(milestoneId: string): GoalTask[] {
  return tasks.value.filter(t => t.milestoneId === milestoneId)
}

function milestoneTaskStats(milestoneId: string): { completed: number, total: number } {
  const items = tasksForMilestone(milestoneId)
  return { completed: items.filter(t => t.completed).length, total: items.length }
}

const milestoneSelectItems = computed(() => [
  { label: 'Sem marco', value: undefined },
  ...milestones.value.map(m => ({ label: m.title, value: m.id }))
])

function toggleMilestoneExpanded(milestoneId: string) {
  if (expandedMilestones.has(milestoneId)) {
    expandedMilestones.delete(milestoneId)
  } else {
    expandedMilestones.add(milestoneId)
  }
}

function clampProgress(value: unknown): number {
  const parsed = Number(value)
  if (Number.isNaN(parsed)) return 0
  return Math.min(100, Math.max(0, parsed))
}

const isValueProgress = computed(() =>
  currentGoal.value?.progressType !== undefined && currentGoal.value.progressType !== GoalProgressType.Tasks
)
const editingCurrentValue = ref(false)
const currentValueInput = ref(0)
const savingCurrentValue = ref(false)

watch(currentGoal, (goal) => {
  if (goal && !editingCurrentValue.value) {
    currentValueInput.value = goal.currentValue ?? 0
  }
}, { immediate: true })

async function onSaveCurrentValue() {
  const goalId = currentGoal.value?.id
  if (!goalId) return
  savingCurrentValue.value = true
  try {
    const result = await updateGoal(goalId, { currentValue: currentValueInput.value })
    if (result) {
      editingCurrentValue.value = false
      await loadDetail()
      emit('updated')
    }
  } finally {
    savingCurrentValue.value = false
  }
}

const hasCombinedProgress = computed(() =>
  habitLinks.value.length > 0 && currentGoal.value?.combinedProgress !== undefined
)
const taskProgressValue = computed(() => clampProgress(currentGoal.value?.taskProgress ?? currentGoal.value?.progress ?? 0))
const habitProgressValue = computed(() => clampProgress(currentGoal.value?.habitProgress ?? 0))
const progressValue = computed(() => {
  if (hasCombinedProgress.value) {
    return clampProgress(currentGoal.value?.combinedProgress)
  }
  return clampProgress(currentGoal.value?.progress ?? 0)
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
    const result = await createTask(goalId, {
      title: newTaskTitle.value.trim(),
      milestoneId: newTaskMilestoneId.value ?? null
    })
    if (result) {
      newTaskTitle.value = ''
      await loadDetail()
      emit('updated')
    }
  } finally {
    addingTask.value = false
  }
}

// ─── Milestones ───────────────────────────────────────────────────────────────
async function onAddMilestone() {
  const goalId = currentGoal.value?.id
  if (!newMilestoneTitle.value.trim() || !goalId) return
  if (addingMilestone.value) return
  addingMilestone.value = true
  try {
    const result = await createMilestone(goalId, { title: newMilestoneTitle.value.trim() })
    if (result) {
      newMilestoneTitle.value = ''
      showNewMilestoneInput.value = false
      expandedMilestones.add(result.id)
      await loadDetail()
    }
  } finally {
    addingMilestone.value = false
  }
}

async function onDeleteMilestone(milestoneId: string) {
  const ok = await deleteMilestone(milestoneId)
  if (ok) {
    expandedMilestones.delete(milestoneId)
    await loadDetail()
  }
}

async function onToggleMilestoneCompleted(milestone: GoalMilestone) {
  const result = await updateMilestone(milestone.id, { completed: !milestone.completed })
  if (result) {
    await loadDetail()
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

defineExpose({ reload: loadDetail })

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
                  {{ isValueProgress
                    ? 'Progresso calculado a partir do valor atual.'
                    : (hasCombinedProgress ? 'Combina tarefas concluídas e consistência dos hábitos vinculados.' : progressDescription) }}
                </p>
              </div>
              <span class="text-sm font-medium text-highlighted tabular-nums">
                {{ (isValueProgress || hasCombinedProgress) ? `${progressValue}%` : `${completedTaskCount}/${tasks.length}` }}
              </span>
            </div>
            <UProgress :model-value="progressValue" :max="100" size="md" />

            <div v-if="isValueProgress" class="flex items-center gap-2 pt-1">
              <template v-if="!editingCurrentValue">
                <span class="text-sm text-highlighted tabular-nums">
                  {{ currentGoal?.currentValue ?? 0 }}{{ currentGoal?.unit ? ` ${currentGoal.unit}` : '' }}
                  <span class="text-muted"> / {{ currentGoal?.targetValue ?? '—' }}{{ currentGoal?.unit ? ` ${currentGoal.unit}` : '' }}</span>
                </span>
                <UButton
                  icon="i-lucide-pencil"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  aria-label="Editar valor atual"
                  @click="editingCurrentValue = true"
                />
              </template>
              <template v-else>
                <UInputNumber
                  v-model="currentValueInput"
                  :min="0"
                  size="sm"
                  class="w-32"
                />
                <UButton
                  icon="i-lucide-check"
                  size="xs"
                  :loading="savingCurrentValue"
                  aria-label="Salvar valor"
                  @click="onSaveCurrentValue"
                />
                <UButton
                  icon="i-lucide-x"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  aria-label="Cancelar"
                  @click="editingCurrentValue = false; currentValueInput = currentGoal?.currentValue ?? 0"
                />
              </template>
            </div>

            <div v-else-if="hasCombinedProgress" class="space-y-2 pt-1">
              <div class="space-y-1">
                <div class="flex items-center justify-between text-xs text-muted">
                  <span>Tarefas</span>
                  <span class="tabular-nums">{{ taskProgressValue }}%</span>
                </div>
                <UProgress
                  :model-value="taskProgressValue"
                  :max="100"
                  size="xs"
                  color="neutral"
                />
              </div>
              <div class="space-y-1">
                <div class="flex items-center justify-between text-xs text-muted">
                  <span>Consistência dos hábitos</span>
                  <span class="tabular-nums">{{ habitProgressValue }}%</span>
                </div>
                <UProgress
                  :model-value="habitProgressValue"
                  :max="100"
                  size="xs"
                  color="neutral"
                />
              </div>
            </div>
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

        <!-- Tasks & milestones section -->
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-list-todo" class="size-4 text-primary" />
              <h4 class="text-sm font-semibold text-highlighted">
                Tarefas
              </h4>
              <span class="text-xs text-muted">
                {{ completedTaskCount }}/{{ tasks.length }}
              </span>
            </div>
            <UButton
              v-if="!showNewMilestoneInput"
              icon="i-lucide-flag"
              label="Novo marco"
              size="xs"
              color="neutral"
              variant="subtle"
              @click="showNewMilestoneInput = true"
            />
          </div>

          <div v-if="showNewMilestoneInput" class="flex items-center gap-2">
            <UInput
              v-model="newMilestoneTitle"
              placeholder="Nome do marco..."
              class="flex-1"
              size="sm"
              @keydown.enter="onAddMilestone"
            />
            <UButton
              icon="i-lucide-check"
              size="sm"
              :loading="addingMilestone"
              :disabled="addingMilestone || !newMilestoneTitle.trim()"
              aria-label="Salvar marco"
              @click="onAddMilestone"
            />
            <UButton
              icon="i-lucide-x"
              size="sm"
              color="neutral"
              variant="ghost"
              aria-label="Cancelar"
              @click="showNewMilestoneInput = false; newMilestoneTitle = ''"
            />
          </div>

          <!-- Milestone groups -->
          <div
            v-for="milestone in milestones"
            :key="milestone.id"
            class="overflow-hidden rounded-xl border border-default/60 bg-default/20"
          >
            <div class="flex items-center gap-2 p-3">
              <UCheckbox
                :model-value="milestone.completed"
                size="sm"
                @update:model-value="onToggleMilestoneCompleted(milestone)"
              />
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-2 text-left"
                @click="toggleMilestoneExpanded(milestone.id)"
              >
                <UIcon
                  :name="expandedMilestones.has(milestone.id) ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
                  class="size-4 shrink-0 text-muted"
                />
                <UIcon name="i-lucide-flag" class="size-3.5 shrink-0 text-primary" />
                <span
                  class="truncate text-sm font-medium"
                  :class="milestone.completed ? 'text-muted line-through' : 'text-highlighted'"
                >
                  {{ milestone.title }}
                </span>
              </button>
              <span class="shrink-0 text-xs text-muted tabular-nums">
                {{ milestoneTaskStats(milestone.id).completed }}/{{ milestoneTaskStats(milestone.id).total }}
              </span>
              <UButton
                icon="i-lucide-trash-2"
                color="neutral"
                variant="ghost"
                size="xs"
                aria-label="Excluir marco"
                @click="onDeleteMilestone(milestone.id)"
              />
            </div>

            <div v-if="expandedMilestones.has(milestone.id)" class="space-y-2 border-t border-default/60 p-3">
              <GoalsTaskRow
                v-for="task in tasksForMilestone(milestone.id)"
                :key="task.id"
                :task="task"
                @toggle="onToggleTask"
                @delete="onDeleteTask"
              />
              <p v-if="tasksForMilestone(milestone.id).length === 0" class="text-xs text-muted">
                Nenhuma tarefa neste marco ainda.
              </p>
            </div>
          </div>

          <!-- Unassigned tasks -->
          <div v-if="unassignedTasks.length > 0" class="space-y-2">
            <GoalsTaskRow
              v-for="task in unassignedTasks"
              :key="task.id"
              :task="task"
              @toggle="onToggleTask"
              @delete="onDeleteTask"
            />
          </div>

          <div class="flex items-center gap-2">
            <UInput
              v-model="newTaskTitle"
              placeholder="Adicionar próxima tarefa..."
              class="flex-1"
              size="sm"
              @keydown.enter="onAddTask"
            />
            <USelect
              v-if="milestones.length > 0"
              v-model="newTaskMilestoneId"
              :items="milestoneSelectItems"
              value-key="value"
              placeholder="Marco"
              class="w-32"
              size="sm"
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
                <UBadge
                  v-if="link.habitArchivedAt"
                  label="Arquivado"
                  icon="i-lucide-archive"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                  class="shrink-0"
                />
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
            @create-habit="currentGoal && emit('create-habit', currentGoal.id)"
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
