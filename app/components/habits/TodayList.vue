<script setup lang="ts">
import { BaseTree } from '@he-tree/vue'
import type { HabitStack, TodayHabit } from '~/types/habits'
import { HabitLogStatus, LOG_STATUS_META } from '~/types/habits'
import { formatDisplay } from '#shared/utils/dateTime'

interface TodayTreeNode {
  id: string
  habit: TodayHabit
  children: TodayTreeNode[]
  open?: boolean
}

interface TreeStat {
  open: boolean
  level: number
  data: TodayTreeNode
}

const props = defineProps<{
  habits: TodayHabit[]
  stacks?: HabitStack[]
  completedCount: number
  totalCount: number
  loading: boolean
  currentDate: string
}>()

const emit = defineEmits<{
  'toggle': [habitId: string, completed: boolean]
  'select': [habitId: string]
  'log-with-note': [habitId: string, status: HabitLogStatus, note: string]
  'navigate-date': [direction: 'prev' | 'next']
}>()

const noteModalOpen = ref(false)
const noteHabitId = ref<string | null>(null)
const noteText = ref('')

function openNoteModal(habitId: string, _completed: boolean) {
  noteHabitId.value = habitId
  noteText.value = ''
  noteModalOpen.value = true
}

function submitNote(status: HabitLogStatus) {
  if (!noteHabitId.value) return
  emit('log-with-note', noteHabitId.value, status, noteText.value)
  noteModalOpen.value = false
  noteHabitId.value = null
  noteText.value = ''
}

// "Congelar" (Frozen) fica fora do modal — tem regra de negócio própria
// (limite mensal, log.post.ts) que faz mais sentido o backend decidir do que
// o usuário escolher num botão. "Feito mais tarde" também fica fora — o
// modal só precisa cobrir feito/não feito com nota.
const NOTE_MODAL_STATUSES = [HabitLogStatus.Done, HabitLogStatus.Skipped]
const statusButtons = computed(() =>
  NOTE_MODAL_STATUSES.map(s => ({
    status: s,
    ...LOG_STATUS_META[s]
  }))
)

const allDone = computed(() => props.totalCount > 0 && props.completedCount === props.totalCount)

const formattedDate = computed(() => {
  const d = new Date(props.currentDate + 'T12:00:00')
  return formatDisplay(d, "EEEE, d 'de' MMMM")
})

const isToday = computed(() => {
  const today = new Date().toISOString().split('T')[0]
  return props.currentDate === today
})

const treeRef = ref<InstanceType<typeof BaseTree> | null>(null)
const treeData = ref<TodayTreeNode[]>([])
const collapsedIds = ref<string[]>([])
const virtualizationEnabled = computed(() => props.habits.length > 12)

const isMobile = useMediaQuery('(max-width: 767px)')
const treeIndent = computed(() => (isMobile.value ? 16 : 24))
const treeLineOffset = computed(() => (isMobile.value ? 8 : 10))

function nodeKeyFn(stat: TreeStat) {
  return stat.data.id
}

function compareHabits(left: TodayHabit, right: TodayHabit): number {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder
  }

  return left.name.localeCompare(right.name, 'pt-BR')
}

function buildTreeData(): TodayTreeNode[] {
  const visibleHabits = [...(props.habits ?? [])].sort(compareHabits)
  if (visibleHabits.length === 0) return []

  const hiddenIds = new Set(collapsedIds.value)
  const visibleHabitIds = new Set(visibleHabits.map(habit => habit.id))
  const childrenByParent = new Map<string, string[]>()
  const parentsByChild = new Map<string, string>()
  const habitById = new Map(visibleHabits.map(habit => [habit.id, habit] as const))

  for (const stack of props.stacks ?? []) {
    if (!visibleHabitIds.has(stack.triggerHabitId) || !visibleHabitIds.has(stack.newHabitId)) {
      continue
    }

    const parentChildren = childrenByParent.get(stack.triggerHabitId) ?? []
    if (!parentChildren.includes(stack.newHabitId)) {
      parentChildren.push(stack.newHabitId)
      parentChildren.sort((leftId, rightId) => {
        const leftHabit = habitById.get(leftId)
        const rightHabit = habitById.get(rightId)

        if (!leftHabit || !rightHabit) return 0

        return compareHabits(leftHabit, rightHabit)
      })
      childrenByParent.set(stack.triggerHabitId, parentChildren)
    }

    parentsByChild.set(stack.newHabitId, stack.triggerHabitId)
  }

  const roots: TodayTreeNode[] = []
  const visited = new Set<string>()

  function buildNode(habitId: string): TodayTreeNode | null {
    if (visited.has(habitId)) return null

    const habit = habitById.get(habitId)
    if (!habit) return null

    visited.add(habitId)

    const childIds = childrenByParent.get(habitId) ?? []
    const children = childIds
      .map(childId => buildNode(childId))
      .filter((child): child is TodayTreeNode => child !== null)

    return {
      id: habit.id,
      habit,
      children,
      open: !hiddenIds.has(habit.id)
    }
  }

  for (const habit of visibleHabits) {
    if (!parentsByChild.has(habit.id)) {
      const root = buildNode(habit.id)
      if (root) roots.push(root)
    }
  }

  for (const habit of visibleHabits) {
    const root = buildNode(habit.id)
    if (root) roots.push(root)
  }

  return roots
}

// Rebuilding `treeData` wholesale on every change (the old behavior here)
// fed `he-tree` a brand-new array of brand-new node objects on every single
// habit toggle. That's exactly the anti-pattern its own docs warn against
// under virtualization ("safer to modify existing node objects in place
// rather than wholesale array replacement" — replacing the array doesn't
// reliably re-render already-visible virtualized rows). This is why marking
// a habit done stopped visually updating once logHabit() became optimistic
// (useHabits.ts) instead of going through a full refreshToday(): the old
// code path forced a fresh mount of <BaseTree> via the loading skeleton
// (v-if="loading" swaps it out and back in), which masked this. Now that
// there's no loading flash, the live in-place update has to actually work.
//
// So: only rebuild the tree from scratch when its *shape* changes (a habit
// was added/removed, a stack relationship changed, or sort order changed) —
// for everything else (a log, a streak, a name edit), patch the existing
// node objects' `.habit` in place, leaving the array/node identities alone.
function patchTreeDataInPlace(nodes: TodayTreeNode[], habitsById: Map<string, TodayHabit>): void {
  for (const node of nodes) {
    const updated = habitsById.get(node.id)
    if (updated) node.habit = updated
    if (node.children.length) patchTreeDataInPlace(node.children, habitsById)
  }
}

function structuralSignature(): string {
  const habitsKey = [...(props.habits ?? [])]
    .map(h => `${h.id}:${h.sortOrder}`)
    .sort()
    .join(',')
  const stacksKey = (props.stacks ?? [])
    .map(s => `${s.triggerHabitId}>${s.newHabitId}`)
    .sort()
    .join(',')
  return `${habitsKey}|${stacksKey}`
}

let lastStructuralSignature = ''

watch(
  () => [props.habits, props.stacks],
  () => {
    const signature = structuralSignature()
    if (signature !== lastStructuralSignature) {
      lastStructuralSignature = signature
      treeData.value = buildTreeData()
      return
    }
    patchTreeDataInPlace(treeData.value, new Map((props.habits ?? []).map(h => [h.id, h])))
  },
  { immediate: true, deep: true }
)

function onTreeOpened(stat: TreeStat) {
  collapsedIds.value = collapsedIds.value.filter(id => id !== stat.data.id)
}

function onTreeClosed(stat: TreeStat) {
  if (!collapsedIds.value.includes(stat.data.id)) {
    collapsedIds.value = [...collapsedIds.value, stat.data.id]
  }
}

function onToggleHabit(habitId: string, completed: boolean) {
  emit('toggle', habitId, completed)
}

function onSelectHabit(habitId: string) {
  emit('select', habitId)
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <UButton
        icon="i-lucide-chevron-left"
        color="neutral"
        variant="ghost"
        size="sm"
        aria-label="Dia anterior"
        @click="emit('navigate-date', 'prev')"
      />
      <div class="text-center">
        <p class="text-sm font-medium text-highlighted capitalize">
          {{ formattedDate }}
        </p>
        <UBadge
          v-if="isToday"
          label="Hoje"
          variant="subtle"
          color="primary"
          size="xs"
        />
      </div>
      <UButton
        icon="i-lucide-chevron-right"
        color="neutral"
        variant="ghost"
        size="sm"
        aria-label="Próximo dia"
        @click="emit('navigate-date', 'next')"
      />
    </div>

    <div v-if="totalCount > 0" class="space-y-1">
      <div class="flex items-center justify-between text-sm">
        <span class="text-muted">Progresso do dia</span>
        <span class="font-medium text-highlighted">{{ completedCount }}/{{ totalCount }}</span>
      </div>
      <UProgress
        :model-value="Number(completedCount)"
        :max="Number(totalCount)"
        size="sm"
      />
    </div>

    <UCard v-if="allDone" class="text-center">
      <div class="flex flex-col items-center gap-2 py-4">
        <UIcon name="i-lucide-party-popper" class="size-10 text-primary" />
        <p class="font-medium text-highlighted">
          Parabéns! Todos os hábitos de hoje foram concluídos.
        </p>
        <p class="text-sm text-muted">
          Você está construindo a sua identidade.
        </p>
      </div>
    </UCard>

    <template v-if="loading">
      <UCard v-for="i in 4" :key="i">
        <div class="flex items-center gap-3">
          <USkeleton class="size-5 rounded" />
          <div class="flex-1 space-y-2">
            <USkeleton class="h-4 w-3/4" />
            <USkeleton class="h-3 w-1/3" />
          </div>
          <USkeleton class="h-5 w-12 rounded-full" />
        </div>
      </UCard>
    </template>

    <template v-else-if="habits.length > 0 && !allDone">
      <div class="today-tree-shell rounded-2xl sm:border border-default/60 bg-default/50 sm:p-3">
        <BaseTree
          ref="treeRef"
          v-model="treeData"
          children-key="children"
          :node-key="nodeKeyFn"
          :indent="treeIndent"
          :tree-line="true"
          :tree-line-offset="treeLineOffset"
          :default-open="true"
          :virtualization="virtualizationEnabled"
          :virtualization-prerender-count="20"
          :watermark="false"
          @open:node="onTreeOpened"
          @close:node="onTreeClosed"
        >
          <template #default="{ node, stat }: { node: TodayTreeNode; stat: TreeStat }">
            <HabitsTodayTreeRow
              :node="node"
              :stat="stat"
              @toggle-node="stat.open = !stat.open"
              @toggle="onToggleHabit"
              @select="onSelectHabit"
              @open-note="openNoteModal"
            />
          </template>
        </BaseTree>
      </div>
    </template>

    <div v-else-if="!loading && habits.length === 0" class="flex flex-col items-center justify-center gap-4 py-12">
      <UIcon name="i-lucide-sun" class="size-12 text-dimmed" />
      <div class="text-center">
        <p class="font-medium text-highlighted">
          Nenhum hábito para {{ isToday ? 'hoje' : 'este dia' }}
        </p>
        <p class="text-sm text-muted">
          Crie seu primeiro hábito para começar a trilhar o caminho.
        </p>
      </div>
    </div>

    <UModal
      :open="noteModalOpen"
      title="Registrar hábito"
      @update:open="noteModalOpen = $event"
    >
      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-muted">
            Adicione uma observação e escolha o status:
          </p>
          <UTextarea
            v-model="noteText"
            placeholder="O que aconteceu? O que funcionou ou não?"
            class="w-full"
            :rows="3"
          />
          <div class="flex flex-wrap justify-end gap-2">
            <UButton
              icon="i-lucide-x"
              label="Cancelar"
              color="neutral"
              variant="subtle"
              @click="noteModalOpen = false"
            />
            <UButton
              v-for="btn in statusButtons"
              :key="btn.status"
              :icon="btn.icon"
              :label="btn.label"
              :color="btn.color"
              @click="submitNote(btn.status)"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
:deep(.today-tree-shell .he-tree) {
  max-height: none;
  overflow: visible;
}

:deep(.today-tree-shell .tree-line) {
  background-color: color-mix(in srgb, var(--ui-border) 80%, transparent);
}
</style>
