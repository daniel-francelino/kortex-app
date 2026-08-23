<script setup lang="ts">
import type { Habit, HabitStack } from '~/types/habits'
import { DIFFICULTY_META, FREQUENCY_META, HABIT_STREAK_STATUS_META, HABIT_TYPE_META, HabitStreakStatus } from '~/types/habits'

interface HabitSortableTreeNode {
  id: string
  habit: Habit
  children: HabitSortableTreeNode[]
  open?: boolean
}

interface TreeStat {
  open: boolean
}

const props = defineProps<{
  node: HabitSortableTreeNode
  stat: TreeStat
  stacks: HabitStack[]
}>()

const emit = defineEmits<{
  'toggle-node': []
  'select': [habitId: string]
  'edit': [habit: Habit]
  'stack': [habit: Habit]
  'share': [habit: Habit]
  'remove-stacks': [habit: Habit]
  'archive': [habit: Habit]
}>()

const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

function getOutgoingStacks(habit: Habit): HabitStack[] {
  return props.stacks.filter(stack => stack.triggerHabitId === habit.id)
}

function getRowItems(habit: Habit) {
  const hasOutgoingStacks = getOutgoingStacks(habit).length > 0

  return [
    {
      label: 'Editar',
      icon: 'i-lucide-pencil',
      onSelect: () => emit('edit', habit)
    },
    {
      label: hasOutgoingStacks ? 'Remover empilhados' : 'Empilhar',
      icon: hasOutgoingStacks ? 'i-lucide-unlink' : 'i-lucide-link',
      onSelect: () => hasOutgoingStacks ? emit('remove-stacks', habit) : emit('stack', habit)
    },
    {
      label: 'Compartilhar',
      icon: 'i-lucide-share-2',
      onSelect: () => emit('share', habit)
    },
    {
      type: 'separator' as const
    },
    {
      label: 'Arquivar',
      icon: 'i-lucide-archive',
      color: 'error' as const,
      onSelect: () => emit('archive', habit)
    }
  ]
}

function getStreakMeta(habit: Habit) {
  if (!habit.streak || habit.streak.currentStreak <= 0) return null

  const status = habit.streak.status === HabitStreakStatus.Frozen
    ? HabitStreakStatus.Frozen
    : HabitStreakStatus.Active

  return HABIT_STREAK_STATUS_META[status]
}
</script>

<template>
  <div
    class="habit-tree-row mb-3 rounded-xl border border-default/60 bg-default/70 p-3 shadow-sm transition-colors hover:bg-elevated/50"
    @click="emit('select', node.habit.id)"
  >
    <div class="flex items-start gap-2.5 sm:gap-3">
      <div class="flex items-center gap-1 pt-0.5">
        <button
          v-if="node.children.length"
          type="button"
          class="inline-flex size-7 items-center justify-center rounded-md text-muted transition hover:bg-muted/60 hover:text-highlighted"
          @click.stop="emit('toggle-node')"
        >
          <UIcon :name="stat.open ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-4" />
        </button>
        <span v-else class="inline-flex size-7 items-center justify-center text-muted">
          <span class="h-1.5 w-1.5 rounded-full bg-primary/60" />
        </span>

        <button
          type="button"
          class="habit-tree-drag-handle inline-flex size-7 cursor-grab items-center justify-center rounded-md text-muted transition hover:bg-muted/60 hover:text-highlighted active:cursor-grabbing"
          aria-label="Reordenar hábito"
          @click.stop
        >
          <UIcon name="i-lucide-grip-vertical" class="size-4" />
        </button>
      </div>

      <span
        v-if="node.habit.avatarEmoji"
        class="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center text-lg"
      >
        {{ node.habit.avatarEmoji }}
      </span>
      <UIcon
        v-else
        :name="HABIT_TYPE_META[node.habit.habitType ?? 'positive'].icon"
        class="mt-1 size-4 shrink-0"
        :class="node.habit.habitType === 'negative' ? 'text-error' : 'text-success'"
      />

      <div class="min-w-0 flex-1">
        <div class="flex items-start justify-between gap-2">
          <p class="min-w-0 text-sm font-medium leading-5 text-highlighted sm:truncate sm:text-base">
            {{ node.habit.name }}
          </p>

          <UDropdownMenu class="shrink-0 sm:hidden" :items="getRowItems(node.habit)" :content="{ align: 'end' }">
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              size="xs"
              @click.stop
            />
          </UDropdownMenu>
        </div>

        <div class="mt-1.5 flex flex-wrap items-center gap-1.5 sm:mt-1">
          <UBadge variant="subtle" color="neutral" size="sm">
            <template #leading>
              <UIcon :name="FREQUENCY_META[node.habit.frequency].icon" class="size-3.5" />
            </template>
            {{ FREQUENCY_META[node.habit.frequency].label }}
          </UBadge>
          <span
            v-if="node.habit.frequency === 'custom' && node.habit.customDays?.length"
            class="text-xs text-muted"
          >
            {{ node.habit.customDays.map((day: number) => dayLabels[day]).join(', ') }}
          </span>

          <UTooltip
            v-if="node.habit.goalId"
            :content="{ side: 'top', align: 'center' }"
          >
            <span
              class="inline-flex size-6 items-center justify-center rounded-md border border-default/60 bg-default/40 text-muted"
              :aria-label="`Sustenta a meta: ${node.habit.goalTitle ?? 'sem título'}`"
              @click.stop
            >
              <UIcon name="i-lucide-target" class="size-3.5" />
            </span>

            <template #content>
              <div class="max-w-64 rounded-lg border border-default/70 bg-default px-3 py-2 text-sm leading-5 text-toned shadow-lg">
                Sustenta a meta: {{ node.habit.goalTitle ?? 'sem título' }}
              </div>
            </template>
          </UTooltip>

          <UBadge
            class="sm:hidden"
            :color="DIFFICULTY_META[node.habit.difficulty].color"
            variant="subtle"
            size="sm"
          >
            <template #leading>
              <UIcon :name="DIFFICULTY_META[node.habit.difficulty].icon" class="size-3.5" />
            </template>
            {{ DIFFICULTY_META[node.habit.difficulty].label }}
          </UBadge>

          <div
            v-if="node.habit.streak && node.habit.streak.currentStreak > 0"
            class="flex items-center gap-1 text-xs text-muted sm:hidden"
          >
            <UIcon
              :name="getStreakMeta(node.habit)?.icon ?? 'i-lucide-flame'"
              class="size-3.5"
              :class="node.habit.streak?.status === HabitStreakStatus.Frozen ? 'text-primary' : 'text-orange-500'"
            />
            <span>{{ node.habit.streak.currentStreak }}d</span>
          </div>
        </div>
      </div>

      <div class="hidden shrink-0 items-center gap-2 sm:flex">
        <UBadge :color="DIFFICULTY_META[node.habit.difficulty].color" variant="subtle" size="sm">
          <template #leading>
            <UIcon :name="DIFFICULTY_META[node.habit.difficulty].icon" class="size-3.5" />
          </template>
          {{ DIFFICULTY_META[node.habit.difficulty].label }}
        </UBadge>

        <div
          v-if="node.habit.streak && node.habit.streak.currentStreak > 0"
          class="flex items-center gap-1 text-xs text-muted"
        >
          <UIcon
            :name="getStreakMeta(node.habit)?.icon ?? 'i-lucide-flame'"
            class="size-3.5"
            :class="node.habit.streak?.status === HabitStreakStatus.Frozen ? 'text-primary' : 'text-orange-500'"
          />
          <span>{{ node.habit.streak.currentStreak }}d</span>
        </div>

        <UDropdownMenu :items="getRowItems(node.habit)" :content="{ align: 'end' }">
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
  </div>
</template>
