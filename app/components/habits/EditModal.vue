<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Calendar } from '~/types/appointments'
import type { Habit } from '~/types/habits'
import type { Goal } from '~/types/goals'
import { HabitFrequency, HabitDifficulty, HabitType } from '~/types/habits'

const RICH_TEXT_MAX_LENGTH = 10000

const formSectionItems = [
  { label: 'Agendamento', value: 'schedule', slot: 'schedule', icon: 'i-lucide-clock-3' },
  { label: '4 leis', value: 'strategy', slot: 'strategy', icon: 'i-lucide-layers-3' }
]

const FORM_ID = 'habit-edit-form'
const ALL_WEEK_DAYS = [0, 1, 2, 3, 4, 5, 6]

const props = defineProps<{
  open: boolean
  habit: Habit
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'updated': []
}>()

const {
  updateHabit,
  difficultyOptions,
  habitTypeOptions,
  dayOptions,
  identities,
  identitiesStatus,
  refreshIdentities,
  tags,
  tagsStatus,
  refreshTags
} = useHabits()
const {
  calendars,
  calendarsStatus,
  refreshCalendars
} = useAppointments()
const { linkHabit, unlinkHabit } = useGoalActions()

const goals = ref<Goal[]>([])
const goalsLoading = ref(false)
const selectedGoalId = ref<string | undefined>(undefined)

async function loadGoals() {
  goalsLoading.value = true
  try {
    const response = await $fetch<{ data: Goal[] }>('/api/goals', {
      query: { pageSize: 100, status: 'active' }
    })
    goals.value = response.data ?? []
  } catch {
    goals.value = []
  } finally {
    goalsLoading.value = false
  }
}

const schema = z
  .object({
    name: z.string().min(1, 'Nome é obrigatório').max(200),
    avatarEmoji: z.string().max(16).optional(),
    description: z.string().max(RICH_TEXT_MAX_LENGTH).optional(),
    obviousStrategy: z.string().max(RICH_TEXT_MAX_LENGTH).optional(),
    attractiveStrategy: z.string().max(RICH_TEXT_MAX_LENGTH).optional(),
    easyStrategy: z.string().max(RICH_TEXT_MAX_LENGTH).optional(),
    satisfyingStrategy: z.string().max(RICH_TEXT_MAX_LENGTH).optional(),
    difficulty: z.nativeEnum(HabitDifficulty),
    habitType: z.nativeEnum(HabitType),
    identityId: z.string().uuid().optional(),
    calendarId: z.string().uuid().optional(),
    customDays: z.array(z.number().int().min(0).max(6)).min(1, 'Selecione ao menos um dia'),
    scheduledTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:mm').optional(),
    scheduledEndTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato HH:mm').optional()
  })

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({
  name: '',
  avatarEmoji: undefined,
  description: '',
  obviousStrategy: '',
  attractiveStrategy: '',
  easyStrategy: '',
  satisfyingStrategy: '',
  difficulty: HabitDifficulty.Normal,
  habitType: HabitType.Positive,
  identityId: undefined,
  calendarId: undefined,
  customDays: [...ALL_WEEK_DAYS],
  scheduledTime: undefined,
  scheduledEndTime: undefined
})

const loading = ref(false)
const activeFormTab = ref<string | undefined>(undefined)
const selectedTagIds = ref<string[]>([])
const avatarPopoverOpen = ref(false)

watch(
  () => props.habit,
  (habit) => {
    if (habit) {
      state.name = habit.name
      state.avatarEmoji = habit.avatarEmoji ?? undefined
      state.description = habit.description ?? ''
      state.obviousStrategy = habit.obviousStrategy ?? ''
      state.attractiveStrategy = habit.attractiveStrategy ?? ''
      state.easyStrategy = habit.easyStrategy ?? ''
      state.satisfyingStrategy = habit.satisfyingStrategy ?? ''
      state.difficulty = habit.difficulty
      state.habitType = habit.habitType ?? HabitType.Positive
      state.identityId = habit.identityId ?? undefined
      state.calendarId = habit.calendarId ?? undefined
      state.customDays = toSelectedDays(habit.frequency, habit.customDays)
      state.scheduledTime = habit.scheduledTime ?? undefined
      state.scheduledEndTime = habit.scheduledEndTime ?? undefined
      selectedTagIds.value = (habit.tags ?? []).map(t => t.id)
      selectedGoalId.value = habit.goalId ?? undefined
    }
  },
  { immediate: true }
)

watch(
  () => props.open,
  (open) => {
    if (open) {
      if (identitiesStatus.value === 'idle') {
        void refreshIdentities()
      }

      if (tagsStatus.value === 'idle') {
        void refreshTags()
      }

      if (calendarsStatus.value === 'idle') {
        void refreshCalendars()
      }

      void loadGoals()
    }

    if (!open) activeFormTab.value = undefined
  }
)

const NONE_IDENTITY_VALUE = '__none__'
const NONE_GOAL_VALUE = '__none__'
const AUTO_CALENDAR_VALUE = '__auto__'

const goalIdModel = computed<string>({
  get: () => selectedGoalId.value || NONE_GOAL_VALUE,
  set: (value) => {
    selectedGoalId.value = value === NONE_GOAL_VALUE ? undefined : value
  }
})

const goalItems = computed(() => [
  { label: 'Nenhuma', value: NONE_GOAL_VALUE },
  ...goals.value.map(g => ({ label: g.title, value: g.id }))
])

const identityIdModel = computed<string | undefined>({
  get: () => state.identityId,
  set: (value) => {
    state.identityId = value === NONE_IDENTITY_VALUE ? undefined : value
  }
})

const calendarItems = computed(() => {
  return [
    { label: 'Automático', value: AUTO_CALENDAR_VALUE },
    ...((calendars.value ?? []).map((calendar: Calendar) => ({
      label: calendar.name,
      value: calendar.id
    })))
  ]
})

const calendarIdModel = computed<string>({
  get: () => state.calendarId || AUTO_CALENDAR_VALUE,
  set: (value) => {
    state.calendarId = value === AUTO_CALENDAR_VALUE ? undefined : value
  }
})

function normalizeRichText(value?: string | null) {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (loading.value) return
  loading.value = true
  try {
    const frequencySelection = normalizeFrequencySelection(event.data.customDays)
    const result = await updateHabit(props.habit.id, {
      name: event.data.name,
      avatarEmoji: event.data.avatarEmoji ?? null,
      description: normalizeRichText(event.data.description) ?? null,
      obviousStrategy: normalizeRichText(event.data.obviousStrategy) ?? null,
      attractiveStrategy: normalizeRichText(event.data.attractiveStrategy) ?? null,
      easyStrategy: normalizeRichText(event.data.easyStrategy) ?? null,
      satisfyingStrategy: normalizeRichText(event.data.satisfyingStrategy) ?? null,
      difficulty: event.data.difficulty,
      habitType: event.data.habitType,
      identityId: event.data.identityId ?? null,
      calendarId: event.data.calendarId ?? null,
      frequency: frequencySelection.frequency,
      customDays: frequencySelection.customDays,
      scheduledTime: event.data.scheduledTime || null,
      scheduledEndTime: event.data.scheduledEndTime || null,
      tagIds: selectedTagIds.value
    })
    if (result) {
      const previousGoalId = props.habit.goalId ?? undefined
      if (selectedGoalId.value !== previousGoalId) {
        if (props.habit.goalLinkId) {
          await unlinkHabit(props.habit.goalLinkId)
        }
        if (selectedGoalId.value) {
          await linkHabit(selectedGoalId.value, { habitId: props.habit.id })
        }
      }
      emit('updated')
      emit('update:open', false)
    }
  } finally {
    loading.value = false
  }
}

function onClose() {
  activeFormTab.value = undefined
  avatarPopoverOpen.value = false
  emit('update:open', false)
}

function toggleDay(day: number) {
  if (!state.customDays) state.customDays = []
  const idx = state.customDays.indexOf(day)
  if (idx >= 0) {
    state.customDays.splice(idx, 1)
  } else {
    state.customDays.push(day)
  }
}

function normalizeFrequencySelection(days: number[]) {
  const uniqueDays = [...new Set(days)].sort((a, b) => a - b)

  if (uniqueDays.length === ALL_WEEK_DAYS.length) {
    return {
      frequency: HabitFrequency.Daily,
      customDays: undefined
    }
  }

  return {
    frequency: HabitFrequency.Custom,
    customDays: uniqueDays
  }
}

function toSelectedDays(frequency: HabitFrequency, customDays: number[] | null) {
  if (frequency === HabitFrequency.Daily) {
    return [...ALL_WEEK_DAYS]
  }

  if (frequency === HabitFrequency.Weekly) {
    return [1]
  }

  return [...(customDays ?? [])].sort((a, b) => a - b)
}

const identityItems = computed(() => {
  return [
    { label: 'Nenhuma', value: NONE_IDENTITY_VALUE },
    ...(identities.value ?? []).map(i => ({ label: i.name, value: i.id }))
  ]
})

watch(
  identities,
  (items) => {
    if (!state.identityId) return
    const exists = (items ?? []).some(identity => identity.id === state.identityId)
    if (!exists) {
      state.identityId = undefined
    }
  },
  { deep: false }
)

function getHabitDifficultyIcon(difficulty: HabitDifficulty) {
  switch (difficulty) {
    case HabitDifficulty.Tiny:
      return 'i-lucide-feather'
    case HabitDifficulty.Normal:
      return 'i-lucide-shield'
    case HabitDifficulty.Hard:
      return 'i-lucide-mountain'
    default:
      return ''
  }
}

function getHabitTypeIcon(habitType: HabitType) {
  switch (habitType) {
    case HabitType.Positive:
      return 'i-lucide-thumbs-up'
    case HabitType.Negative:
      return 'i-lucide-thumbs-down'
    default:
      return ''
  }
}
</script>

<template>
  <UModal
    :open="props.open"
    scrollable
    title="Editar hábito"
    description="Ajuste o hábito para continuar evoluindo."
    :ui="{
      overlay: 'z-[200] bg-elevated/75',
      content: 'z-[210] w-[calc(100vw-2rem)] max-w-4xl overflow-visible',
      body: 'px-6 pt-5 pb-8 sm:px-6 sm:pt-5 sm:pb-8',
      footer: 'border-t border-default px-6 py-4'
    }"
    @update:open="onClose"
  >
    <template #body>
      <UForm
        :id="FORM_ID"
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <div class="space-y-4">
          <UFormField name="avatarEmoji">
            <UPopover
              v-model:open="avatarPopoverOpen"
              :content="{ align: 'start', side: 'bottom', sideOffset: 8 }"
              :ui="{
                content:
                  'z-[260] w-[min(92vw,30rem)] rounded-3xl border border-default bg-default p-0 shadow-2xl'
              }"
            >
              <button
                type="button"
                class="relative flex w-full flex-col items-center justify-center gap-3 rounded-2xl bg-default px-2 py-2 text-center"
              >
                <UAvatar
                  :text="state.avatarEmoji || '🙂'"
                  alt="Avatar do hábito"
                  size="3xl"
                  class="size-24 shrink-0 ring ring-default"
                  :ui="{
                    fallback: 'text-[28px] leading-none -translate-y-px'
                  }"
                />
              </button>

              <template #content>
                <div class="overflow-hidden rounded-3xl">
                  <AppEmojiPicker
                    @select="(emoji) => { state.avatarEmoji = emoji; avatarPopoverOpen = false }"
                  />
                  <button
                    v-if="state.avatarEmoji"
                    type="button"
                    class="w-full text-xs text-muted hover:text-error text-center py-1.5 border-t border-default"
                    @click="state.avatarEmoji = undefined; avatarPopoverOpen = false"
                  >
                    Remover emoji
                  </button>
                </div>
              </template>
            </UPopover>
          </UFormField>

          <UFormField label="Nome" name="name">
            <UInput v-model="state.name" class="w-full" />
          </UFormField>

          <UFormField label="Descrição" name="description">
            <RichTextEditor
              v-model="state.description"
              placeholder="Por que esse hábito é importante?"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Dias do hábito"
            name="customDays"
          >
            <div class="space-y-3">
              <div class="flex flex-wrap gap-2">
                <UButton
                  v-for="day in dayOptions"
                  :key="day.value"
                  type="button"
                  :label="day.label"
                  size="sm"
                  :color="
                    state.customDays?.includes(day.value) ? 'primary' : 'neutral'
                  "
                  :variant="
                    state.customDays?.includes(day.value) ? 'solid' : 'outline'
                  "
                  @click="toggleDay(day.value)"
                />
              </div>
            </div>
          </UFormField>

          <div class="space-y-4">
            <UFormField label="Dificuldade" name="difficulty">
              <div class="flex flex-wrap gap-2">
                <UButton
                  v-for="opt in difficultyOptions"
                  :key="opt.value"
                  type="button"
                  :label="opt.label"
                  size="sm"
                  :icon="getHabitDifficultyIcon(opt.value)"
                  :color="state.difficulty === opt.value ? 'primary' : 'neutral'"
                  :variant="state.difficulty === opt.value ? 'solid' : 'outline'"
                  @click="state.difficulty = opt.value"
                />
              </div>
            </UFormField>

            <UFormField label="Tipo" name="habitType">
              <div class="flex flex-wrap gap-2">
                <UButton
                  v-for="opt in habitTypeOptions"
                  :key="opt.value"
                  type="button"
                  :label="opt.label"
                  :icon="getHabitTypeIcon(opt.value)"
                  size="sm"
                  :color="state.habitType === opt.value ? (opt.value === HabitType.Positive ? 'success' : 'error') : 'neutral'"
                  :variant="state.habitType === opt.value ? 'solid' : 'outline'"
                  @click="state.habitType = opt.value"
                />
              </div>
            </UFormField>
          </div>

          <UFormField label="Tags" name="tags">
            <USelectMenu
              v-model="selectedTagIds"
              :items="(tags ?? []).map(t => ({ label: t.name, value: t.id }))"
              value-key="value"
              placeholder="Selecione tags..."
              multiple
              class="w-full"
            />
          </UFormField>
        </div>

        <UAccordion
          v-model="activeFormTab"
          :items="formSectionItems"
          class="w-full"
          :unmount-on-hide="false"
          :ui="{
            root: 'space-y-4',
            item: 'rounded-lg border border-default bg-default/40',
            trigger: 'gap-3 rounded-lg px-4 py-3 text-sm font-medium text-highlighted hover:bg-elevated/60',
            content: 'px-4 pb-0',
            body: 'pt-2 pb-4'
          }"
        >
          <template #schedule-body>
            <div class="space-y-5">
              <UCard>
                <div class="space-y-2">
                  <p class="text-sm font-medium text-highlighted">
                    Referência para sua agenda
                  </p>
                  <p class="text-sm text-muted">
                    Ajuste o horário para o hábito servir como âncora visual no seu planejamento diário.
                  </p>
                </div>
              </UCard>

              <div class="grid gap-4 lg:grid-cols-2">
                <UFormField
                  label="Horário de início"
                  name="scheduledTime"
                  description="Momento ideal para começar esse hábito."
                >
                  <UiTimePicker
                    v-model="state.scheduledTime"
                    placeholder="Selecione o início"
                  />
                </UFormField>

                <UFormField
                  label="Horário de término"
                  name="scheduledEndTime"
                  description="Opcional. Use quando houver uma janela de execução."
                >
                  <UiTimePicker
                    v-model="state.scheduledEndTime"
                    placeholder="Selecione o término"
                  />
                </UFormField>
              </div>

              <UFormField
                label="Calendário"
                name="calendarId"
              >
                <USelect
                  v-model="calendarIdModel"
                  :items="calendarItems"
                  value-key="value"
                  placeholder="Selecione..."
                  class="w-full"
                />
              </UFormField>
            </div>
          </template>

          <template #strategy-body>
            <div class="space-y-4">
              <UFormField label="Identidade" name="identityId">
                <USelect
                  v-model="identityIdModel"
                  :items="identityItems"
                  value-key="value"
                  placeholder="Quem você quer se tornar?"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Meta vinculada" name="goalId" description="Este hábito sustenta alguma meta?">
                <USelect
                  v-model="goalIdModel"
                  :items="goalItems"
                  :loading="goalsLoading"
                  value-key="value"
                  placeholder="Nenhuma"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Tornar Óbvio" name="obviousStrategy">
                <RichTextEditor
                  v-model="state.obviousStrategy"
                  placeholder="Como esse hábito vai ficar visível no seu ambiente e na sua rotina?"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Tornar Atraente" name="attractiveStrategy">
                <RichTextEditor
                  v-model="state.attractiveStrategy"
                  placeholder="O que pode tornar esse hábito mais desejável ou prazeroso?"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Tornar Fácil" name="easyStrategy">
                <RichTextEditor
                  v-model="state.easyStrategy"
                  placeholder="Como reduzir atrito e deixar a ação mais simples de começar?"
                  class="w-full"
                />
              </UFormField>

              <UFormField label="Tornar Satisfatório" name="satisfyingStrategy">
                <RichTextEditor
                  v-model="state.satisfyingStrategy"
                  placeholder="Qual recompensa imediata vai reforçar a repetição desse hábito?"
                  class="w-full"
                />
              </UFormField>
            </div>
          </template>
        </UAccordion>
      </UForm>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton
          icon="i-lucide-x"
          label="Cancelar"
          type="button"
          color="neutral"
          variant="subtle"
          @click="onClose"
        />
        <UButton
          icon="i-lucide-check"
          label="Salvar"
          type="submit"
          :form="FORM_ID"
          :loading="loading"
          :disabled="loading"
        />
      </div>
    </template>
  </UModal>
</template>
