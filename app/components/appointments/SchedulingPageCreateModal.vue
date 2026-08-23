<script setup lang="ts">
import { z } from 'zod'
import type { Calendar } from '~/types/appointments'
import type { SchedulingPage, SchedulingQuestion } from '~/types/scheduling'
import { SchedulingLocationType, SchedulingQuestionType, LOCATION_TYPE_META } from '~/types/scheduling'

const props = defineProps<{
  open: boolean
  calendars: Calendar[] | null | undefined
  page?: SchedulingPage | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': []
}>()

const { createSchedulingPage, updateSchedulingPage } = useSchedulingPages()

const isEditing = computed(() => Boolean(props.page))
const loading = ref(false)
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

interface DayWindow {
  startTime: string
  endTime: string
}

const schema = z.object({
  title: z.string().min(1, 'Título é obrigatório').max(200),
  description: z.string().max(2000).optional(),
  calendarId: z.string().uuid('Selecione um calendário'),
  durationMinutes: z.number().int().min(5).max(480),
  locationType: z.nativeEnum(SchedulingLocationType),
  locationDetails: z.string().max(500).optional(),
  bufferBeforeMinutes: z.number().int().min(0).max(120),
  bufferAfterMinutes: z.number().int().min(0).max(120),
  slotIncrementMinutes: z.number().int().min(5).max(120),
  minNoticeHours: z.number().int().min(0).max(720),
  maxAdvanceDays: z.number().int().min(1).max(365),
  maxBookingsPerDay: z.number().int().min(1).max(100).optional()
})

type FormState = z.infer<typeof schema>

const state = reactive<FormState>({
  title: '',
  description: '',
  calendarId: '',
  durationMinutes: 30,
  locationType: SchedulingLocationType.VideoLink,
  locationDetails: '',
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  slotIncrementMinutes: 15,
  minNoticeHours: 4,
  maxAdvanceDays: 60,
  maxBookingsPerDay: undefined
})

const dayWindows = reactive<Record<number, DayWindow[]>>({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] })
const questions = ref<Array<Omit<SchedulingQuestion, 'id'>>>([])

function resetForm() {
  state.title = ''
  state.description = ''
  state.calendarId = props.calendars?.[0]?.id ?? ''
  state.durationMinutes = 30
  state.locationType = SchedulingLocationType.VideoLink
  state.locationDetails = ''
  state.bufferBeforeMinutes = 0
  state.bufferAfterMinutes = 0
  state.slotIncrementMinutes = 15
  state.minNoticeHours = 4
  state.maxAdvanceDays = 60
  state.maxBookingsPerDay = undefined
  for (let d = 0; d <= 6; d++) {
    dayWindows[d] = d >= 1 && d <= 5 ? [{ startTime: '09:00', endTime: '18:00' }] : []
  }
  questions.value = []
}

watch(() => [props.open, props.page] as const, ([open, page]) => {
  if (!open) return

  if (page) {
    state.title = page.title
    state.description = page.description ?? ''
    state.calendarId = page.calendarId
    state.durationMinutes = page.durationMinutes
    state.locationType = page.locationType
    state.locationDetails = page.locationDetails ?? ''
    state.bufferBeforeMinutes = page.bufferBeforeMinutes
    state.bufferAfterMinutes = page.bufferAfterMinutes
    state.slotIncrementMinutes = page.slotIncrementMinutes
    state.minNoticeHours = page.minNoticeHours
    state.maxAdvanceDays = page.maxAdvanceDays
    state.maxBookingsPerDay = page.maxBookingsPerDay ?? undefined

    for (let d = 0; d <= 6; d++) dayWindows[d] = []
    for (const rule of page.availabilityRules ?? []) {
      dayWindows[rule.dayOfWeek]!.push({ startTime: rule.startTime, endTime: rule.endTime })
    }

    questions.value = (page.questions ?? []).map(q => ({
      label: q.label,
      type: q.type,
      isRequired: q.isRequired,
      options: q.options,
      sortOrder: q.sortOrder
    }))
  } else {
    resetForm()
  }
}, { immediate: true })

const calendarOptions = computed(() => (props.calendars ?? []).map(c => ({ label: c.name, value: c.id })))

const locationOptions = Object.values(SchedulingLocationType).map(value => ({
  label: LOCATION_TYPE_META[value].label,
  value
}))

const questionTypeOptions = [
  { label: 'Texto curto', value: SchedulingQuestionType.Text },
  { label: 'Texto longo', value: SchedulingQuestionType.Textarea },
  { label: 'Seleção', value: SchedulingQuestionType.Select }
]

function addWindow(day: number) {
  dayWindows[day]!.push({ startTime: '09:00', endTime: '18:00' })
}

function removeWindow(day: number, index: number) {
  dayWindows[day]!.splice(index, 1)
}

function toggleDay(day: number) {
  if (dayWindows[day]!.length > 0) {
    dayWindows[day] = []
  } else {
    dayWindows[day] = [{ startTime: '09:00', endTime: '18:00' }]
  }
}

function addQuestion() {
  questions.value.push({ label: '', type: SchedulingQuestionType.Text, isRequired: false, options: null, sortOrder: questions.value.length })
}

function removeQuestion(index: number) {
  questions.value.splice(index, 1)
}

async function onSubmit() {
  if (loading.value) return

  const availabilityRules = Object.entries(dayWindows).flatMap(([day, windows]) =>
    windows.map(w => ({ dayOfWeek: Number(day), startTime: w.startTime, endTime: w.endTime }))
  )

  if (availabilityRules.length === 0) {
    useToast().add({ title: 'Erro', description: 'Defina ao menos uma janela de disponibilidade.', color: 'error' })
    return
  }

  loading.value = true
  try {
    const payload = {
      calendarId: state.calendarId,
      title: state.title,
      description: state.description || undefined,
      durationMinutes: state.durationMinutes,
      locationType: state.locationType,
      locationDetails: state.locationDetails || undefined,
      timezone,
      bufferBeforeMinutes: state.bufferBeforeMinutes,
      bufferAfterMinutes: state.bufferAfterMinutes,
      slotIncrementMinutes: state.slotIncrementMinutes,
      minNoticeHours: state.minNoticeHours,
      maxAdvanceDays: state.maxAdvanceDays,
      maxBookingsPerDay: state.maxBookingsPerDay ?? null,
      availabilityRules,
      questions: questions.value.filter(q => q.label.trim()).map((q, i) => ({ ...q, sortOrder: i }))
    }

    const result = props.page
      ? await updateSchedulingPage(props.page.id, payload)
      : await createSchedulingPage(payload)

    if (result) {
      emit('update:open', false)
      emit('saved')
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal
    :open="open"
    :title="isEditing ? 'Editar página de agendamento' : 'Nova página de agendamento'"
    :ui="{ content: 'max-w-2xl' }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <UForm
        :schema="schema"
        :state="state"
        class="max-h-[70vh] space-y-5 overflow-y-auto pr-1"
        @submit="onSubmit"
      >
        <UFormField label="Título" name="title">
          <UInput v-model="state.title" placeholder="Ex: Reunião de 30 minutos" class="w-full" />
        </UFormField>

        <UFormField label="Descrição" name="description">
          <UTextarea v-model="state.description" :rows="2" class="w-full" />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Calendário" name="calendarId">
            <USelect
              v-model="state.calendarId"
              :items="calendarOptions"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Duração (min)" name="durationMinutes">
            <UInputNumber
              v-model="state.durationMinutes"
              :min="5"
              :max="480"
              class="w-full"
            />
          </UFormField>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Tipo de local" name="locationType">
            <USelect
              v-model="state.locationType"
              :items="locationOptions"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Detalhe do local" name="locationDetails">
            <UInput v-model="state.locationDetails" placeholder="Ex: link do Zoom" class="w-full" />
          </UFormField>
        </div>

        <!-- Weekly availability -->
        <div class="space-y-2">
          <p class="text-sm font-medium text-highlighted">
            Disponibilidade semanal
          </p>
          <div class="space-y-2">
            <div v-for="day in 7" :key="day - 1" class="rounded-lg border border-default/60 p-2.5">
              <div class="flex items-center gap-2">
                <UCheckbox
                  :model-value="dayWindows[day - 1]!.length > 0"
                  :label="dayLabels[day - 1]"
                  @update:model-value="toggleDay(day - 1)"
                />
                <UButton
                  v-if="dayWindows[day - 1]!.length > 0"
                  icon="i-lucide-plus"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  class="ml-auto"
                  @click="addWindow(day - 1)"
                />
              </div>
              <div v-if="dayWindows[day - 1]!.length > 0" class="mt-2 space-y-1.5 pl-6">
                <div v-for="(w, wi) in dayWindows[day - 1]" :key="wi" class="flex items-center gap-2">
                  <UInput
                    v-model="w.startTime"
                    type="time"
                    size="sm"
                    class="w-28"
                  />
                  <span class="text-xs text-muted">até</span>
                  <UInput
                    v-model="w.endTime"
                    type="time"
                    size="sm"
                    class="w-28"
                  />
                  <UButton
                    icon="i-lucide-x"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    @click="removeWindow(day - 1, wi)"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-3">
          <UFormField label="Buffer antes (min)" name="bufferBeforeMinutes">
            <UInputNumber
              v-model="state.bufferBeforeMinutes"
              :min="0"
              :max="120"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Buffer depois (min)" name="bufferAfterMinutes">
            <UInputNumber
              v-model="state.bufferAfterMinutes"
              :min="0"
              :max="120"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Incremento (min)" name="slotIncrementMinutes">
            <UInputNumber
              v-model="state.slotIncrementMinutes"
              :min="5"
              :max="120"
              class="w-full"
            />
          </UFormField>
        </div>

        <div class="grid gap-4 sm:grid-cols-3">
          <UFormField label="Antecedência mín. (h)" name="minNoticeHours">
            <UInputNumber
              v-model="state.minNoticeHours"
              :min="0"
              :max="720"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Antecedência máx. (dias)" name="maxAdvanceDays">
            <UInputNumber
              v-model="state.maxAdvanceDays"
              :min="1"
              :max="365"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Máx. reservas/dia" name="maxBookingsPerDay">
            <UInputNumber
              v-model="state.maxBookingsPerDay"
              :min="1"
              :max="100"
              placeholder="Sem limite"
              class="w-full"
            />
          </UFormField>
        </div>

        <!-- Custom questions -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <p class="text-sm font-medium text-highlighted">
              Perguntas customizadas
            </p>
            <UButton
              icon="i-lucide-plus"
              label="Adicionar"
              size="xs"
              variant="subtle"
              @click="addQuestion"
            />
          </div>
          <div v-for="(q, qi) in questions" :key="qi" class="flex items-center gap-2 rounded-lg border border-default/60 p-2">
            <UInput
              v-model="q.label"
              placeholder="Pergunta"
              size="sm"
              class="flex-1"
            />
            <USelect
              v-model="q.type"
              :items="questionTypeOptions"
              value-key="value"
              size="sm"
              class="w-36"
            />
            <UCheckbox v-model="q.isRequired" label="Obrigatória" />
            <UButton
              icon="i-lucide-x"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="removeQuestion(qi)"
            />
          </div>
        </div>
      </UForm>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton
          label="Cancelar"
          color="neutral"
          variant="subtle"
          @click="emit('update:open', false)"
        />
        <UButton
          :label="isEditing ? 'Salvar' : 'Criar página'"
          :loading="loading"
          :disabled="loading || !state.title.trim() || !state.calendarId"
          @click="onSubmit"
        />
      </div>
    </template>
  </UModal>
</template>
