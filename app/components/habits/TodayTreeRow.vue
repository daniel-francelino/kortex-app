<script setup lang="ts">
import type { TodayHabit } from '~/types/habits'
import {
  DIFFICULTY_META,
  HABIT_STREAK_STATUS_META,
  HABIT_TYPE_META,
  HabitLogStatus,
  HabitStreakStatus,
  LOG_STATUS_META
} from '~/types/habits'

interface TodayTreeNode {
  id: string
  habit: TodayHabit
  children: TodayTreeNode[]
  open?: boolean
}

interface TreeStat {
  open: boolean
}

interface HabitLawHint {
  key: string
  label: string
  icon: string
  html: string
  plainText: string
}

const props = defineProps<{
  node: TodayTreeNode
  stat: TreeStat
}>()

const emit = defineEmits<{
  'toggle-node': []
  'toggle': [habitId: string, completed: boolean]
  'select': [habitId: string]
  'open-note': [habitId: string, completed: boolean]
}>()

function normalizeLawHtml(value: string | null | undefined): string | null {
  if (!value) return null

  const normalized = value
    .replace(/&nbsp;/g, ' ')
    .trim()

  if (!normalized) return null

  return normalized
}

function toPlainText(value: string | null | undefined): string | null {
  if (!value) return null

  const plainText = value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!plainText) return null

  return plainText
}

const lawHints = computed<HabitLawHint[]>(() => {
  const habit = props.node.habit

  return [
    {
      key: 'obvious',
      label: 'Tornar obvio',
      icon: 'i-lucide-eye',
      html: normalizeLawHtml(habit.obviousStrategy),
      plainText: toPlainText(habit.obviousStrategy)
    },
    {
      key: 'attractive',
      label: 'Tornar atraente',
      icon: 'i-lucide-sparkles',
      html: normalizeLawHtml(habit.attractiveStrategy),
      plainText: toPlainText(habit.attractiveStrategy)
    },
    {
      key: 'easy',
      label: 'Tornar facil',
      icon: 'i-lucide-feather',
      html: normalizeLawHtml(habit.easyStrategy),
      plainText: toPlainText(habit.easyStrategy)
    },
    {
      key: 'satisfying',
      label: 'Tornar satisfatorio',
      icon: 'i-lucide-trophy',
      html: normalizeLawHtml(habit.satisfyingStrategy),
      plainText: toPlainText(habit.satisfyingStrategy)
    }
  ].filter((hint): hint is HabitLawHint => Boolean(hint.html && hint.plainText))
})

const isMobile = useMediaQuery('(max-width: 767px)')

const logStatusMeta = computed(() => {
  const status = props.node.habit.log?.status as HabitLogStatus | undefined
  if (!status) return null
  return LOG_STATUS_META[status] ?? null
})

function formatHabitTime(value: string | null | undefined): string | null {
  if (!value) return null

  const normalized = value.trim()
  if (!normalized) return null

  const timeMatch = normalized.match(/^(\d{2}):(\d{2})(?::\d{2})?$/)
  if (timeMatch) {
    return `${timeMatch[1]}:${timeMatch[2]}`
  }

  return normalized
}

const scheduledTimeLabel = computed(() => {
  const start = formatHabitTime(props.node.habit.scheduledTime)
  const end = formatHabitTime(props.node.habit.scheduledEndTime)

  if (!start) return null
  if (!end) return start

  return `${start} - ${end}`
})

const streakMeta = computed(() => {
  const streak = props.node.habit.streak
  if (!streak || streak.currentStreak <= 0) return null

  const status = streak.status === HabitStreakStatus.Frozen
    ? HabitStreakStatus.Frozen
    : HabitStreakStatus.Active

  return HABIT_STREAK_STATUS_META[status]
})

const rowActionLabel = computed(() => {
  if (isMobile.value) {
    return props.node.habit.log?.completed
      ? 'Desmarcar hábito como feito'
      : 'Marcar hábito como feito'
  }

  return 'Abrir detalhes do hábito'
})

function onRowClick() {
  if (isMobile.value) {
    emit('toggle', props.node.habit.id, !(props.node.habit.log?.completed ?? false))
    return
  }

  emit('select', props.node.habit.id)
}

function onRowKeydown(event: KeyboardEvent) {
  if (event.target !== event.currentTarget) return

  if (event.key !== 'Enter' && event.key !== ' ') return

  event.preventDefault()
  onRowClick()
}
</script>

<template>
  <div
    class="today-tree-row mb-2.5 cursor-pointer rounded-xl border border-default/60 px-2.5 py-2.5 shadow-sm transition-colors hover:bg-elevated/50 sm:mb-2 sm:px-3"
    :class="{
      'bg-success/5 border-success/20': node.habit.log?.status === HabitLogStatus.Done,
      'bg-error/5 border-error/20': node.habit.log?.status === HabitLogStatus.Skipped,
      'bg-default/70': !node.habit.log?.status
    }"
    role="button"
    tabindex="0"
    :aria-label="rowActionLabel"
    :aria-pressed="isMobile ? (node.habit.log?.completed ?? false) : undefined"
    @click="onRowClick"
    @keydown="onRowKeydown"
  >
    <div class="flex items-start gap-2 sm:items-center sm:gap-2.5">
      <!-- Expand/collapse + Checkbox -->
      <div v-if="!isMobile" class="flex items-center gap-1 pt-0.5 sm:pt-0">
        <button
          v-if="node.children.length"
          type="button"
          class="hidden sm:inline-flex size-6 items-center justify-center rounded-md text-muted transition hover:bg-muted/60 hover:text-highlighted"
          @click.stop="emit('toggle-node')"
        >
          <UIcon :name="stat.open ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'" class="size-3.5" />
        </button>
        <span v-else class="hidden sm:inline-flex size-6 items-center justify-center text-muted">
          <span class="h-1.5 w-1.5 rounded-full bg-primary/60" />
        </span>

        <UCheckbox
          :model-value="node.habit.log?.completed ?? false"
          size="sm"
          @click.stop
          @update:model-value="emit('toggle', node.habit.id, $event as boolean)"
        />
      </div>

      <!-- Content -->
      <div class="min-w-0 flex-1">
        <!-- Row 1: Name + right-side actions -->
        <div class="flex flex-wrap items-start gap-x-2 gap-y-1 sm:flex-nowrap sm:items-center">
          <span
            v-if="node.habit.avatarEmoji"
            class="inline-flex size-5 shrink-0 items-center justify-center text-base"
          >
            {{ node.habit.avatarEmoji }}
          </span>
          <UIcon
            v-else
            :name="HABIT_TYPE_META[node.habit.habitType ?? 'positive'].icon"
            class="size-4 shrink-0"
            :class="node.habit.habitType === 'negative' ? 'text-error' : 'text-success'"
          />

          <p
            class="min-w-0 flex-1 text-sm font-medium leading-5 sm:truncate"
            :class="node.habit.log?.completed ? 'line-through text-muted' : 'text-highlighted'"
          >
            {{ node.habit.name }}
          </p>

          <!-- Streak -->
          <div
            v-if="node.habit.streak && node.habit.streak.currentStreak > 0 && streakMeta"
            class="flex shrink-0 items-center gap-0.5 text-xs text-muted ml-auto sm:ml-0"
          >
            <UIcon :name="streakMeta.icon" class="size-3.5" :class="streakMeta.color === 'primary' ? 'text-primary' : 'text-orange-500'" />
            <span>{{ node.habit.streak.currentStreak }}</span>
          </div>

          <!-- Note button -->
          <UButton
            class="shrink-0"
            :icon="node.habit.log?.completed ? 'i-lucide-message-square' : 'i-lucide-message-square-plus'"
            color="neutral"
            variant="ghost"
            size="xs"
            :aria-label="node.habit.log?.completed ? 'Adicionar nota (feito)' : 'Marcar como não feito com nota'"
            @click.stop="emit('open-note', node.habit.id, !(node.habit.log?.completed ?? false))"
          />
        </div>

        <!-- Row 2: Metadata badges -->
        <div class="mt-1.5 flex flex-wrap items-center gap-1.5 pl-0 sm:pl-6">
          <UBadge
            v-if="scheduledTimeLabel"
            :label="scheduledTimeLabel"
            variant="subtle"
            color="neutral"
            size="sm"
          >
            <template #leading>
              <UIcon name="i-lucide-clock" class="size-3.5" />
            </template>
          </UBadge>

          <UBadge
            :color="DIFFICULTY_META[node.habit.difficulty].color"
            variant="subtle"
            size="sm"
          >
            <template #leading>
              <UIcon :name="DIFFICULTY_META[node.habit.difficulty].icon" class="size-3.5" />
            </template>
            {{ DIFFICULTY_META[node.habit.difficulty].label }}
          </UBadge>

          <UBadge
            v-if="logStatusMeta && node.habit.log?.status !== HabitLogStatus.Done"
            :label="logStatusMeta.label"
            variant="subtle"
            :color="logStatusMeta.color"
            size="sm"
          >
            <template #leading>
              <UIcon :name="logStatusMeta.icon" class="size-3.5" />
            </template>
          </UBadge>

          <UBadge
            v-if="node.habit.streak && node.habit.streak.currentStreak > 0 && streakMeta && node.habit.streak.status === HabitStreakStatus.Frozen"
            :label="streakMeta.label"
            variant="subtle"
            :color="streakMeta.color"
            size="sm"
          >
            <template #leading>
              <UIcon :name="streakMeta.icon" class="size-3.5" />
            </template>
          </UBadge>

          <UTooltip
            v-if="node.habit.goalId"
            :content="{ side: 'top', align: 'center' }"
          >
            <span
              class="inline-flex size-6 items-center justify-center rounded-md border border-default/60 bg-default/40 text-muted"
              :aria-label="`Sustenta a meta: ${node.habit.goalTitle ?? 'sem título'}`"
            >
              <UIcon name="i-lucide-target" class="size-3.5" />
            </span>

            <template #content>
              <div class="max-w-64 whitespace-normal break-words rounded-lg border border-default/70 bg-default px-3 py-2 text-sm leading-5 text-toned shadow-lg">
                Sustenta a meta: {{ node.habit.goalTitle ?? 'sem título' }}
              </div>
            </template>
          </UTooltip>

          <UTooltip
            v-for="hint in lawHints"
            :key="hint.key"
            :content="{ side: 'top', align: 'center' }"
          >
            <button
              type="button"
              class="inline-flex size-6 items-center justify-center rounded-md border border-default/60 bg-default/40 text-muted transition hover:border-primary/40 hover:text-highlighted"
              :aria-label="`${hint.label}: ${hint.plainText}`"
              @click.stop
            >
              <UIcon :name="hint.icon" class="size-3.5" />
            </button>

            <template #content>
              <div class="habit-law-tooltip max-w-80 whitespace-normal break-words rounded-lg border border-default/70 bg-default px-3 py-2 text-sm leading-5 text-toned shadow-lg">
                <p class="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-highlighted">
                  {{ hint.label }}
                </p>
                <div class="habit-law-tooltip__content" v-html="hint.html" />
              </div>
            </template>
          </UTooltip>
        </div>

        <!-- Note display -->
        <div v-if="node.habit.log?.note" class="mt-1.5 rounded-lg border border-default/60 bg-default/40 px-2.5 py-1.5 text-xs italic text-muted ml-0 sm:ml-6">
          "{{ node.habit.log.note }}"
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.habit-law-tooltip__content :deep(*) {
  white-space: normal;
}

.habit-law-tooltip__content :deep(p) {
  margin: 0;
}

.habit-law-tooltip__content :deep(p + p),
.habit-law-tooltip__content :deep(ul + p),
.habit-law-tooltip__content :deep(ol + p),
.habit-law-tooltip__content :deep(blockquote + p),
.habit-law-tooltip__content :deep(p + ul),
.habit-law-tooltip__content :deep(p + ol) {
  margin-top: 0.5rem;
}

.habit-law-tooltip__content :deep(ul),
.habit-law-tooltip__content :deep(ol) {
  margin: 0;
  padding-left: 1.1rem;
}

.habit-law-tooltip__content :deep(li + li) {
  margin-top: 0.25rem;
}

.habit-law-tooltip__content :deep(strong) {
  color: var(--ui-text-highlighted);
  font-weight: 600;
}

.habit-law-tooltip__content :deep(em) {
  font-style: italic;
}

.habit-law-tooltip__content :deep(a) {
  color: var(--ui-primary);
  text-decoration: underline;
}

.habit-law-tooltip__content :deep(blockquote) {
  margin: 0.5rem 0 0;
  border-left: 2px solid var(--ui-border);
  padding-left: 0.75rem;
  color: var(--ui-text-muted);
}
</style>
