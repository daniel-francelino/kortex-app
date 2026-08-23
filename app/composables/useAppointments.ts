import { useDebounceFn } from '@vueuse/core'
import type {
  Calendar,
  CalendarEvent,
  EventException,
  EventReminder,
  ExceptionType,
  CalendarVisibility,
  CreateCalendarPayload,
  CreateEventPayload,
  UpdateCalendarPayload,
  UpdateEventPayload,
  CancelOccurrencePayload,
  ReminderInput
} from '~/types/appointments'

interface EventsResponse {
  data: CalendarEvent[]
  total: number
  page: number
  pageSize: number
}

function normalizeCalendar(input: unknown): Calendar {
  const calendar = (input ?? {}) as Record<string, unknown>

  return {
    id: String(calendar.id ?? ''),
    ownerUserId: String(calendar.ownerUserId ?? calendar.owner_user_id ?? ''),
    name: String(calendar.name ?? ''),
    description: (calendar.description as string | null) ?? null,
    color: (calendar.color as string | null) ?? null,
    visibility: String(calendar.visibility ?? 'private') as CalendarVisibility,
    createdAt: String(calendar.createdAt ?? calendar.created_at ?? ''),
    updatedAt: String(calendar.updatedAt ?? calendar.updated_at ?? ''),
    archivedAt: (calendar.archivedAt as string | null) ?? (calendar.archived_at as string | null) ?? null
  }
}

function normalizeReminder(input: unknown): EventReminder {
  const reminder = (input ?? {}) as Record<string, unknown>

  return {
    id: String(reminder.id ?? ''),
    eventId: String(reminder.eventId ?? reminder.event_id ?? ''),
    userId: String(reminder.userId ?? reminder.user_id ?? ''),
    type: reminder.type as EventReminder['type'],
    minutesBefore: Number(reminder.minutesBefore ?? reminder.minutes_before ?? 0),
    createdAt: String(reminder.createdAt ?? reminder.created_at ?? ''),
    updatedAt: String(reminder.updatedAt ?? reminder.updated_at ?? '')
  }
}

function normalizeException(input: unknown): EventException {
  const exception = (input ?? {}) as Record<string, unknown>

  return {
    id: String(exception.id ?? ''),
    eventId: String(exception.eventId ?? exception.event_id ?? ''),
    type: String(exception.type ?? 'cancelled') as ExceptionType,
    recurrenceId: String(exception.recurrenceId ?? exception.recurrence_id ?? ''),
    overrideTitle: (exception.overrideTitle as string | null) ?? (exception.override_title as string | null) ?? null,
    overrideDescription: (exception.overrideDescription as string | null) ?? (exception.override_description as string | null) ?? null,
    overrideLocation: (exception.overrideLocation as string | null) ?? (exception.override_location as string | null) ?? null,
    overrideStartAt: (exception.overrideStartAt as string | null) ?? (exception.override_start_at as string | null) ?? null,
    overrideEndAt: (exception.overrideEndAt as string | null) ?? (exception.override_end_at as string | null) ?? null,
    createdAt: String(exception.createdAt ?? exception.created_at ?? ''),
    updatedAt: String(exception.updatedAt ?? exception.updated_at ?? '')
  }
}

function normalizeEvent(input: unknown): CalendarEvent {
  const event = (input ?? {}) as Record<string, unknown>
  const calendar = event.calendar ?? event.calendars

  return {
    id: String(event.id ?? ''),
    calendarId: String(event.calendarId ?? event.calendar_id ?? ''),
    ownerUserId: String(event.ownerUserId ?? event.owner_user_id ?? ''),
    title: String(event.title ?? ''),
    description: (event.description as string | null) ?? null,
    location: (event.location as string | null) ?? null,
    startAt: String(event.startAt ?? event.start_at ?? ''),
    endAt: String(event.endAt ?? event.end_at ?? ''),
    eventTimezone: String(event.eventTimezone ?? event.event_timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone),
    allDay: Boolean(event.allDay ?? event.all_day),
    rrule: (event.rrule as string | null) ?? null,
    exdate: (event.exdate as string[] | null) ?? null,
    createdAt: String(event.createdAt ?? event.created_at ?? ''),
    updatedAt: String(event.updatedAt ?? event.updated_at ?? ''),
    archivedAt: (event.archivedAt as string | null) ?? (event.archived_at as string | null) ?? null,
    calendar: calendar ? normalizeCalendar(calendar) : undefined,
    reminders: Array.isArray(event.reminders) ? event.reminders.map(normalizeReminder) : undefined,
    exceptions: Array.isArray(event.exceptions) ? event.exceptions.map(normalizeException) : undefined,
    recurrenceId: (event.recurrenceId as string | null) ?? (event.recurrence_id as string | null) ?? null,
    isRecurring: Boolean(event.isRecurring ?? event.is_recurring ?? event.rrule),
    isCancelled: Boolean(event.isCancelled ?? event.is_cancelled)
  }
}

export function useAppointments() {
  const toast = useToast()

  // ─── Calendars ────────────────────────────────────────────────────────────
  const {
    data: calendars,
    status: calendarsStatus,
    refresh: refreshCalendars
  } = useFetch<Calendar[]>('/api/appointments/calendars', {
    lazy: true,
    immediate: false,
    key: 'appointments-calendars',
    default: () => [],
    transform: data => (data ?? []).map(normalizeCalendar)
  })

  const {
    data: archivedCalendars,
    status: archivedCalendarsStatus,
    refresh: refreshArchivedCalendars
  } = useFetch<Calendar[]>('/api/appointments/calendars', {
    query: { archived: true },
    lazy: true,
    immediate: false,
    key: 'appointments-archived-calendars',
    default: () => [],
    transform: data => (data ?? []).map(normalizeCalendar)
  })

  // ─── Date range state ─────────────────────────────────────────────────────
  const viewFrom = ref('')
  const viewTo = ref('')
  const activeCalendarIds = ref<string[]>([])
  const searchQuery = ref('')

  // ─── Events (paginated, filtered by date range) ───────────────────────────
  const eventsPage = ref(1)
  const eventsPageSize = ref(500)

  const {
    data: eventsData,
    status: eventsStatus,
    refresh: refreshEvents
  } = useFetch<EventsResponse>('/api/appointments/events', {
    query: computed(() => ({
      from: viewFrom.value || undefined,
      to: viewTo.value || undefined,
      calendarId: activeCalendarIds.value[0] || undefined,
      q: searchQuery.value || undefined,
      page: eventsPage.value,
      pageSize: eventsPageSize.value
    })),
    lazy: true,
    immediate: false,
    key: 'appointments-events',
    watch: false,
    default: () => ({
      data: [],
      total: 0,
      page: eventsPage.value,
      pageSize: eventsPageSize.value
    }),
    transform: response => ({
      data: (response?.data ?? []).map(normalizeEvent),
      total: response?.total ?? 0,
      page: response?.page ?? eventsPage.value,
      pageSize: response?.pageSize ?? eventsPageSize.value
    })
  })

  const debouncedRefreshEvents = useDebounceFn(() => {
    if (!viewFrom.value && !viewTo.value) {
      return
    }

    refreshEvents()
  }, 300)

  watch([viewFrom, viewTo, activeCalendarIds], () => {
    if (!viewFrom.value && !viewTo.value) {
      return
    }

    eventsPage.value = 1
    refreshEvents()
  })

  watch(eventsPage, () => {
    if (!viewFrom.value && !viewTo.value) {
      return
    }

    refreshEvents()
  })

  watch(searchQuery, () => {
    eventsPage.value = 1
    debouncedRefreshEvents()
  })

  // ─── Calendar actions ─────────────────────────────────────────────────────
  async function createCalendar(payload: CreateCalendarPayload): Promise<Calendar | null> {
    try {
      const data = await $fetch<Calendar>('/api/appointments/calendars', {
        method: 'POST',
        body: payload
      })
      toast.add({ title: 'Calendário criado', color: 'success' })
      await refreshCalendars()
      return normalizeCalendar(data)
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível criar o calendário', color: 'error' })
      return null
    }
  }

  async function updateCalendar(id: string, payload: UpdateCalendarPayload): Promise<boolean> {
    try {
      await $fetch(`/api/appointments/calendars/${id}`, {
        method: 'PATCH',
        body: payload
      })
      toast.add({ title: 'Calendário atualizado', color: 'success' })
      await refreshCalendars()
      await refreshArchivedCalendars()
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível atualizar o calendário', color: 'error' })
      return false
    }
  }

  async function archiveCalendar(id: string): Promise<boolean> {
    try {
      await $fetch(`/api/appointments/calendars/${id}/archive`, {
        method: 'POST'
      })
      toast.add({ title: 'Calendário arquivado', color: 'success' })
      await refreshCalendars()
      await refreshArchivedCalendars()
      await refreshEvents()
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível arquivar o calendário', color: 'error' })
      return false
    }
  }

  async function restoreCalendar(id: string): Promise<boolean> {
    try {
      await $fetch(`/api/appointments/calendars/${id}/restore`, {
        method: 'POST'
      })
      toast.add({ title: 'Calendário restaurado', color: 'success' })
      await refreshCalendars()
      await refreshArchivedCalendars()
      await refreshEvents()
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível restaurar o calendário', color: 'error' })
      return false
    }
  }

  // ─── Event actions ────────────────────────────────────────────────────────
  async function createEvent(payload: CreateEventPayload): Promise<CalendarEvent | null> {
    try {
      const data = await $fetch<CalendarEvent>('/api/appointments/events', {
        method: 'POST',
        body: payload
      })
      toast.add({ title: 'Evento criado', color: 'success' })
      return normalizeEvent(data)
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível criar o evento', color: 'error' })
      return null
    }
  }

  async function updateEvent(id: string, payload: UpdateEventPayload): Promise<boolean> {
    try {
      await $fetch(`/api/appointments/events/${id}`, {
        method: 'PATCH',
        body: payload
      })
      toast.add({ title: 'Evento atualizado', color: 'success' })
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível atualizar o evento', color: 'error' })
      return false
    }
  }

  async function archiveEvent(id: string): Promise<boolean> {
    try {
      await $fetch(`/api/appointments/events/${id}/archive`, {
        method: 'POST'
      })
      toast.add({ title: 'Evento arquivado', color: 'success' })
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível arquivar o evento', color: 'error' })
      return false
    }
  }

  async function fetchEventDetail(id: string): Promise<CalendarEvent | null> {
    try {
      const data = await $fetch<CalendarEvent>(`/api/appointments/events/${id}`)
      return normalizeEvent(data)
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível carregar o evento', color: 'error' })
      return null
    }
  }

  async function cancelOccurrence(eventId: string, payload: CancelOccurrencePayload): Promise<boolean> {
    try {
      await $fetch(`/api/appointments/events/${eventId}/cancel-occurrence`, {
        method: 'POST',
        body: payload
      })
      toast.add({ title: 'Ocorrência cancelada', color: 'success' })
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível cancelar a ocorrência', color: 'error' })
      return false
    }
  }

  async function upsertReminders(eventId: string, reminders: ReminderInput[]): Promise<boolean> {
    try {
      await $fetch(`/api/appointments/events/${eventId}/reminders`, {
        method: 'POST',
        body: { reminders }
      })
      toast.add({ title: 'Lembretes atualizados', color: 'success' })
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível atualizar os lembretes', color: 'error' })
      return false
    }
  }

  // ─── View helpers ─────────────────────────────────────────────────────────
  function setViewRange(from: string, to: string) {
    if (viewFrom.value === from && viewTo.value === to) {
      return
    }

    viewFrom.value = from
    viewTo.value = to
  }

  // ─── Calendar color map ───────────────────────────────────────────────────
  const defaultColors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

  function getCalendarColor(calendar: Calendar, index: number): string {
    return calendar.color ?? defaultColors[index % defaultColors.length] ?? '#10b981'
  }

  // ─── Recurrence display ───────────────────────────────────────────────────
  function getRecurrenceLabel(rrule: string | null): string {
    if (!rrule) return 'Não se repete'
    if (rrule.includes('FREQ=DAILY')) return 'Diariamente'
    if (rrule.includes('FREQ=WEEKLY') && rrule.includes('BYDAY')) {
      const match = rrule.match(/BYDAY=([A-Z,]+)/)
      if (match) {
        const dayMap: Record<string, string> = {
          MO: 'Seg',
          TU: 'Ter',
          WE: 'Qua',
          TH: 'Qui',
          FR: 'Sex',
          SA: 'Sáb',
          SU: 'Dom'
        }
        const days = match[1]?.split(',').map(d => dayMap[d] ?? d).join(', ')
        return `Semanalmente (${days})`
      }
      return 'Semanalmente'
    }
    if (rrule.includes('FREQ=WEEKLY')) return 'Semanalmente'
    if (rrule.includes('FREQ=MONTHLY')) return 'Mensalmente'
    return 'Recorrente'
  }

  const NONE_RECURRENCE_VALUE = '__none__'

  const recurrenceOptions = [
    { label: 'Não se repete', value: NONE_RECURRENCE_VALUE },
    { label: 'Diariamente', value: 'FREQ=DAILY' },
    { label: 'Semanalmente', value: 'FREQ=WEEKLY' },
    { label: 'Seg a Sex', value: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
    { label: 'Mensalmente', value: 'FREQ=MONTHLY' }
  ]

  return {
    // Calendars
    calendars,
    calendarsStatus,
    archivedCalendars,
    archivedCalendarsStatus,
    refreshCalendars,
    refreshArchivedCalendars,
    createCalendar,
    updateCalendar,
    archiveCalendar,
    restoreCalendar,
    getCalendarColor,

    // Events
    eventsData,
    eventsStatus,
    eventsPage,
    eventsPageSize,
    refreshEvents,
    createEvent,
    updateEvent,
    archiveEvent,
    fetchEventDetail,
    cancelOccurrence,
    upsertReminders,

    // View
    viewFrom,
    viewTo,
    searchQuery,
    activeCalendarIds,
    setViewRange,

    // Recurrence
    getRecurrenceLabel,
    recurrenceOptions,
    NONE_RECURRENCE_VALUE
  }
}
