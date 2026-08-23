<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { DriveStep, Driver } from 'driver.js'
import type { Calendar } from '~/types/appointments'
import type { Goal } from '~/types/goals'
import { HabitFrequency, HabitDifficulty, HabitType } from '~/types/habits'
import { GuidedTourKey } from '~/types/guided-tour'
import { HABIT_TEMPLATES, type HabitTemplate } from '~/utils/habit-templates'

const RICH_TEXT_MAX_LENGTH = 10000

const formSectionItems = [
  {
    label: 'Agendamento',
    value: 'schedule',
    slot: 'schedule',
    icon: 'i-lucide-clock-3'
  },
  {
    label: '4 leis',
    value: 'strategy',
    slot: 'strategy',
    icon: 'i-lucide-layers-3'
  }
]

const FORM_ID = 'habit-create-form'
const ALL_WEEK_DAYS = [0, 1, 2, 3, 4, 5, 6]

const props = defineProps<{
  open: boolean
  guidedTourEnabled?: boolean
  initialGoalId?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'created': []
}>()

const {
  createHabit,
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
const { calendars, calendarsStatus, refreshCalendars } = useAppointments()
const { linkHabit } = useGoalActions()
const { startIfNeeded } = useGuidedTour()

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

const schema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(200),
  avatarEmoji: z.string().max(16).optional(),
  description: z.string().max(RICH_TEXT_MAX_LENGTH).optional(),
  obviousStrategy: z.string().max(RICH_TEXT_MAX_LENGTH).optional(),
  attractiveStrategy: z.string().max(RICH_TEXT_MAX_LENGTH).optional(),
  easyStrategy: z.string().max(RICH_TEXT_MAX_LENGTH).optional(),
  satisfyingStrategy: z.string().max(RICH_TEXT_MAX_LENGTH).optional(),
  emergencyVersion: z.string().max(500).optional(),
  difficulty: z.nativeEnum(HabitDifficulty).default(HabitDifficulty.Normal),
  habitType: z.nativeEnum(HabitType).default(HabitType.Positive),
  identityId: z.string().uuid().optional(),
  calendarId: z.string().uuid().optional(),
  customDays: z
    .array(z.number().int().min(0).max(6))
    .min(1, 'Selecione ao menos um dia'),
  scheduledTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Formato HH:mm')
    .optional(),
  scheduledEndTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Formato HH:mm')
    .optional()
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
  emergencyVersion: '',
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
let createHabitTour: Driver | null = null

// ─── Templates ────────────────────────────────────────────────────────────────
const modalMode = ref<'custom' | 'template'>('custom')
const templateFilter = ref<string | undefined>(undefined)

const modeItems = [
  { label: 'Personalizado', value: 'custom' },
  { label: 'Começar de um template', value: 'template' }
]

const templateCategories = computed(() => [...new Set(HABIT_TEMPLATES.map(t => t.category))])

const templateFilterOptions = computed(() => [
  { label: 'Todas as áreas', value: undefined },
  ...templateCategories.value.map(category => ({ label: category, value: category }))
])

const filteredTemplates = computed(() =>
  templateFilter.value
    ? HABIT_TEMPLATES.filter(t => t.category === templateFilter.value)
    : HABIT_TEMPLATES
)

function applyTemplate(template: HabitTemplate) {
  state.name = template.name
  state.description = template.description
  state.difficulty = template.difficulty
  state.habitType = template.habitType ?? HabitType.Positive
  state.obviousStrategy = template.obviousStrategy ?? ''
  state.attractiveStrategy = template.attractiveStrategy ?? ''
  state.easyStrategy = template.easyStrategy ?? ''
  state.satisfyingStrategy = template.satisfyingStrategy ?? ''
  state.avatarEmoji = template.emoji
  state.customDays = template.frequency === HabitFrequency.Weekly
    ? [1]
    : template.frequency === HabitFrequency.Custom
      ? [...(template.customDays ?? [1, 2, 3, 4, 5])]
      : [...ALL_WEEK_DAYS]
  modalMode.value = 'custom'
}

watch(
  () => props.open,
  async (open) => {
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
      selectedGoalId.value = props.initialGoalId

      if (props.guidedTourEnabled) {
        createHabitTour = await startIfNeeded({
          key: GuidedTourKey.HabitsFirstHabitCreate,
          onDestroyed: () => {
            createHabitTour = null
            activeFormTab.value = undefined
          },
          steps: buildCreateHabitTourSteps()
        })
      }
    }

    if (!open) {
      createHabitTour?.destroy()
      createHabitTour = null
      activeFormTab.value = undefined
    }
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
    ...(calendars.value ?? []).map((calendar: Calendar) => ({
      label: calendar.name,
      value: calendar.id
    }))
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
    const frequencySelection = normalizeFrequencySelection(
      event.data.customDays
    )
    const result = await createHabit({
      description: normalizeRichText(event.data.description),
      obviousStrategy: normalizeRichText(event.data.obviousStrategy),
      attractiveStrategy: normalizeRichText(event.data.attractiveStrategy),
      easyStrategy: normalizeRichText(event.data.easyStrategy),
      satisfyingStrategy: normalizeRichText(event.data.satisfyingStrategy),
      emergencyVersion: event.data.emergencyVersion?.trim() || undefined,
      name: event.data.name,
      avatarEmoji: event.data.avatarEmoji,
      difficulty: event.data.difficulty,
      habitType: event.data.habitType,
      identityId: event.data.identityId,
      calendarId: event.data.calendarId,
      frequency: frequencySelection.frequency,
      customDays: frequencySelection.customDays,
      scheduledTime: event.data.scheduledTime || undefined,
      scheduledEndTime: event.data.scheduledEndTime || undefined,
      tagIds:
        selectedTagIds.value.length > 0 ? selectedTagIds.value : undefined
    })
    if (result) {
      if (selectedGoalId.value) {
        await linkHabit(selectedGoalId.value, { habitId: result.id })
      }
      resetForm()
      emit('created')
      emit('update:open', false)
    }
  } finally {
    loading.value = false
  }
}

function resetForm() {
  selectedGoalId.value = undefined
  state.name = ''
  state.avatarEmoji = undefined
  state.description = ''
  state.obviousStrategy = ''
  state.attractiveStrategy = ''
  state.easyStrategy = ''
  state.satisfyingStrategy = ''
  state.emergencyVersion = ''
  state.difficulty = HabitDifficulty.Normal
  state.habitType = HabitType.Positive
  state.identityId = undefined
  state.calendarId = undefined
  state.customDays = [...ALL_WEEK_DAYS]
  state.scheduledTime = undefined
  state.scheduledEndTime = undefined
  selectedTagIds.value = []
  activeFormTab.value = undefined
  avatarPopoverOpen.value = false
  modalMode.value = 'custom'
  templateFilter.value = undefined
}

function onClose() {
  createHabitTour?.destroy()
  createHabitTour = null
  activeFormTab.value = undefined
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
    const exists = (items ?? []).some(
      identity => identity.id === state.identityId
    )
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

function getVisibleElement(selectors: string | string[]): HTMLElement {
  const selectorList = Array.isArray(selectors) ? selectors : [selectors]

  for (const selector of selectorList) {
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(selector)
    )
    const visible = elements.find(element => element.offsetParent !== null)

    if (visible) {
      return visible
    }
  }

  return document.body
}

function getCreateFormSectionElement(value: string): HTMLElement {
  const sectionsRoot = document.querySelector(
    '[data-tour="habit-create-sections"]'
  )
  if (!sectionsRoot) {
    return document.body
  }

  const sectionLabels: Record<string, string> = {
    schedule: 'Agendamento',
    strategy: '4 leis'
  }

  return (
    Array.from(
      sectionsRoot.querySelectorAll<HTMLElement>('[data-slot="trigger"]')
    ).find((trigger) => {
      const triggerValue = trigger.getAttribute('data-value')
      const triggerText = trigger.textContent?.trim()

      return triggerValue === value || triggerText === sectionLabels[value]
    }) ?? document.body
  )
}

async function focusCreateFormSection(value: string) {
  activeFormTab.value = value
  await nextTick()
}

function buildCreateHabitTourSteps(): DriveStep[] {
  return [
    {
      element: '[data-tour="habit-create-sections"]',
      popover: {
        title: 'O formulário está dividido por seções',
        description:
          'Use este accordion para navegar entre dados principais, agendamento e as 4 leis sem concentrar tudo em uma única etapa.',
        showButtons: ['next', 'close'],
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: '[data-tour="habit-create-name"]',
      popover: {
        title: 'Dê um nome claro ao hábito',
        description:
          'Escreva a ação de forma objetiva. Isso ajuda na execução diária e também na leitura das notificações e da agenda.'
      }
    },
    {
      element: '[data-tour="habit-create-days"]',
      popover: {
        title: 'Defina quando o hábito acontece',
        description:
          'Selecione os dias da semana em que o hábito deve aparecer. Os atalhos ajudam a montar rotinas diárias, dias úteis ou fim de semana.',
        onNextClick: async (_element, _step, { driver }) => {
          await focusCreateFormSection('schedule')
          driver.moveNext()
        }
      }
    },
    {
      element: () => getCreateFormSectionElement('schedule'),
      popover: {
        title: 'Agendamento fica em uma seção própria',
        description:
          'Aqui você define a referência de horário que vai posicionar o hábito na agenda diária do usuário.',
        onNextClick: async (_element, _step, { driver }) => {
          driver.moveNext()
        },
        onPrevClick: async (_element, _step, { driver }) => {
          driver.movePrevious()
        }
      }
    },
    {
      element: '[data-tour="habit-create-schedule-time"]',
      popover: {
        title: 'Use horário como referência de agenda',
        description:
          'O horário de início e, se necessário, o de término ajudam a distribuir o hábito no dia sem torná-lo um compromisso rígido.',
        onNextClick: async (_element, _step, { driver }) => {
          await focusCreateFormSection('strategy')
          driver.moveNext()
        },
        onPrevClick: async (_element, _step, { driver }) => {
          driver.movePrevious()
        }
      }
    },
    {
      element: () => getCreateFormSectionElement('strategy'),
      popover: {
        title: 'As 4 leis ficam concentradas nesta seção',
        description:
          'Nesta etapa você associa a identidade e descreve como tornar o hábito óbvio, atraente, fácil e satisfatório.',
        onNextClick: async (_element, _step, { driver }) => {
          driver.moveNext()
        },
        onPrevClick: async (_element, _step, { driver }) => {
          await focusCreateFormSection('schedule')
          driver.movePrevious()
        }
      }
    },
    {
      element: '[data-tour="habit-create-identity"]',
      popover: {
        title: 'Selecione a identidade certa',
        description:
          'A identidade conecta o hábito ao tipo de pessoa que o usuário quer se tornar, o que melhora leitura dos insights e da revisão.',
        onPrevClick: async (_element, _step, { driver }) => {
          driver.movePrevious()
        }
      }
    },
    {
      element: () => getVisibleElement('[data-tour="habit-create-submit"]'),
      popover: {
        title: 'Salve para começar a acompanhar',
        description:
          'Quando terminar, salve o hábito para ele entrar na rotina diária, nas notificações e nas próximas análises da tela.',
        doneBtnText: 'Concluir',
        showButtons: ['previous', 'next', 'close'],
        onPrevClick: async (_element, _step, { driver }) => {
          driver.movePrevious()
        }
      }
    }
  ]
}

onBeforeUnmount(() => {
  createHabitTour?.destroy()
  createHabitTour = null
})
</script>

<template>
  <UModal
    :open="props.open"
    scrollable
    title="Novo hábito"
    description="Comece pequeno. Um passo de cada vez."
    :ui="{
      overlay: 'z-[200] bg-elevated/75',
      content: 'z-[210] w-[calc(100vw-2rem)] max-w-4xl overflow-visible',
      body: 'px-6 pt-5 pb-8 sm:px-6 sm:pt-5 sm:pb-8',
      footer: 'border-t border-default px-6 pb-[max(1rem,var(--safe-area-bottom))] pt-4'
    }"
    @update:open="onClose"
  >
    <template #body>
      <UTabs
        :items="modeItems"
        :model-value="modalMode"
        class="mb-4"
        @update:model-value="modalMode = $event as 'custom' | 'template'"
      />

      <!-- Template gallery -->
      <div v-if="modalMode === 'template'" class="space-y-3">
        <USelect
          v-model="templateFilter"
          :items="templateFilterOptions"
          value-key="value"
          placeholder="Filtrar por área"
          class="w-full"
        />
        <div class="grid max-h-96 gap-2 overflow-y-auto sm:grid-cols-2">
          <button
            v-for="template in filteredTemplates"
            :key="template.id"
            type="button"
            class="flex flex-col items-start gap-1 rounded-xl border border-default p-3 text-left transition-colors hover:bg-elevated"
            @click="applyTemplate(template)"
          >
            <span class="text-2xl">{{ template.emoji }}</span>
            <p class="text-sm font-medium text-highlighted">
              {{ template.name }}
            </p>
            <p class="text-xs text-muted">
              {{ template.category }}
            </p>
          </button>
        </div>
      </div>

      <UForm
        v-else
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
            <UInput
              v-model="state.name"
              data-tour="habit-create-name"
              placeholder="Ex: Ler 10 páginas"
              class="w-full"
            />
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
            data-tour="habit-create-days"
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
                    state.customDays?.includes(day.value)
                      ? 'primary'
                      : 'neutral'
                  "
                  :variant="
                    state.customDays?.includes(day.value) ? 'solid' : 'outline'
                  "
                  @click="toggleDay(day.value)"
                />
              </div>
            </div>
          </UFormField>

          <div class="space-y-4 grid gap-4 lg:grid-cols-2">
            <UFormField label="Dificuldade" name="difficulty">
              <div class="flex flex-wrap gap-2">
                <UButton
                  v-for="opt in difficultyOptions"
                  :key="opt.value"
                  type="button"
                  :label="opt.label"
                  :icon="getHabitDifficultyIcon(opt.value)"
                  size="sm"
                  :color="
                    state.difficulty === opt.value ? 'primary' : 'neutral'
                  "
                  :variant="
                    state.difficulty === opt.value ? 'solid' : 'outline'
                  "
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
                  :color="
                    state.habitType === opt.value
                      ? opt.value === HabitType.Positive
                        ? 'success'
                        : 'error'
                      : 'neutral'
                  "
                  :variant="state.habitType === opt.value ? 'solid' : 'outline'"
                  @click="state.habitType = opt.value"
                />
              </div>
            </UFormField>
          </div>

          <UFormField label="Tags" name="tags">
            <USelectMenu
              v-model="selectedTagIds"
              :items="(tags ?? []).map((t) => ({ label: t.name, value: t.id }))"
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
          data-tour="habit-create-sections"
          :unmount-on-hide="false"
          :ui="{
            root: 'space-y-4',
            item: 'rounded-lg border border-default bg-default/40',
            trigger:
              'gap-3 rounded-lg px-4 py-3 text-sm font-medium text-highlighted hover:bg-elevated/60',
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
                    Defina um horário para o hábito aparecer como guia do seu
                    dia. Isso ajuda a organizar a rotina sem transformar o
                    hábito em compromisso rígido.
                  </p>
                </div>
              </UCard>

              <div class="grid gap-4 lg:grid-cols-2">
                <UFormField
                  label="Horário de início"
                  name="scheduledTime"
                  data-tour="habit-create-schedule-time"
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
                  description="Use quando o hábito tiver janela de execução."
                >
                  <UiTimePicker
                    v-model="state.scheduledEndTime"
                    placeholder="Selecione o término"
                  />
                </UFormField>
              </div>

              <UFormField label="Calendário" name="calendarId">
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
                  data-tour="habit-create-identity"
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

              <UFormField
                label="Versão de emergência"
                name="emergencyVersion"
                description="Uma versão mínima para dias difíceis — ainda conta como feito."
              >
                <UInput
                  v-model="state.emergencyVersion"
                  placeholder="Ex: 1 flexão em vez de 20 minutos de treino"
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
          v-if="modalMode === 'custom'"
          icon="i-lucide-check"
          label="Salvar"
          data-tour="habit-create-submit"
          type="submit"
          :form="FORM_ID"
          :loading="loading"
          :disabled="loading"
        />
      </div>
    </template>
  </UModal>
</template>
