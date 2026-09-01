<script setup lang="ts">
import type { Habit, HabitStack } from '~/types/habits'
import { DIFFICULTY_META, FREQUENCY_META, HABIT_TYPE_META } from '~/types/habits'
import { formatDisplay } from '#shared/utils/dateTime'

const props = defineProps<{
  habit: Habit
  stacks?: HabitStack[]
  open: boolean
  stackActionsDisabled?: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'edit': []
  'stack': []
  'share': []
  'remove-stack': [stackId: string]
  'remove-stacks': []
  'archive': []
  'identityModalOpen': [value: boolean]
}>()

const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const lawMeta = [
  {
    key: 'obviousStrategy',
    title: 'Tornar óbvio',
    icon: 'i-lucide-eye'
  },
  {
    key: 'attractiveStrategy',
    title: 'Tornar atraente',
    icon: 'i-lucide-sparkles'
  },
  {
    key: 'easyStrategy',
    title: 'Tornar fácil',
    icon: 'i-lucide-feather'
  },
  {
    key: 'satisfyingStrategy',
    title: 'Tornar satisfatório',
    icon: 'i-lucide-trophy'
  }
] as const

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : formatDisplay(d, 'dd/MM/yyyy')
}

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

function normalizeRichHtml(value: string | null | undefined): string | null {
  if (!value) return null

  const normalized = value
    .replace(/&nbsp;/g, ' ')
    .trim()

  return normalized || null
}

const scheduledWindow = computed(() => {
  const start = formatHabitTime(props.habit.scheduledTime)
  const end = formatHabitTime(props.habit.scheduledEndTime)

  if (!start) return null
  if (!end) return start

  return `${start} - ${end}`
})

const lawSections = computed(() =>
  lawMeta
    .map(item => ({
      ...item,
      html: normalizeRichHtml(props.habit[item.key])
    }))
    .filter(item => Boolean(item.html))
)

const triggerStacks = computed(() =>
  (props.stacks ?? []).filter(stack => stack.triggerHabitId === props.habit.id)
)

const incomingStacks = computed(() =>
  (props.stacks ?? []).filter(stack => stack.newHabitId === props.habit.id)
)

const historyOpen = ref(false)
const changeHistoryRef = ref<{ loadMore: () => Promise<void>, loaded: boolean } | null>(null)

watch(historyOpen, (open) => {
  if (open && !changeHistoryRef.value?.loaded) {
    void changeHistoryRef.value?.loadMore()
  }
})
</script>

<template>
  <USlideover
    :open="props.open"
    title="Detalhes do hábito"
    :ui="{
      overlay: 'z-[80]',
      content: 'z-[90]'
    }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="space-y-6">
        <!-- Header -->
        <div class="flex items-start justify-between">
          <div class="space-y-1 min-w-0">
            <div class="flex items-center gap-2">
              <span
                v-if="habit.avatarEmoji"
                class="inline-flex size-7 shrink-0 items-center justify-center rounded-xl bg-elevated text-xl"
              >
                {{ habit.avatarEmoji }}
              </span>
              <UIcon
                v-else
                :name="HABIT_TYPE_META[habit.habitType ?? 'positive'].icon"
                class="size-5 shrink-0"
                :class="habit.habitType === 'negative' ? 'text-error' : 'text-success'"
              />
              <h3 class="text-lg font-semibold text-highlighted truncate">
                {{ habit.name }}
              </h3>
            </div>
            <div
              v-if="habit.description"
              class="habit-description text-sm text-muted"
              v-html="habit.description"
            />
          </div>
          <div class="flex gap-1 shrink-0">
            <UButton
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="sm"
              aria-label="Editar hábito"
              @click="emit('edit')"
            />
            <UButton
              icon="i-lucide-share-2"
              color="neutral"
              variant="ghost"
              size="sm"
              aria-label="Compartilhar progresso"
              @click="emit('share')"
            />
            <UButton
              icon="i-lucide-archive"
              color="error"
              variant="ghost"
              size="sm"
              aria-label="Arquivar hábito"
              @click="emit('archive')"
            />
          </div>
        </div>

        <!-- Badges with icons -->
        <div class="flex flex-wrap gap-2">
          <UBadge variant="subtle" :color="HABIT_TYPE_META[habit.habitType ?? 'positive'].color" size="sm">
            <template #leading>
              <UIcon :name="HABIT_TYPE_META[habit.habitType ?? 'positive'].icon" class="size-3.5" />
            </template>
            {{ HABIT_TYPE_META[habit.habitType ?? 'positive'].label }}
          </UBadge>
          <UBadge variant="subtle" color="neutral" size="sm">
            <template #leading>
              <UIcon :name="FREQUENCY_META[habit.frequency].icon" class="size-3.5" />
            </template>
            {{ FREQUENCY_META[habit.frequency].label }}
          </UBadge>
          <UBadge
            :color="DIFFICULTY_META[habit.difficulty].color"
            variant="subtle"
            size="sm"
          >
            <template #leading>
              <UIcon :name="DIFFICULTY_META[habit.difficulty].icon" class="size-3.5" />
            </template>
            {{ DIFFICULTY_META[habit.difficulty].label }}
          </UBadge>
          <UBadge
            v-if="habit.identity"
            :label="habit.identity.name"
            variant="subtle"
            color="primary"
            size="sm"
          />
          <NuxtLink v-if="habit.goalId" to="/app/goals">
            <UBadge
              :label="`Meta: ${habit.goalTitle ?? 'sem título'}`"
              icon="i-lucide-target"
              variant="subtle"
              color="secondary"
              size="sm"
              class="cursor-pointer hover:opacity-80 transition-opacity"
            />
          </NuxtLink>
          <UBadge
            v-if="scheduledWindow"
            :label="scheduledWindow"
            variant="subtle"
            color="neutral"
            size="sm"
          >
            <template #leading>
              <UIcon name="i-lucide-clock-3" class="size-3.5" />
            </template>
          </UBadge>
        </div>

        <!-- Streak stats with icons -->
        <div v-if="habit.streak" class="grid grid-cols-2 gap-3">
          <UCard>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-flame" class="size-5 text-orange-500 shrink-0" />
              <div>
                <p class="text-2xl font-bold text-highlighted">
                  {{ habit.streak.currentStreak }}
                </p>
                <p class="text-xs text-muted">
                  Streak atual
                </p>
              </div>
            </div>
          </UCard>
          <UCard>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-trophy" class="size-5 text-amber-500 shrink-0" />
              <div>
                <p class="text-2xl font-bold text-highlighted">
                  {{ habit.streak.longestStreak }}
                </p>
                <p class="text-xs text-muted">
                  Maior streak
                </p>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Overview info (no tabs needed) -->
        <div class="space-y-3">
          <div v-if="habit.identity" class="rounded-xl border border-default/60 bg-default/40 p-3">
            <div class="flex items-start gap-3">
              <div class="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <UIcon name="i-lucide-users" class="size-4" />
              </div>
              <div class="min-w-0 space-y-1">
                <p class="text-sm font-medium text-highlighted">
                  {{ habit.identity.name }}
                </p>
                <p v-if="habit.identity.description" class="text-sm text-muted">
                  {{ habit.identity.description }}
                </p>
              </div>
            </div>
          </div>

          <div v-if="habit.tags?.length" class="space-y-2">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-tags" class="size-4 text-primary" />
              <h4 class="text-sm font-semibold text-highlighted">
                Tags
              </h4>
            </div>
            <div class="flex flex-wrap gap-2">
              <UBadge
                v-for="tag in habit.tags"
                :key="tag.id"
                :label="tag.name"
                variant="subtle"
                color="neutral"
                size="sm"
              />
            </div>
          </div>

          <div v-if="scheduledWindow" class="text-sm">
            <span class="text-muted">Horário: </span>
            <span class="text-highlighted">
              {{ scheduledWindow }}
            </span>
          </div>
          <div class="text-sm">
            <span class="text-muted">Criado em: </span>
            <span class="text-highlighted">
              {{ formatDate(habit.createdAt) }}
            </span>
          </div>
          <div class="text-sm">
            <span class="text-muted">Última atualização: </span>
            <span class="text-highlighted">
              {{ formatDate(habit.updatedAt) }}
            </span>
          </div>
          <div v-if="habit.streak?.lastCompletedDate" class="text-sm">
            <span class="text-muted">Última conclusão: </span>
            <span class="text-highlighted">
              {{ formatDate(habit.streak.lastCompletedDate) }}
            </span>
          </div>
          <div v-if="habit.customDays?.length" class="text-sm">
            <span class="text-muted">Dias: </span>
            <span class="text-highlighted">
              {{ habit.customDays.map((d: number) => dayLabels[d]).join(', ') }}
            </span>
          </div>
          <div v-if="habit.timezone" class="text-sm">
            <span class="text-muted">Timezone: </span>
            <span class="text-highlighted">
              {{ habit.timezone }}
            </span>
          </div>
        </div>

        <div v-if="lawSections.length" class="space-y-3">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-layers-3" class="size-4 text-primary" />
            <h4 class="text-sm font-semibold text-highlighted">
              4 leis do hábito
            </h4>
          </div>

          <div class="grid gap-3">
            <UCard v-for="section in lawSections" :key="section.key">
              <div class="space-y-2">
                <div class="flex items-center gap-2">
                  <UIcon :name="section.icon" class="size-4 text-primary" />
                  <p class="text-sm font-medium text-highlighted">
                    {{ section.title }}
                  </p>
                </div>
                <div class="habit-rich-content text-sm text-muted" v-html="section.html" />
              </div>
            </UCard>
          </div>
        </div>

        <div v-if="triggerStacks.length || incomingStacks.length" class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-link-2" class="size-4 text-primary" />
              <h4 class="text-sm font-semibold text-highlighted">
                Empilhamento
              </h4>
            </div>

            <UButton
              icon="i-lucide-link"
              label="Empilhar"
              size="xs"
              variant="subtle"
              color="neutral"
              :disabled="props.stackActionsDisabled"
              @click="emit('stack')"
            />
          </div>

          <p v-if="props.stackActionsDisabled" class="text-xs text-muted">
            Visualização histórica: o empilhamento abaixo reflete a configuração válida nessa data.
          </p>

          <UCard v-if="incomingStacks.length">
            <div class="space-y-2">
              <p class="text-xs font-medium uppercase tracking-wide text-muted">
                Este hábito entra depois de
              </p>
              <div class="space-y-2">
                <div
                  v-for="stack in incomingStacks"
                  :key="stack.id"
                  class="group flex items-center gap-2 rounded-lg border border-default p-2 transition-colors hover:bg-elevated/50"
                >
                  <UIcon name="i-lucide-zap" class="size-3.5 shrink-0 text-warning" />
                  <span class="text-sm text-highlighted truncate flex-1">
                    {{ stack.triggerHabit?.name ?? 'Hábito removido' }}
                  </span>
                  <UButton
                    v-if="!props.stackActionsDisabled"
                    icon="i-lucide-x"
                    color="error"
                    variant="ghost"
                    size="xs"
                    aria-label="Remover empilhamento"
                    class="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    @click="emit('remove-stack', stack.id)"
                  />
                </div>
              </div>
            </div>
          </UCard>

          <UCard v-if="triggerStacks.length">
            <div class="space-y-2">
              <p class="text-xs font-medium uppercase tracking-wide text-muted">
                Depois deste hábito, faça
              </p>
              <div class="space-y-2">
                <div
                  v-for="stack in triggerStacks"
                  :key="stack.id"
                  class="group flex items-center gap-2 rounded-lg border border-default p-2 transition-colors hover:bg-elevated/50"
                >
                  <UIcon name="i-lucide-target" class="size-3.5 shrink-0 text-success" />
                  <span class="text-sm text-highlighted truncate flex-1">
                    {{ stack.newHabit?.name ?? 'Hábito removido' }}
                  </span>
                  <UButton
                    v-if="!props.stackActionsDisabled"
                    icon="i-lucide-x"
                    color="error"
                    variant="ghost"
                    size="xs"
                    aria-label="Remover empilhamento"
                    class="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    @click="emit('remove-stack', stack.id)"
                  />
                </div>
              </div>
            </div>
          </UCard>
        </div>

        <div v-else class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-link-2" class="size-4 text-primary" />
              <h4 class="text-sm font-semibold text-highlighted">
                Empilhamento
              </h4>
            </div>

            <UButton
              icon="i-lucide-link"
              label="Empilhar"
              size="xs"
              variant="subtle"
              color="neutral"
              :disabled="props.stackActionsDisabled"
              @click="emit('stack')"
            />
          </div>

          <p v-if="props.stackActionsDisabled" class="text-xs text-muted">
            Visualização histórica: o empilhamento desta data não pode ser alterado por aqui.
          </p>

          <UCard>
            <p class="text-sm text-muted">
              Defina o que deve acontecer depois deste hábito para criar uma sequência clara de ações.
            </p>
          </UCard>
        </div>

        <!-- Calendar (always visible, no tab needed) -->
        <HabitsCalendar :habit-id="habit.id" />

        <!-- Change history -->
        <UCollapsible v-model:open="historyOpen">
          <button
            type="button"
            class="flex w-full items-center justify-between gap-2 rounded-lg py-1 text-left"
          >
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-history" class="size-4 text-primary" />
              <h4 class="text-sm font-semibold text-highlighted">
                Histórico de alterações
              </h4>
            </div>
            <UIcon
              name="i-lucide-chevron-down"
              class="size-4 text-muted transition-transform"
              :class="{ 'rotate-180': historyOpen }"
            />
          </button>

          <template #content>
            <div class="pt-3">
              <HabitsChangeHistoryList ref="changeHistoryRef" :habit-id="habit.id" />
            </div>
          </template>
        </UCollapsible>
      </div>
    </template>
  </USlideover>
</template>

<style scoped>
.habit-description :deep(p) {
  margin: 0;
}

.habit-description :deep(p + p),
.habit-description :deep(ul + p),
.habit-description :deep(ol + p),
.habit-description :deep(blockquote + p),
.habit-description :deep(p + ul),
.habit-description :deep(p + ol) {
  margin-top: 0.5rem;
}

.habit-description :deep(ul),
.habit-description :deep(ol) {
  padding-left: 1.25rem;
}

.habit-description :deep(blockquote) {
  margin-top: 0.5rem;
  border-left: 2px solid var(--ui-border);
  padding-left: 0.75rem;
  color: var(--ui-text-muted);
}

.habit-description :deep(a) {
  color: var(--ui-primary);
  text-decoration: underline;
}

.habit-rich-content :deep(p) {
  margin: 0;
}

.habit-rich-content :deep(p + p),
.habit-rich-content :deep(ul + p),
.habit-rich-content :deep(ol + p),
.habit-rich-content :deep(blockquote + p),
.habit-rich-content :deep(p + ul),
.habit-rich-content :deep(p + ol) {
  margin-top: 0.5rem;
}

.habit-rich-content :deep(ul),
.habit-rich-content :deep(ol) {
  padding-left: 1.25rem;
}

.habit-rich-content :deep(blockquote) {
  margin-top: 0.5rem;
  border-left: 2px solid var(--ui-border);
  padding-left: 0.75rem;
  color: var(--ui-text-muted);
}

.habit-rich-content :deep(a) {
  color: var(--ui-primary);
  text-decoration: underline;
}
</style>
