<script setup lang="ts">
import { z } from 'zod'
import type { Calendar, CalendarEvent, EventParticipant } from '~/types/appointments'
import { RsvpStatus } from '~/types/appointments'
import { strToDateValue, dateValueToStr, strToTimeValue, timeValueToStr, type TimeValue } from '~/utils/calendarDate'
import { formatEventDate, formatEventTime, getEventTimeZone, getZonedDateParts, zonedDateTimeToUtcIso } from '~/utils/calendarEventTime'

const props = defineProps<{
  open: boolean
  event: CalendarEvent | null
  calendars: Calendar[] | null | undefined
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'updated': []
  'archived': []
}>()

const {
  updateEvent,
  archiveEvent,
  cancelOccurrence,
  modifyOccurrence,
  splitSeries,
  fetchParticipants,
  inviteParticipant,
  removeParticipant,
  respondRsvp,
  getRecurrenceLabel,
  recurrenceOptions,
  NONE_RECURRENCE_VALUE
} = useAppointments()
const { user } = useAuth()
const toast = useToast()

const editing = ref(false)
const saving = ref(false)
const archiving = ref(false)
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

const isOwner = computed(() => Boolean(props.event) && props.event?.ownerUserId === user.value?.id)

// ─── Occurrence edit scope ─────────────────────────────────────────────────
const scopeModalOpen = ref(false)
const pendingEditPayload = ref<{ title: string, description: string | null, location: string | null, startAt: string, endAt: string } | null>(null)

// ─── Participants ───────────────────────────────────────────────────────────
const participants = ref<EventParticipant[]>([])
const participantsLoading = ref(false)
const newParticipantEmail = ref('')
const invitingParticipant = ref(false)
const respondingRsvp = ref(false)

const myParticipation = computed(() =>
  participants.value.find(p => p.invitedUserId === user.value?.id) ?? null
)

const RSVP_META: Record<RsvpStatus, { label: string, color: 'neutral' | 'success' | 'error' | 'warning' }> = {
  [RsvpStatus.Pending]: { label: 'Pendente', color: 'neutral' },
  [RsvpStatus.Accepted]: { label: 'Confirmado', color: 'success' },
  [RsvpStatus.Declined]: { label: 'Recusou', color: 'error' },
  [RsvpStatus.Tentative]: { label: 'Talvez', color: 'warning' }
}

async function loadParticipants() {
  if (!props.event) return
  participantsLoading.value = true
  participants.value = await fetchParticipants(props.event.id)
  participantsLoading.value = false
}

async function onInviteParticipant() {
  const email = newParticipantEmail.value.trim()
  if (!email || !props.event) return
  invitingParticipant.value = true
  const created = await inviteParticipant(props.event.id, email)
  invitingParticipant.value = false
  if (created) {
    participants.value = [...participants.value, created]
    newParticipantEmail.value = ''
  }
}

async function onRemoveParticipant(participant: EventParticipant) {
  if (!props.event) return
  const ok = await removeParticipant(props.event.id, participant.id)
  if (ok) {
    participants.value = participants.value.filter(p => p.id !== participant.id)
  }
}

async function onRespondRsvp(status: RsvpStatus.Accepted | RsvpStatus.Declined | RsvpStatus.Tentative) {
  if (!props.event || !myParticipation.value) return
  respondingRsvp.value = true
  const ok = await respondRsvp(props.event.id, myParticipation.value.id, status)
  respondingRsvp.value = false
  if (ok) {
    myParticipation.value.rsvpStatus = status
  }
}

const schema = z.object({
  calendarId: z.string().uuid('Selecione um calendário'),
  title: z.string().min(1, 'Título é obrigatório').max(200),
  description: z.string().max(2000).optional(),
  location: z.string().max(500).optional(),
  startDate: z.string().min(1, 'Data de início é obrigatória'),
  startTime: z.string().optional(),
  endDate: z.string().min(1, 'Data de término é obrigatória'),
  endTime: z.string().optional(),
  allDay: z.boolean().default(false),
  rrule: z.string().optional()
})

type FormState = z.infer<typeof schema>

const state = reactive<FormState>({
  calendarId: '',
  title: '',
  description: '',
  location: '',
  startDate: '',
  startTime: '09:00',
  endDate: '',
  endTime: '10:00',
  allDay: false,
  rrule: ''
})

const rruleModel = computed({
  get: () => state.rrule || NONE_RECURRENCE_VALUE,
  set: (value: string) => { state.rrule = value === NONE_RECURRENCE_VALUE ? '' : value }
})

const calendarOptions = computed(() =>
  (props.calendars ?? []).map(c => ({ label: c.name, value: c.id }))
)

const selectedCalendar = computed(() =>
  (props.calendars ?? []).find(c => c.id === state.calendarId)
)

const eventColor = computed(() =>
  props.event?.calendar?.color ?? selectedCalendar.value?.color ?? '#10b981'
)

// ─── Date / time bindings for UInputDate + UInputTime ─────────────────────
const startDateValue = computed({
  get: () => strToDateValue(state.startDate ?? ''),
  set: (v: ReturnType<typeof strToDateValue>) => { state.startDate = dateValueToStr(v) }
})
const endDateValue = computed({
  get: () => strToDateValue(state.endDate ?? ''),
  set: (v: ReturnType<typeof strToDateValue>) => { state.endDate = dateValueToStr(v) }
})
const startTimeValue = computed({
  get: () => strToTimeValue(state.startTime ?? ''),
  set: (v: TimeValue | undefined) => { state.startTime = timeValueToStr(v) }
})
const endTimeValue = computed({
  get: () => strToTimeValue(state.endTime ?? ''),
  set: (v: TimeValue | undefined) => { state.endTime = timeValueToStr(v) }
})

watch(() => props.event, (event) => {
  participants.value = []
  if (!event) return
  state.calendarId = event.calendarId
  state.title = event.title
  state.description = event.description ?? ''
  state.location = event.location ?? ''
  state.startDate = toDateInput(event.startAt)
  state.startTime = toTimeInput(event.startAt)
  state.endDate = toDateInput(event.endAt)
  state.endTime = toTimeInput(event.endAt)
  state.allDay = event.allDay
  state.rrule = event.rrule ?? ''
  editing.value = false
  void loadParticipants()
}, { immediate: true })

function toDateInput(dateStr: string): string {
  if (Number.isNaN(new Date(dateStr).getTime())) return ''
  return formatEventDate({ ...props.event!, startAt: dateStr }, 'startAt')
}

function toTimeInput(dateStr: string): string {
  if (Number.isNaN(new Date(dateStr).getTime())) return '09:00'
  const parts = getZonedDateParts(dateStr, getEventTimeZone(props.event))
  return `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`
}

async function saveEdit() {
  if (!props.event || saving.value) return
  const editTimeZone = props.event.eventTimezone || timezone
  const startAtIso = zonedDateTimeToUtcIso(state.startDate, state.allDay ? '00:00' : state.startTime || '00:00', editTimeZone)
  const endAtIso = zonedDateTimeToUtcIso(state.endDate, state.allDay ? '23:59' : state.endTime || '00:00', editTimeZone)

  if (new Date(endAtIso) <= new Date(startAtIso)) {
    toast.add({ title: 'Erro', description: 'A data de término deve ser posterior ao início', color: 'error' })
    return
  }

  // Editing a single occurrence of a recurring series — ask which scope
  // applies before saving, instead of silently editing the whole series.
  if (props.event.recurrenceId) {
    pendingEditPayload.value = {
      title: state.title,
      description: state.description || null,
      location: state.location || null,
      startAt: startAtIso,
      endAt: endAtIso
    }
    scopeModalOpen.value = true
    return
  }

  saving.value = true
  try {
    const success = await updateEvent(props.event.id, {
      calendarId: state.calendarId,
      title: state.title,
      description: state.description || null,
      location: state.location || null,
      startAt: startAtIso,
      endAt: endAtIso,
      eventTimezone: props.event.eventTimezone || timezone,
      allDay: state.allDay,
      rrule: state.rrule || null
    })
    if (success) {
      editing.value = false
      emit('updated')
    }
  } finally {
    saving.value = false
  }
}

async function saveWithScope(scope: 'this' | 'this-and-following' | 'all') {
  if (!props.event) return
  const recurrenceId = props.event.recurrenceId
  const pending = pendingEditPayload.value

  if (!recurrenceId || !pending) return

  saving.value = true
  try {
    let success = false

    if (scope === 'this') {
      success = await modifyOccurrence(props.event.id, { recurrenceId, ...pending })
    } else if (scope === 'this-and-following') {
      success = await splitSeries(props.event.id, { recurrenceId, ...pending })
    } else {
      success = await updateEvent(props.event.id, {
        calendarId: state.calendarId,
        eventTimezone: props.event.eventTimezone || timezone,
        allDay: state.allDay,
        rrule: state.rrule || null,
        ...pending
      })
    }

    if (success) {
      editing.value = false
      scopeModalOpen.value = false
      pendingEditPayload.value = null
      emit('updated')
    }
  } finally {
    saving.value = false
  }
}

async function onArchive() {
  if (!props.event || archiving.value) return
  archiving.value = true
  try {
    const success = await archiveEvent(props.event.id)
    if (success) {
      emit('update:open', false)
      emit('archived')
    }
  } finally {
    archiving.value = false
  }
}

async function onCancelOccurrence(recurrenceId: string) {
  if (!props.event) return
  const success = await cancelOccurrence(props.event.id, { recurrenceId })
  if (success) {
    emit('update:open', false)
    emit('updated')
  }
}

function formatDate(dateStr: string, allDay: boolean): string {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return 'Data inválida'
  const d = date.toLocaleDateString('pt-BR', { timeZone: getEventTimeZone(props.event), weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
  if (allDay) return d
  return `${d} às ${date.toLocaleTimeString('pt-BR', { timeZone: getEventTimeZone(props.event), hour: '2-digit', minute: '2-digit' })}`
}

function formatTimeRange(evt: CalendarEvent): string {
  if (evt.allDay) return 'Dia inteiro'
  const start = formatEventTime(evt)
  const end = formatEventTime(evt, 'endAt')
  return `${start} – ${end}`
}
</script>

<template>
  <USlideover
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <template #header>
      <div class="flex items-center gap-2">
        <span
          class="inline-block size-3 rounded-full"
          :style="{ backgroundColor: eventColor }"
        />
        <span class="text-sm font-semibold text-highlighted truncate">
          {{ event?.title ?? 'Detalhes do evento' }}
        </span>
      </div>
    </template>

    <template #body>
      <!-- Loading -->
      <div v-if="props.loading" class="space-y-4 p-1">
        <USkeleton class="h-7 w-2/3" />
        <USkeleton class="h-4 w-1/2" />
        <USkeleton class="h-16 w-full" />
        <USkeleton class="h-24 w-full" />
      </div>

      <!-- Empty state -->
      <div
        v-else-if="!event"
        class="flex flex-col items-center justify-center gap-3 py-16"
      >
        <UIcon name="i-lucide-calendar-x" class="size-10 text-dimmed" />
        <p class="text-sm text-muted">
          Nenhum evento selecionado
        </p>
      </div>

      <!-- ── View mode ──────────────────────────────────────────── -->
      <div v-else-if="!editing" class="space-y-0">
        <!-- Color stripe + title block -->
        <div
          class="mb-4 border-l-4 pl-3 pb-1"
          :style="{ borderColor: eventColor }"
        >
          <h3 class="text-base font-semibold leading-snug text-highlighted">
            {{ event.title }}
          </h3>
          <p class="mt-0.5 text-xs text-muted">
            {{ formatTimeRange(event) }}
          </p>
        </div>

        <!-- Rows with icons -->
        <div class="space-y-3 text-sm">
          <!-- Date/time -->
          <div class="flex items-start gap-3">
            <UIcon name="i-lucide-clock" class="mt-0.5 size-4 shrink-0 text-muted" />
            <div>
              <div>{{ formatDate(event.startAt, event.allDay) }}</div>
              <div
                v-if="!event.allDay && toDateInput(event.startAt) !== toDateInput(event.endAt)"
                class="text-muted"
              >
                até {{ formatDate(event.endAt, event.allDay) }}
              </div>
            </div>
          </div>

          <!-- Calendar -->
          <div v-if="event.calendar?.name" class="flex items-center gap-3">
            <span
              class="inline-block size-4 shrink-0 rounded-full"
              :style="{ backgroundColor: event.calendar.color ?? '#10b981' }"
            />
            <span>{{ event.calendar.name }}</span>
          </div>

          <!-- Location -->
          <div v-if="event.location" class="flex items-center gap-3">
            <UIcon name="i-lucide-map-pin" class="size-4 shrink-0 text-muted" />
            <span>{{ event.location }}</span>
          </div>

          <!-- Recurrence -->
          <div v-if="event.rrule" class="flex items-center gap-3">
            <UIcon name="i-lucide-repeat" class="size-4 shrink-0 text-muted" />
            <span>{{ getRecurrenceLabel(event.rrule) }}</span>
          </div>

          <!-- Description -->
          <div v-if="event.description" class="flex items-start gap-3">
            <UIcon name="i-lucide-align-left" class="mt-0.5 size-4 shrink-0 text-muted" />
            <p class="whitespace-pre-wrap text-muted">
              {{ event.description }}
            </p>
          </div>

          <!-- Reminders -->
          <div v-if="event.reminders?.length" class="flex items-start gap-3">
            <UIcon name="i-lucide-bell" class="mt-0.5 size-4 shrink-0 text-muted" />
            <div class="space-y-0.5">
              <div
                v-for="r in event.reminders"
                :key="r.id"
                class="text-muted"
              >
                {{ r.minutesBefore }} min antes
              </div>
            </div>
          </div>
        </div>

        <!-- RSVP banner (invited, not the owner) -->
        <div
          v-if="!isOwner && myParticipation"
          class="mt-4 rounded-lg border border-default bg-elevated/50 p-3"
        >
          <p class="mb-2 text-sm font-medium text-highlighted">
            Você foi convidado para este evento
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              label="Aceitar"
              icon="i-lucide-check"
              size="xs"
              :color="myParticipation.rsvpStatus === 'accepted' ? 'success' : 'neutral'"
              :variant="myParticipation.rsvpStatus === 'accepted' ? 'solid' : 'outline'"
              :loading="respondingRsvp"
              @click="onRespondRsvp(RsvpStatus.Accepted)"
            />
            <UButton
              label="Talvez"
              icon="i-lucide-help-circle"
              size="xs"
              :color="myParticipation.rsvpStatus === 'tentative' ? 'warning' : 'neutral'"
              :variant="myParticipation.rsvpStatus === 'tentative' ? 'solid' : 'outline'"
              :loading="respondingRsvp"
              @click="onRespondRsvp(RsvpStatus.Tentative)"
            />
            <UButton
              label="Recusar"
              icon="i-lucide-x"
              size="xs"
              :color="myParticipation.rsvpStatus === 'declined' ? 'error' : 'neutral'"
              :variant="myParticipation.rsvpStatus === 'declined' ? 'solid' : 'outline'"
              :loading="respondingRsvp"
              @click="onRespondRsvp(RsvpStatus.Declined)"
            />
          </div>
        </div>

        <!-- Participants (owner manages, everyone can see) -->
        <div v-if="isOwner || participants.length > 0" class="mt-4 space-y-2 border-t border-default pt-4">
          <p class="text-xs font-medium uppercase tracking-wide text-muted">
            Convidados
          </p>

          <div v-if="isOwner" class="flex items-center gap-2">
            <UInput
              v-model="newParticipantEmail"
              type="email"
              placeholder="email@exemplo.com"
              size="sm"
              class="flex-1"
              @keydown.enter="onInviteParticipant"
            />
            <UButton
              icon="i-lucide-plus"
              size="sm"
              color="primary"
              variant="subtle"
              :loading="invitingParticipant"
              :disabled="!newParticipantEmail.trim()"
              @click="onInviteParticipant"
            />
          </div>

          <div v-if="participantsLoading" class="text-xs text-muted">
            Carregando...
          </div>
          <ul v-else-if="participants.length > 0" class="space-y-1">
            <li
              v-for="participant in participants"
              :key="participant.id"
              class="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-elevated"
            >
              <UIcon name="i-lucide-user" class="size-3.5 shrink-0 text-dimmed" />
              <span class="flex-1 truncate">{{ participant.invitedEmail }}</span>
              <UBadge
                :color="RSVP_META[participant.rsvpStatus].color"
                variant="subtle"
                size="sm"
              >
                {{ RSVP_META[participant.rsvpStatus].label }}
              </UBadge>
              <UButton
                v-if="isOwner"
                icon="i-lucide-x"
                size="xs"
                color="neutral"
                variant="ghost"
                @click="onRemoveParticipant(participant)"
              />
            </li>
          </ul>
        </div>

        <!-- Actions -->
        <div v-if="isOwner" class="mt-6 flex flex-wrap gap-2 border-t border-default pt-4">
          <UButton
            label="Editar"
            icon="i-lucide-pencil"
            variant="outline"
            size="sm"
            @click="editing = true"
          />
          <UButton
            v-if="event.recurrenceId"
            label="Cancelar ocorrência"
            icon="i-lucide-x"
            variant="outline"
            size="sm"
            color="error"
            @click="onCancelOccurrence(event.recurrenceId)"
          />
          <UButton
            label="Arquivar"
            icon="i-lucide-archive"
            variant="outline"
            size="sm"
            color="error"
            :loading="archiving"
            @click="onArchive"
          />
        </div>
      </div>

      <!-- ── Edit mode ──────────────────────────────────────────── -->
      <UForm
        v-else
        :schema="schema"
        :state="state"
        class="space-y-0"
        @submit="saveEdit"
      >
        <!-- Title -->
        <div class="pb-4">
          <UInput
            v-model="state.title"
            placeholder="Título do evento"
            variant="none"
            size="lg"
            class="w-full [&_input]:text-base [&_input]:font-medium"
          />
          <div class="border-b border-default" />
        </div>

        <!-- Date / Time -->
        <div class="py-3">
          <div class="flex items-start gap-3">
            <UIcon name="i-lucide-clock" class="mt-2 size-4 shrink-0 text-muted" />
            <div class="flex-1 space-y-2">
              <div class="flex items-center gap-2">
                <UCheckbox
                  :model-value="state.allDay"
                  label="Dia inteiro"
                  size="sm"
                  @update:model-value="state.allDay = Boolean($event)"
                />
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <UInputDate v-model="startDateValue" size="sm" :leading-icon="null" />
                <UInputTime
                  v-if="!state.allDay"
                  v-model="startTimeValue"
                  granularity="minute"
                  size="sm"
                />
                <span class="text-xs text-muted">até</span>
                <UInputDate v-model="endDateValue" size="sm" :leading-icon="null" />
                <UInputTime
                  v-if="!state.allDay"
                  v-model="endTimeValue"
                  granularity="minute"
                  size="sm"
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

        <!-- Calendar -->
        <div class="py-3">
          <div class="flex items-center gap-3">
            <span
              class="inline-flex size-4 shrink-0 rounded-full"
              :style="{ backgroundColor: selectedCalendar?.color ?? '#10b981' }"
            />
            <USelect
              v-model="state.calendarId"
              :items="calendarOptions"
              placeholder="Selecione..."
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
              :rows="3"
              class="flex-1 resize-none"
            />
          </div>
        </div>

        <!-- Actions -->
        <div class="flex gap-2 border-t border-default pt-4">
          <UButton
            type="submit"
            label="Salvar"
            icon="i-lucide-check"
            size="sm"
            :loading="saving"
            :disabled="saving"
          />
          <UButton
            label="Cancelar"
            variant="ghost"
            color="neutral"
            size="sm"
            @click="editing = false"
          />
        </div>
      </UForm>

      <!-- Occurrence edit scope confirmation -->
      <UModal v-model:open="scopeModalOpen" title="Aplicar alteração a quais ocorrências?">
        <template #body>
          <div class="flex flex-col gap-2">
            <UButton
              label="Somente esta"
              variant="outline"
              block
              :loading="saving"
              @click="saveWithScope('this')"
            />
            <UButton
              label="Esta e as seguintes"
              variant="outline"
              block
              :loading="saving"
              @click="saveWithScope('this-and-following')"
            />
            <UButton
              label="Todas as ocorrências"
              variant="outline"
              block
              :loading="saving"
              @click="saveWithScope('all')"
            />
          </div>
        </template>
      </UModal>
    </template>
  </USlideover>
</template>
