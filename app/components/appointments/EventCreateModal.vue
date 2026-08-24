<script setup lang="ts">
import { z } from 'zod'
import type { Calendar } from '~/types/appointments'
import { ReminderType } from '~/types/appointments'
import { strToDateValue, dateValueToStr, strToTimeValue, timeValueToStr, type TimeValue } from '~/utils/calendarDate'
import { zonedDateTimeToUtcIso } from '~/utils/calendarEventTime'

const props = defineProps<{
  open: boolean
  calendars: Calendar[] | null | undefined
  prefill?: { title: string, startAt: Date | null, location: string | null } | null
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
  startDate: z.string().min(1),
  startTime: z.string().min(1),
  endDate: z.string().min(1),
  endTime: z.string().min(1),
  allDay: z.boolean().default(false),
  rrule: z.string().optional(),
  reminderMinutes: z.coerce.number().int().min(-1).max(10080).default(10)
})

type FormState = z.infer<typeof schema>

function buildDefaults(): FormState {
  const base = props.prefill?.startAt ?? new Date()
  const h = base.getHours()
  const snapped = props.prefill?.startAt ? base.getMinutes() : Math.ceil(base.getMinutes() / 15) * 15
  const startH = snapped >= 60 ? h + 1 : h
  const startM = snapped >= 60 ? 0 : snapped
  const endH = startH + 1

  return {
    calendarId: props.calendars?.[0]?.id ?? '',
    title: props.prefill?.title ?? '',
    description: '',
    location: props.prefill?.location ?? '',
    startDate: base.toISOString().split('T')[0] ?? '',
    startTime: `${String(startH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`,
    endDate: base.toISOString().split('T')[0] ?? '',
    endTime: `${String(endH).padStart(2, '0')}:${String(startM).padStart(2, '0')}`,
    allDay: false,
    rrule: '',
    reminderMinutes: 10
  }
}

const state = reactive<FormState>(buildDefaults())

// Reset when opened
watch(() => props.open, (val) => {
  if (val) Object.assign(state, buildDefaults())
})

const rruleModel = computed({
  get: () => state.rrule || NONE_RECURRENCE_VALUE,
  set: (v: string) => { state.rrule = v === NONE_RECURRENCE_VALUE ? '' : v }
})

const loading = ref(false)

const calendarOptions = computed(() =>
  (props.calendars ?? []).map(c => ({ label: c.name, value: c.id }))
)

const selectedCalendar = computed(() =>
  (props.calendars ?? []).find(c => c.id === state.calendarId)
)

const calendarColor = computed(() => selectedCalendar.value?.color ?? '#10b981')

// ─── Date / time bindings for UInputDate + UInputTime ─────────────────────
const startDateValue = computed({
  get: () => strToDateValue(state.startDate),
  set: (v: ReturnType<typeof strToDateValue>) => { state.startDate = dateValueToStr(v) }
})

const endDateValue = computed({
  get: () => strToDateValue(state.endDate),
  set: (v: ReturnType<typeof strToDateValue>) => { state.endDate = dateValueToStr(v) }
})

const startTimeValue = computed({
  get: () => strToTimeValue(state.startTime),
  set: (v: TimeValue | undefined) => { state.startTime = timeValueToStr(v) }
})

const endTimeValue = computed({
  get: () => strToTimeValue(state.endTime),
  set: (v: TimeValue | undefined) => { state.endTime = timeValueToStr(v) }
})

watch(() => props.calendars, (cals) => {
  if (cals?.length && !state.calendarId) state.calendarId = cals[0]?.id ?? ''
}, { immediate: true })

const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

async function onSubmit() {
  if (loading.value || !state.title.trim()) return

  const startAt = `${state.startDate}T${state.allDay ? '00:00:00' : state.startTime + ':00'}`
  const endAt = `${state.endDate}T${state.allDay ? '23:59:59' : state.endTime + ':00'}`
  if (new Date(endAt) <= new Date(startAt)) return
  const startAtIso = zonedDateTimeToUtcIso(state.startDate, state.allDay ? '00:00' : state.startTime, timezone)
  const endAtIso = zonedDateTimeToUtcIso(state.endDate, state.allDay ? '23:59' : state.endTime, timezone)

  loading.value = true
  try {
    const result = await createEvent({
      calendarId: state.calendarId,
      title: state.title,
      description: state.description || undefined,
      location: state.location || undefined,
      startAt: startAtIso,
      endAt: endAtIso,
      eventTimezone: timezone,
      allDay: state.allDay,
      rrule: state.rrule || undefined,
      reminders: state.reminderMinutes >= 0
        ? [{ type: ReminderType.Popup, minutesBefore: state.reminderMinutes }]
        : undefined
    })

    if (result) {
      emit('update:open', false)
      emit('created')
    }
  } finally {
    loading.value = false
  }
}

function close() {
  emit('update:open', false)
}

// Escape to close
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

const reminderOptions = [
  { label: 'Sem lembrete', value: -1 },
  { label: '5 min antes', value: 5 },
  { label: '10 min antes', value: 10 },
  { label: '15 min antes', value: 15 },
  { label: '30 min antes', value: 30 },
  { label: '1 hora antes', value: 60 },
  { label: '1 dia antes', value: 1440 }
]

// ─── Date display helpers ─────────────────────────────────────────────────
function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y!, m! - 1, d!).toLocaleDateString('pt-BR', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
  })
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex flex-col bg-default"
      >
        <!-- ── Top bar ──────────────────────────────────────────────── -->
        <!-- This is a hand-rolled `fixed inset-0` overlay teleported to <body>,
             so it sits outside UDashboardGroup/UModal — none of the app-wide
             safe-area handling (kortex-app-shell, app.config.ts's modal/
             slideover slots) reaches it. Without its own top padding, the
             header sits flush at y=0 and the iOS status bar/notch paints
             directly over the title and Salvar button. -->
        <div
          class="flex min-h-14 shrink-0 items-center justify-between border-b border-default px-4 pt-[var(--safe-area-top)]"
        >
          <!-- Left: close + title -->
          <div class="flex items-center gap-3">
            <button
              class="rounded-full p-1.5 text-muted transition-colors hover:bg-elevated hover:text-highlighted"
              @click="close"
            >
              <UIcon name="i-lucide-x" class="size-5" />
            </button>
            <span class="text-base font-semibold text-highlighted">Novo evento</span>
          </div>

          <!-- Right: save -->
          <UButton
            label="Salvar"
            :loading="loading"
            :disabled="!state.title.trim() || loading"
            @click="onSubmit"
          />
        </div>

        <!-- ── Scrollable form body ─────────────────────────────────── -->
        <div class="flex-1 overflow-y-auto">
          <UForm
            :schema="schema"
            :state="state"
            class="mx-auto max-w-2xl space-y-0 px-6 py-8"
            @submit="onSubmit"
          >
            <!-- Title -->
            <div class="pb-6">
              <input
                v-model="state.title"
                type="text"
                placeholder="Adicionar título"
                autofocus
                class="w-full border-0 border-b-2 border-default bg-transparent pb-2 text-2xl font-medium text-highlighted placeholder:font-normal placeholder:text-muted/40 outline-none focus:border-primary transition-colors"
              >
            </div>

            <!-- Date / Time / All-day -->
            <div class="py-4">
              <div class="flex items-start gap-4">
                <UIcon name="i-lucide-clock" class="mt-1 size-5 shrink-0 text-muted" />
                <div class="flex-1 space-y-3">
                  <!-- All-day toggle -->
                  <UCheckbox
                    :model-value="state.allDay"
                    label="Dia inteiro"
                    @update:model-value="state.allDay = Boolean($event)"
                  />

                  <!-- Date/time row -->
                  <div class="flex flex-wrap items-center gap-2">
                    <UInputDate
                      v-model="startDateValue"
                      size="sm"
                      :leading-icon="null"
                    />
                    <UInputTime
                      v-if="!state.allDay"
                      v-model="startTimeValue"
                      granularity="minute"
                      size="sm"
                    />

                    <UIcon name="i-lucide-arrow-right" class="size-3.5 shrink-0 text-muted" />

                    <UInputDate
                      v-model="endDateValue"
                      size="sm"
                      :leading-icon="null"
                    />
                    <UInputTime
                      v-if="!state.allDay"
                      v-model="endTimeValue"
                      granularity="minute"
                      size="sm"
                    />
                  </div>

                  <!-- Friendly date summary -->
                  <p class="text-xs text-muted">
                    {{ formatDateDisplay(state.startDate) }}
                    <template v-if="state.startDate !== state.endDate">
                      → {{ formatDateDisplay(state.endDate) }}
                    </template>
                  </p>
                </div>
              </div>
            </div>

            <div class="border-t border-default/40" />

            <!-- Location -->
            <div class="py-4">
              <div class="flex items-center gap-4">
                <UIcon name="i-lucide-map-pin" class="size-5 shrink-0 text-muted" />
                <input
                  v-model="state.location"
                  type="text"
                  placeholder="Adicionar local ou link da videochamada"
                  class="flex-1 bg-transparent text-sm text-highlighted placeholder:text-muted/50 outline-none"
                >
              </div>
            </div>

            <div class="border-t border-default/40" />

            <!-- Description -->
            <div class="py-4">
              <div class="flex items-start gap-4">
                <UIcon name="i-lucide-align-left" class="mt-1 size-5 shrink-0 text-muted" />
                <textarea
                  v-model="state.description"
                  placeholder="Adicionar descrição"
                  rows="3"
                  class="flex-1 resize-none bg-transparent text-sm text-highlighted placeholder:text-muted/50 outline-none"
                />
              </div>
            </div>

            <div class="border-t border-default/40" />

            <!-- Calendar -->
            <div class="py-4">
              <div class="flex items-center gap-4">
                <span
                  class="inline-block size-5 shrink-0 rounded-full transition-colors"
                  :style="{ backgroundColor: calendarColor }"
                />
                <USelect
                  v-model="state.calendarId"
                  :items="calendarOptions"
                  variant="none"
                  size="sm"
                  class="w-56 text-sm"
                />
              </div>
            </div>

            <div class="border-t border-default/40" />

            <!-- Recurrence + Reminder row -->
            <div class="flex flex-wrap gap-6 py-4">
              <!-- Recurrence -->
              <div class="flex items-center gap-4">
                <UIcon name="i-lucide-repeat" class="size-5 shrink-0 text-muted" />
                <USelect
                  v-model="rruleModel"
                  :items="recurrenceOptions"
                  value-key="value"
                  variant="none"
                  size="sm"
                  class="w-52 text-sm"
                />
              </div>

              <!-- Reminder -->
              <div class="flex items-center gap-4">
                <UIcon name="i-lucide-bell" class="size-5 shrink-0 text-muted" />
                <USelect
                  v-model="state.reminderMinutes"
                  :items="reminderOptions"
                  value-key="value"
                  variant="none"
                  size="sm"
                  class="w-44 text-sm"
                />
              </div>
            </div>
          </UForm>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
