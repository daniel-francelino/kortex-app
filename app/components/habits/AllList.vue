<script setup lang="ts">
import { Draggable } from '@he-tree/vue'
import type { Habit, HabitStack, HabitTreeSyncNode } from '~/types/habits'

interface HabitSortableTreeNode {
  id: string
  habit: Habit
  children: HabitSortableTreeNode[]
  open?: boolean
}

interface TreeStat {
  open: boolean
  level: number
  data: HabitSortableTreeNode
}

const props = defineProps<{
  habits: Habit[]
  stacks: HabitStack[]
  total: number
  page: number
  pageSize: number
  loading: boolean
}>()

const emit = defineEmits<{
  'update:page': [value: number]
  'select': [habitId: string]
  'edit': [habit: Habit]
  'stack': [habit: Habit]
  'share': [habit: Habit]
  'remove-stacks': [habit: Habit]
  'archive': [habit: Habit]
  'sync-tree': [nodes: HabitTreeSyncNode[]]
}>()

const treeRef = ref<{ openAll: () => void, closeAll: () => void } | null>(null)
const treeData = ref<HabitSortableTreeNode[]>([])
const collapsedIds = ref<string[]>([])
const virtualizationEnabled = computed(() => props.habits.length > 12)

function nodeKeyFn(stat: TreeStat) {
  return stat.data.id
}

function compareHabits(left: Habit, right: Habit): number {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder
  }

  return left.name.localeCompare(right.name, 'pt-BR')
}

function buildTreeData(): HabitSortableTreeNode[] {
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

  const roots: HabitSortableTreeNode[] = []
  const visited = new Set<string>()

  function buildNode(habitId: string): HabitSortableTreeNode | null {
    if (visited.has(habitId)) return null

    const habit = habitById.get(habitId)
    if (!habit) return null

    visited.add(habitId)

    const childIds = childrenByParent.get(habitId) ?? []
    const children = childIds
      .map(childId => buildNode(childId))
      .filter((child): child is HabitSortableTreeNode => child !== null)

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

// Same fix as TodayList.vue's identical tree — only rebuild `treeData`
// wholesale when its *shape* changes; otherwise patch existing node
// objects' `.habit` in place. `he-tree`'s own docs warn that replacing the
// whole bound array doesn't reliably re-render already-visible virtualized
// rows, only patching existing node objects does — see the longer comment
// in TodayList.vue for how this manifested (habit edits/archives not
// showing up without a hard refresh once optimistic updates stopped
// forcing a full remount via the loading skeleton).
function patchTreeDataInPlace(nodes: HabitSortableTreeNode[], habitsById: Map<string, Habit>): void {
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

function serializeTree(nodes: HabitSortableTreeNode[]): HabitTreeSyncNode[] {
  return nodes.map(node => ({
    habitId: node.habit.id,
    children: serializeTree(node.children)
  }))
}

function onTreeOpened(stat: TreeStat) {
  collapsedIds.value = collapsedIds.value.filter(id => id !== stat.data.habit.id)
}

function onTreeClosed(stat: TreeStat) {
  if (!collapsedIds.value.includes(stat.data.habit.id)) {
    collapsedIds.value = [...collapsedIds.value, stat.data.habit.id]
  }
}

function onAfterDrop() {
  emit('sync-tree', serializeTree(treeData.value))
}

function onSelectHabit(habitId: string) {
  emit('select', habitId)
}

function onEditHabit(habit: Habit) {
  emit('edit', habit)
}

function onStackHabit(habit: Habit) {
  emit('stack', habit)
}

function onShareHabit(habit: Habit) {
  emit('share', habit)
}

function onRemoveStacks(habit: Habit) {
  emit('remove-stacks', habit)
}

function onArchiveHabit(habit: Habit) {
  emit('archive', habit)
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

    <!-- Habits list -->
    <template v-else-if="habits.length > 0">
      <div class="space-y-4">
        <div class="habit-tree-shell rounded-2xl border border-default/60 bg-default/50 p-3">
          <Draggable
            ref="treeRef"
            v-model="treeData"
            children-key="children"
            :node-key="nodeKeyFn"
            trigger-class="habit-tree-drag-handle"
            :indent="24"
            :tree-line="true"
            :tree-line-offset="10"
            :default-open="true"
            :virtualization="virtualizationEnabled"
            :virtualization-prerender-count="20"
            :watermark="false"
            @open:node="onTreeOpened"
            @close:node="onTreeClosed"
            @after-drop="onAfterDrop"
          >
            <template #default="{ node, stat }: { node: HabitSortableTreeNode; stat: TreeStat }">
              <HabitsAllTreeRow
                :node="node"
                :stat="stat"
                :stacks="stacks"
                @toggle-node="stat.open = !stat.open"
                @select="onSelectHabit"
                @edit="onEditHabit"
                @stack="onStackHabit"
                @share="onShareHabit"
                @remove-stacks="onRemoveStacks"
                @archive="onArchiveHabit"
              />
            </template>

            <template #placeholder>
              <div class="rounded-xl border border-dashed border-primary/40 bg-primary/6 px-3 py-3 text-sm text-muted">
                Solte aqui para reposicionar o hábito.
              </div>
            </template>
          </Draggable>
        </div>
      </div>
    </template>

    <!-- Empty state -->
    <div v-else class="flex flex-col items-center justify-center gap-4 py-12">
      <UIcon name="i-lucide-inbox" class="size-12 text-dimmed" />
      <div class="text-center">
        <p class="font-medium text-highlighted">
          Nenhum hábito encontrado
        </p>
        <p class="text-sm text-muted">
          Ajuste os filtros ou crie um novo hábito.
        </p>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="total > pageSize" class="flex justify-center pt-2">
      <UPagination
        :default-page="page"
        :items-per-page="pageSize"
        :total="total"
        @update:page="emit('update:page', $event)"
      />
    </div>
  </div>
</template>

<style scoped>
:deep(.habit-tree-shell .he-tree) {
  max-height: none;
  overflow: visible;
}

:deep(.habit-tree-shell .tree-line) {
  background-color: color-mix(in srgb, var(--ui-border) 80%, transparent);
}

:deep(.habit-tree-shell .he-tree-drag-placeholder) {
  height: 56px;
  border-radius: 0.875rem;
  border-color: color-mix(in srgb, var(--ui-primary) 45%, transparent);
  background: color-mix(in srgb, var(--ui-primary) 8%, transparent);
}
</style>
