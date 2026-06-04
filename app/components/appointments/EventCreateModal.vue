<script setup lang="ts">
import { z } from 'zod'
import type { Calendar } from '~/types/appointments'
import { ReminderType } from '~/types/appointments'

const props = defineProps<{
  open: boolean
  calendars: Calendar[] | null | undefined
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'created': []
}>()

const { createEvent, recurrenceOptions, NONE_RECURRENCE_VALUE } = useAppointments()

const schema = z.object({
  calendarId: z.string().uuid('Selecione um calendário'),
  title: z.string().min(1, 'Título é obrigatório').max(200),
  description: z.string().max(2000).optional(),
  location: z.string().max(500).optional(),
  startDate: z.string().min(1, 'Data de início é obrigatória'),
  startTime: z.string().min(1, 'Hora de início é obrigatória'),
  endDate: z.string().min(1, 'Data de término é obrigatória'),
  endTime: z.string().min(1, 'Hora de término é obrigatória'),
  allDay: z.boolean().default(false),
  rrule: z.string().optional(),
  reminderMinutes: z.coerce.number().int().min(0).max(10080).default(10)
})

type FormState = z.infer<typeof schema>

const now = new Date()
const todayStr = now.toISOString().split('T')[0] ?? ''
const hourNow = String(now.getHours()).padStart(2, '0')
const minuteSnapped = String(Math.ceil(now.getMinutes() / 15) * 15 % 60).padStart(2, '0')
const startTimeDefault = `${minuteSnapped === '00' && now.getMinutes() >= 45 ? String(now.getHours() + 1).padStart(2, '0') : hourNow}:${minuteSnapped}`

const state = reactive<FormState>({
  calendarId: '',
  title: '',
  description: '',
  location: '',
  startDate: todayStr,
  startTime: startTimeDefault,
  endDate: todayStr,
  endTime: `${String(Number(startTimeDefault.split(':')[0]) + 1).padStart(2, '0')}:${startTimeDefault.split(':')[1]}`,
  allDay: false,
  rrule: '',
  reminderMinutes: 10
})

const rruleModel = computed({
  get: () => state.rrule || NONE_RECURRENCE_VALUE,
  set: (value: string) => { state.rrule = value === NONE_RECURRENCE_VALUE ? '' : value }
})

const loading = ref(false)

const calendarOptions = computed(() =>
  (props.calendars ?? []).map(c => ({ label: c.name, value: c.id }))
)

const selectedCalendar = computed(() =>
  (props.calendars ?? []).find(c => c.id === state.calendarId)
)

watch(() => props.calendars, (cals) => {
  if (cals && cals.length > 0 && !state.calendarId) {
    state.calendarId = cals[0]?.id ?? ''
  }
}, { immediate: true })

const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

async function onSubmit() {
  if (loading.value) return
  const startAt = `${state.startDate}T${state.allDay ? '00:00:00' : state.startTime + ':00'}`
  const endAt = `${state.endDate}T${state.allDay ? '23:59:59' : state.endTime + ':00'}`

  if (new Date(endAt) <= new Date(startAt)) return

  loading.value = true
  try {
    const result = await createEvent({
      calendarId: state.calendarId,
      title: state.title,
      description: state.description || undefined,
      location: state.location || undefined,
      startAt: new Date(startAt).toISOString(),
      endAt: new Date(endAt).toISOString(),
      eventTimezone: timezone,
      allDay: state.allDay,
      rrule: state.rrule || undefined,
      reminders: state.reminderMinutes >= 0
        ? [{ type: ReminderType.Popup, minutesBefore: state.reminderMinutes }]
        : undefined
    })

    if (result) {
      state.title = ''
      state.description = ''
      state.location = ''
      state.rrule = ''
      state.allDay = false
      state.reminderMinutes = 10
      emit('update:open', false)
      emit('created')
    }
  } finally {
    loading.value = false
  }
}

const reminderOptions = [
  { label: 'Sem lembrete', value: -1 },
  { label: '5 min antes', value: 5 },
  { label: '10 min antes', value: 10 },
  { label: '15 min antes', value: 15 },
  { label: '30 min antes', value: 30 },
  { label: '1 hora antes', value: 60 },
  { label: '1 dia antes', value: 1440 }
]
</script>

<template>
  <UModal
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-calendar-plus" class="size-4 text-muted" />
        <span class="text-sm font-semibold text-highlighted">Novo evento</span>
      </div>
    </template>

    <template #body>
      <UForm
        :schema="schema"
        :state="state"
        class="space-y-0"
        @submit="onSubmit"
      >
        <!-- Title — prominent, no label -->
        <div class="pb-4">
          <UInput
            v-model="state.title"
            placeholder="Adicionar título"
            variant="none"
            size="lg"
            autofocus
            class="w-full text-lg font-medium [&_input]:text-base [&_input]:font-medium [&_input]:placeholder:text-muted/50"
          />
          <div class="border-b border-default" />
        </div>

        <!-- Date / Time / All-day -->
        <div class="py-3">
          <div class="flex items-start gap-3">
            <UIcon name="i-lucide-clock" class="mt-2 size-4 shrink-0 text-muted" />
            <div class="flex-1 space-y-2">
              <!-- All-day toggle -->
              <div class="flex items-center gap-2">
                <UCheckbox
                  :model-value="state.allDay"
                  label="Dia inteiro"
                  size="sm"
                  @update:model-value="state.allDay = Boolean($event)"
                />
              </div>
              <!-- Start row -->
              <div class="flex items-center gap-2">
                <UInput
                  v-model="state.startDate"
                  type="date"
                  size="sm"
                  class="w-36"
                />
                <UInput
                  v-if="!state.allDay"
                  v-model="state.startTime"
                  type="time"
                  size="sm"
                  class="w-28"
                />
                <span class="text-xs text-muted">até</span>
                <UInput
                  v-model="state.endDate"
                  type="date"
                  size="sm"
                  class="w-36"
                />
                <UInput
                  v-if="!state.allDay"
                  v-model="state.endTime"
                  type="time"
                  size="sm"
                  class="w-28"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="border-t border-default/50" />

        <!-- Location -->
        <div class="py-3">
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-map-pin" class="size-4 shrink-0 text-muted" />
            <UInput
              v-model="state.location"
              placeholder="Adicionar local"
              variant="none"
              size="sm"
              class="flex-1"
            />
          </div>
        </div>

        <div class="border-t border-default/50" />

        <!-- Recurrence -->
        <div class="py-3">
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-repeat" class="size-4 shrink-0 text-muted" />
            <USelect
              v-model="rruleModel"
              :items="recurrenceOptions"
              value-key="value"
              size="sm"
              class="w-48"
            />
          </div>
        </div>

        <div class="border-t border-default/50" />

        <!-- Reminder -->
        <div class="py-3">
          <div class="flex items-center gap-3">
            <UIcon name="i-lucide-bell" class="size-4 shrink-0 text-muted" />
            <USelect
              v-model="state.reminderMinutes"
              :items="reminderOptions"
              value-key="value"
              size="sm"
              class="w-44"
            />
          </div>
        </div>

        <div class="border-t border-default/50" />

        <!-- Calendar -->
        <div class="py-3">
          <div class="flex items-center gap-3">
            <span
              class="inline-flex size-4 shrink-0 items-center justify-center rounded-full"
              :style="{ backgroundColor: selectedCalendar?.color ?? '#10b981' }"
            />
            <USelect
              v-model="state.calendarId"
              :items="calendarOptions"
              placeholder="Selecione um calendário"
              size="sm"
              class="w-52"
            />
          </div>
        </div>

        <div class="border-t border-default/50" />

        <!-- Description -->
        <div class="py-3">
          <div class="flex items-start gap-3">
            <UIcon name="i-lucide-align-left" class="mt-1.5 size-4 shrink-0 text-muted" />
            <UTextarea
              v-model="state.description"
              placeholder="Adicionar descrição"
              variant="none"
              :rows="2"
              class="flex-1 resize-none"
            />
          </div>
        </div>

        <!-- Actions -->
        <div class="flex justify-end gap-2 border-t border-default pt-4">
          <UButton
            label="Cancelar"
            variant="ghost"
            color="neutral"
            size="sm"
            @click="emit('update:open', false)"
          />
          <UButton
            type="submit"
            label="Salvar"
            size="sm"
            :loading="loading"
            :disabled="!state.title.trim() || loading"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
