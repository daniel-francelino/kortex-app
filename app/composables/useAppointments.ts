import { createSharedComposable, useDebounceFn } from '@vueuse/core'
import { CalendarVisibility } from '~/types/appointments'
import type {
  Calendar,
  CalendarEvent,
  CalendarShare,
  EventException,
  EventParticipant,
  EventReminder,
  ExceptionType,
  CreateCalendarPayload,
  CreateEventPayload,
  UpdateCalendarPayload,
  UpdateEventPayload,
  CancelOccurrencePayload,
  ModifyOccurrencePayload,
  SplitSeriesPayload,
  ReminderInput,
  RsvpStatus
} from '~/types/appointments'

interface EventsResponse {
  data: CalendarEvent[]
  total: number
  page: number
  pageSize: number
}

const APPOINTMENTS_ENTITIES = ['event', 'calendar'] as const

function normalizeCalendar(input: unknown): Calendar {
  const calendar = (input ?? {}) as Record<string, unknown>

  return {
    id: String(calendar.id ?? ''),
    ownerUserId: String(calendar.ownerUserId ?? calendar.owner_user_id ?? ''),
    name: String(calendar.name ?? ''),
    description: (calendar.description as string | null) ?? null,
    color: (calendar.color as string | null) ?? null,
    visibility: String(calendar.visibility ?? 'private') as CalendarVisibility,
    subscribeToken: (calendar.subscribeToken as string | null) ?? (calendar.subscribe_token as string | null) ?? null,
    subscribeEnabled: Boolean(calendar.subscribeEnabled ?? calendar.subscribe_enabled ?? false),
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

function normalizeCalendarShare(input: unknown): CalendarShare {
  const share = (input ?? {}) as Record<string, unknown>

  return {
    id: String(share.id ?? ''),
    calendarId: String(share.calendarId ?? share.calendar_id ?? ''),
    ownerId: String(share.ownerId ?? share.owner_id ?? ''),
    invitedUserId: (share.invitedUserId as string | null) ?? (share.invited_user_id as string | null) ?? null,
    invitedEmail: String(share.invitedEmail ?? share.invited_email ?? ''),
    permission: (share.permission ?? 'view') as CalendarShare['permission'],
    status: (share.status ?? 'pending') as CalendarShare['status'],
    createdAt: String(share.createdAt ?? share.created_at ?? ''),
    updatedAt: String(share.updatedAt ?? share.updated_at ?? '')
  }
}

function normalizeParticipant(input: unknown): EventParticipant {
  const participant = (input ?? {}) as Record<string, unknown>

  return {
    id: String(participant.id ?? ''),
    eventId: String(participant.eventId ?? participant.event_id ?? ''),
    ownerId: String(participant.ownerId ?? participant.owner_id ?? ''),
    invitedUserId: (participant.invitedUserId as string | null) ?? (participant.invited_user_id as string | null) ?? null,
    invitedEmail: String(participant.invitedEmail ?? participant.invited_email ?? ''),
    rsvpStatus: (participant.rsvpStatus ?? participant.rsvp_status ?? 'pending') as RsvpStatus,
    createdAt: String(participant.createdAt ?? participant.created_at ?? ''),
    updatedAt: String(participant.updatedAt ?? participant.updated_at ?? '')
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

// Shared across every call site (the Agenda page, EventDetailSlideover,
// EventCreateModal, CalendarCreateModal, the scheduling pages...) — same
// idea as useDashboard/useNotifications. Without this, each component got
// its own private `eventsByKey`/`calendarsById` store: an optimistic edit
// made from the slideover updated a store nobody's view was reading from,
// so the only way for the Agenda grid to ever see it was a full
// refreshEvents() round trip. Sharing one store means an optimistic
// mutation from *any* component is instantly visible everywhere, matching
// how useNotes.ts (a single call site) behaves without even having to try.
function _useAppointments() {
  const toast = useToast()
  const { runOptimisticAction } = useOptimisticAction()

  // ─── Local reactive stores ──────────────────────────────────────────────
  // Same idea as useNotes.ts/useJournal.ts: fetch results are upserted into
  // these instead of replacing state wholesale, so an optimistic mutation
  // shows up instantly and a background refetch never clobbers it.
  const calendarsById = reactive(new Map<string, Calendar>())

  // Keyed by recurrenceId when present, falling back to id — NOT keyed by
  // plain `id` alone. The events list endpoint expands a recurring event
  // into one row per occurrence, and every occurrence of the same series
  // shares the master event's `id` (only startAt/endAt/recurrenceId differ
  // per row). Keying this map by `id` alone would collapse every occurrence
  // of a series into a single map entry, each upsert overwriting the last —
  // the whole series then renders bunched onto whichever occurrence was
  // processed last instead of one entry per day.
  const eventsByKey = reactive(new Map<string, CalendarEvent>())

  function eventStoreKey(evt: Pick<CalendarEvent, 'id' | 'recurrenceId'>): string {
    return evt.recurrenceId ?? evt.id
  }

  function upsertCalendarInStore(calendar: Calendar) {
    calendarsById.set(calendar.id, { ...calendarsById.get(calendar.id), ...calendar })
  }

  function upsertEventInStore(evt: CalendarEvent) {
    const key = eventStoreKey(evt)
    eventsByKey.set(key, { ...eventsByKey.get(key), ...evt })
  }

  /** Any occurrence currently in the store for a given master event id — used
   * by update/archive, which always act on the whole series (see
   * modifyOccurrence/splitSeries for the actual per-occurrence edit paths). */
  function findEventEntriesById(id: string): CalendarEvent[] {
    return [...eventsByKey.values()].filter(e => e.id === id)
  }

  // ─── Date range / filter state ─────────────────────────────────────────────
  const viewFrom = ref('')
  const viewTo = ref('')
  const activeCalendarIds = ref<string[]>([])
  const searchQuery = ref('')

  // viewFrom/viewTo are plain `yyyy-MM-dd` calendar-day strings (in Day view
  // they're the *same* day). `new Date('yyyy-MM-dd')` parses that as UTC
  // midnight, not the viewer's local midnight — for Day view that collapsed
  // the "range" to a zero-width instant, so an event's actual start time
  // (anywhere in the local day) almost always fell after it. Every optimistic
  // update (drag, edit) then evaluated the event as out of view and dropped
  // it from viewEventKeys — it only came back after a full refetch corrected
  // the list from scratch. Parsing with the local constructor instead of the
  // Date-string UTC shortcut fixes that: these are local calendar days.
  function parseLocalDayBoundary(dateStr: string, end: boolean): number {
    const [y, m, d] = dateStr.split('-').map(Number)
    return end
      ? new Date(y!, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999).getTime()
      : new Date(y!, (m ?? 1) - 1, d ?? 1, 0, 0, 0, 0).getTime()
  }

  function isEventInCurrentView(evt: CalendarEvent): boolean {
    if (activeCalendarIds.value.length > 0 && !activeCalendarIds.value.includes(evt.calendarId)) return false
    if (!viewFrom.value && !viewTo.value) return true
    const start = new Date(evt.startAt).getTime()
    const end = new Date(evt.endAt).getTime()
    const rangeStart = viewFrom.value ? parseLocalDayBoundary(viewFrom.value, false) : -Infinity
    const rangeEnd = viewTo.value ? parseLocalDayBoundary(viewTo.value, true) : Infinity
    return start <= rangeEnd && end >= rangeStart
  }

  // ─── Calendars ────────────────────────────────────────────────────────────
  const calendarIds = ref<string[]>([])
  const archivedCalendarIds = ref<string[]>([])

  const {
    data: calendarsFetchResult,
    status: calendarsStatus,
    refresh: refreshCalendars
  } = useFetch<Calendar[]>('/api/appointments/calendars', {
    lazy: true,
    immediate: false,
    key: 'appointments-calendars',
    default: () => [],
    transform: data => (data ?? []).map(normalizeCalendar)
  })

  watch(calendarsFetchResult, (list) => {
    if (!list) return
    for (const c of list) upsertCalendarInStore(c)
    calendarIds.value = list.map(c => c.id)
  }, { immediate: true })

  const calendars = computed(() => calendarIds.value.map(id => calendarsById.get(id)).filter((c): c is Calendar => !!c))

  const {
    data: archivedCalendarsFetchResult,
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

  watch(archivedCalendarsFetchResult, (list) => {
    if (!list) return
    for (const c of list) upsertCalendarInStore(c)
    archivedCalendarIds.value = list.map(c => c.id)
  }, { immediate: true })

  const archivedCalendars = computed(() => archivedCalendarIds.value.map(id => calendarsById.get(id)).filter((c): c is Calendar => !!c))

  // ─── Events (paginated, filtered by date range) ───────────────────────────
  const eventsPage = ref(1)
  const eventsPageSize = ref(500)
  const viewEventKeys = ref<string[]>([])
  const lastKnownEventsTotal = ref(0)
  const lastKnownEventsPage = ref(1)
  const lastKnownEventsPageSize = ref(eventsPageSize.value)
  const eventsLoadedOnce = ref(false)

  const {
    data: eventsFetchResult,
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

  watch(eventsFetchResult, (res) => {
    if (!res) return
    for (const e of res.data) upsertEventInStore(e)
    viewEventKeys.value = res.data.map(eventStoreKey)
    lastKnownEventsTotal.value = res.total
    lastKnownEventsPage.value = res.page
    lastKnownEventsPageSize.value = res.pageSize
    eventsLoadedOnce.value = true
  }, { immediate: true })

  const eventsData = computed<EventsResponse>(() => ({
    data: viewEventKeys.value.map(k => eventsByKey.get(k)).filter((e): e is CalendarEvent => !!e),
    total: lastKnownEventsTotal.value,
    page: lastKnownEventsPage.value,
    pageSize: lastKnownEventsPageSize.value
  }))

  // Same idea as notes' `notesListInitialLoading`: the calendar views swap
  // their whole body for a full skeleton on this flag, so it must only be
  // true for the very first load — never for a background refetch after an
  // optimistic mutation (drag-and-drop, editing a time), or the user loses
  // their place mid-interaction every time they change something.
  const eventsInitialLoading = computed(() => !eventsLoadedOnce.value && eventsStatus.value === 'pending')

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
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    const optimisticCalendar: Calendar = {
      id,
      ownerUserId: '',
      name: payload.name,
      description: payload.description ?? null,
      color: payload.color ?? null,
      visibility: payload.visibility ?? CalendarVisibility.Private,
      subscribeToken: null,
      subscribeEnabled: false,
      createdAt: now,
      updatedAt: now,
      archivedAt: null
    }

    const result = await runOptimisticAction<Calendar>({
      apply: () => {
        upsertCalendarInStore(optimisticCalendar)
        calendarIds.value = [...calendarIds.value, id]
      },
      rollback: () => {
        calendarsById.delete(id)
        calendarIds.value = calendarIds.value.filter(i => i !== id)
      },
      request: () => $fetch<Calendar>('/api/appointments/calendars', {
        method: 'POST',
        body: { ...payload, id }
      }).then(normalizeCalendar),
      reconcile: serverCalendar => upsertCalendarInStore(serverCalendar),
      errorMessage: 'Não foi possível criar o calendário',
      offline: {
        entity: 'calendar',
        action: 'create',
        method: 'POST',
        url: '/api/appointments/calendars',
        body: { ...payload, id },
        tempId: id,
        optimisticResult: optimisticCalendar
      }
    })

    if (result) toast.add({ title: 'Calendário criado', color: 'success' })
    return result
  }

  async function updateCalendar(id: string, payload: UpdateCalendarPayload): Promise<boolean> {
    const previous = calendarsById.get(id)
    const now = new Date().toISOString()

    const optimisticCalendar: Calendar = {
      id,
      ownerUserId: previous?.ownerUserId ?? '',
      name: payload.name !== undefined ? payload.name : (previous?.name ?? ''),
      description: payload.description !== undefined ? payload.description : (previous?.description ?? null),
      color: payload.color !== undefined ? payload.color : (previous?.color ?? null),
      visibility: payload.visibility !== undefined ? payload.visibility : (previous?.visibility ?? CalendarVisibility.Private),
      subscribeToken: previous?.subscribeToken ?? null,
      subscribeEnabled: payload.subscribeEnabled !== undefined ? payload.subscribeEnabled : (previous?.subscribeEnabled ?? false),
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      archivedAt: previous?.archivedAt ?? null
    }

    const result = await runOptimisticAction<Calendar>({
      apply: () => upsertCalendarInStore(optimisticCalendar),
      rollback: () => { if (previous) upsertCalendarInStore(previous) },
      request: () => $fetch<Calendar>(`/api/appointments/calendars/${id}`, {
        method: 'PATCH',
        body: payload
      }).then(normalizeCalendar),
      reconcile: serverCalendar => upsertCalendarInStore(serverCalendar),
      errorMessage: 'Não foi possível atualizar o calendário',
      offline: {
        entity: 'calendar',
        action: 'update',
        method: 'PATCH',
        url: `/api/appointments/calendars/${id}`,
        body: payload,
        tempId: id,
        optimisticResult: optimisticCalendar
      }
    })

    if (result) toast.add({ title: 'Calendário atualizado', color: 'success' })
    return result !== null
  }

  async function archiveCalendar(id: string): Promise<boolean> {
    const previous = calendarsById.get(id)
    const wasActive = calendarIds.value.includes(id)
    const now = new Date().toISOString()

    const result = await runOptimisticAction<{ success: true }>({
      apply: () => {
        if (previous) upsertCalendarInStore({ ...previous, archivedAt: now })
        calendarIds.value = calendarIds.value.filter(i => i !== id)
        if (!archivedCalendarIds.value.includes(id)) archivedCalendarIds.value = [id, ...archivedCalendarIds.value]
        // Events under this calendar drop out of the current view too — the
        // eventual refreshEvents() below is what fully reconciles this, this
        // just avoids a stale-looking flash in the meantime.
        viewEventKeys.value = viewEventKeys.value.filter(key => eventsByKey.get(key)?.calendarId !== id)
      },
      rollback: () => {
        if (previous) upsertCalendarInStore(previous)
        archivedCalendarIds.value = archivedCalendarIds.value.filter(i => i !== id)
        if (wasActive && !calendarIds.value.includes(id)) calendarIds.value = [...calendarIds.value, id]
      },
      request: () => $fetch(`/api/appointments/calendars/${id}/archive`, { method: 'POST' }).then(() => ({ success: true as const })),
      errorMessage: 'Não foi possível arquivar o calendário',
      offline: {
        entity: 'calendar',
        action: 'delete',
        method: 'POST',
        url: `/api/appointments/calendars/${id}/archive`,
        tempId: id,
        optimisticResult: { success: true }
      }
    })

    if (result) {
      toast.add({ title: 'Calendário arquivado', color: 'success' })
      refreshEvents()
    }
    return result !== null
  }

  async function restoreCalendar(id: string): Promise<boolean> {
    const previous = calendarsById.get(id)
    const wasArchived = archivedCalendarIds.value.includes(id)

    const result = await runOptimisticAction<{ success: true }>({
      apply: () => {
        if (previous) upsertCalendarInStore({ ...previous, archivedAt: null })
        archivedCalendarIds.value = archivedCalendarIds.value.filter(i => i !== id)
        if (!calendarIds.value.includes(id)) calendarIds.value = [...calendarIds.value, id]
      },
      rollback: () => {
        if (previous) upsertCalendarInStore(previous)
        calendarIds.value = calendarIds.value.filter(i => i !== id)
        if (wasArchived && !archivedCalendarIds.value.includes(id)) archivedCalendarIds.value = [...archivedCalendarIds.value, id]
      },
      request: () => $fetch(`/api/appointments/calendars/${id}/restore`, { method: 'POST' }).then(() => ({ success: true as const })),
      errorMessage: 'Não foi possível restaurar o calendário',
      offline: {
        entity: 'calendar',
        action: 'update',
        method: 'POST',
        url: `/api/appointments/calendars/${id}/restore`,
        tempId: id,
        optimisticResult: { success: true }
      }
    })

    if (result) {
      toast.add({ title: 'Calendário restaurado', color: 'success' })
      refreshEvents()
    }
    return result !== null
  }

  // ─── Calendar sharing (unchanged — out of offline scope) ──────────────────
  async function fetchCalendarShares(calendarId: string): Promise<CalendarShare[]> {
    try {
      const data = await $fetch<unknown[]>(`/api/appointments/calendars/${calendarId}/shares`)
      return (data ?? []).map(normalizeCalendarShare)
    } catch {
      return []
    }
  }

  async function shareCalendar(calendarId: string, email: string, permission: 'view' | 'edit'): Promise<CalendarShare | null> {
    try {
      const data = await $fetch(`/api/appointments/calendars/${calendarId}/shares`, {
        method: 'POST',
        body: { email, permission }
      })
      toast.add({ title: 'Convite enviado', color: 'success' })
      return normalizeCalendarShare(data)
    } catch (err: unknown) {
      const message = (err as { data?: { statusMessage?: string } })?.data?.statusMessage
      toast.add({ title: 'Erro', description: message ?? 'Não foi possível compartilhar o calendário.', color: 'error' })
      return null
    }
  }

  async function updateCalendarSharePermission(calendarId: string, shareId: string, permission: 'view' | 'edit'): Promise<CalendarShare | null> {
    try {
      const data = await $fetch(`/api/appointments/calendars/${calendarId}/shares/${shareId}`, {
        method: 'PUT',
        body: { permission }
      })
      return normalizeCalendarShare(data)
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível atualizar a permissão.', color: 'error' })
      return null
    }
  }

  async function removeCalendarShare(calendarId: string, shareId: string): Promise<boolean> {
    try {
      await $fetch(`/api/appointments/calendars/${calendarId}/shares/${shareId}`, { method: 'DELETE' })
      toast.add({ title: 'Acesso removido', color: 'success' })
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível remover o acesso.', color: 'error' })
      return false
    }
  }

  async function toggleCalendarSubscribe(id: string, enabled: boolean): Promise<Calendar | null> {
    try {
      const data = await $fetch(`/api/appointments/calendars/${id}`, {
        method: 'PATCH',
        body: { subscribeEnabled: enabled }
      })
      const normalized = normalizeCalendar(data)
      upsertCalendarInStore(normalized)
      return normalized
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível atualizar a assinatura.', color: 'error' })
      return null
    }
  }

  // ─── Event actions ────────────────────────────────────────────────────────
  async function createEvent(payload: CreateEventPayload): Promise<CalendarEvent | null> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    const optimisticEvent: CalendarEvent = {
      id,
      calendarId: payload.calendarId,
      ownerUserId: '',
      title: payload.title,
      description: payload.description ?? null,
      location: payload.location ?? null,
      startAt: payload.startAt,
      endAt: payload.endAt,
      eventTimezone: payload.eventTimezone,
      allDay: payload.allDay ?? false,
      rrule: payload.rrule ?? null,
      exdate: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      calendar: calendarsById.get(payload.calendarId),
      recurrenceId: null,
      isRecurring: Boolean(payload.rrule),
      isCancelled: false
    }
    const key = eventStoreKey(optimisticEvent)

    const result = await runOptimisticAction<CalendarEvent>({
      apply: () => {
        upsertEventInStore(optimisticEvent)
        // Only the event's own first occurrence is reflected here — a
        // recurring event's later occurrences are expanded server-side (see
        // server/utils/recurrence.ts), so they only show up once
        // reconcile()/refreshEvents() brings the real expanded list back.
        if (isEventInCurrentView(optimisticEvent)) {
          viewEventKeys.value = [...viewEventKeys.value, key]
        }
      },
      rollback: () => {
        eventsByKey.delete(key)
        viewEventKeys.value = viewEventKeys.value.filter(k => k !== key)
      },
      request: () => $fetch<CalendarEvent>('/api/appointments/events', {
        method: 'POST',
        body: { ...payload, id }
      }).then(normalizeEvent),
      reconcile: serverEvent => upsertEventInStore(serverEvent),
      errorMessage: 'Não foi possível criar o evento',
      offline: {
        entity: 'event',
        action: 'create',
        method: 'POST',
        url: '/api/appointments/events',
        body: { ...payload, id },
        tempId: id,
        optimisticResult: optimisticEvent
      }
    })

    if (result) toast.add({ title: 'Evento criado', color: 'success' })
    return result
  }

  async function updateEvent(id: string, payload: UpdateEventPayload): Promise<boolean> {
    // update/archive always act on the whole series (see modifyOccurrence /
    // splitSeries for the actual per-occurrence edit paths), so any occurrence
    // of this event currently in the store is a fine base for the optimistic
    // merge — its recurrenceId (hence store key) is unaffected by this payload.
    const previous = findEventEntriesById(id)[0]
    const key = previous ? eventStoreKey(previous) : id
    const wasInView = viewEventKeys.value.includes(key)
    const now = new Date().toISOString()

    const optimisticEvent: CalendarEvent = {
      id,
      calendarId: payload.calendarId !== undefined ? payload.calendarId : (previous?.calendarId ?? ''),
      ownerUserId: previous?.ownerUserId ?? '',
      title: payload.title !== undefined ? payload.title : (previous?.title ?? ''),
      description: payload.description !== undefined ? payload.description : (previous?.description ?? null),
      location: payload.location !== undefined ? payload.location : (previous?.location ?? null),
      startAt: payload.startAt !== undefined ? payload.startAt : (previous?.startAt ?? ''),
      endAt: payload.endAt !== undefined ? payload.endAt : (previous?.endAt ?? ''),
      eventTimezone: payload.eventTimezone !== undefined ? payload.eventTimezone : (previous?.eventTimezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone),
      allDay: payload.allDay !== undefined ? payload.allDay : (previous?.allDay ?? false),
      rrule: payload.rrule !== undefined ? payload.rrule : (previous?.rrule ?? null),
      exdate: previous?.exdate ?? null,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      archivedAt: previous?.archivedAt ?? null,
      calendar: payload.calendarId !== undefined ? calendarsById.get(payload.calendarId) : previous?.calendar,
      reminders: previous?.reminders,
      exceptions: previous?.exceptions,
      recurrenceId: previous?.recurrenceId,
      isRecurring: Boolean(payload.rrule !== undefined ? payload.rrule : previous?.rrule),
      isCancelled: previous?.isCancelled
    }

    const result = await runOptimisticAction<CalendarEvent>({
      apply: () => {
        upsertEventInStore(optimisticEvent)
        const nowInView = isEventInCurrentView(optimisticEvent)
        if (nowInView && !wasInView) viewEventKeys.value = [...viewEventKeys.value, key]
        else if (!nowInView && wasInView) viewEventKeys.value = viewEventKeys.value.filter(k => k !== key)
      },
      rollback: () => {
        if (previous) upsertEventInStore(previous)
        const stillInView = viewEventKeys.value.includes(key)
        if (wasInView && !stillInView) viewEventKeys.value = [...viewEventKeys.value, key]
        else if (!wasInView && stillInView) viewEventKeys.value = viewEventKeys.value.filter(k => k !== key)
      },
      request: () => $fetch<CalendarEvent>(`/api/appointments/events/${id}`, {
        method: 'PATCH',
        body: payload
      }).then(normalizeEvent),
      // Re-checks view membership against the server's confirmed event, not
      // just the optimistic guess apply() made — a safety net for whenever
      // those two disagree (e.g. the server expands recurrence differently),
      // so a successful save can't silently leave the event stuck out of view.
      //
      // `PATCH /events/:id` always returns the raw master row (no
      // `recurrence_id` column exists on `events` — it's only ever computed
      // during list expansion), so `serverEvent.recurrenceId` is always null
      // here even when editing a recurring series. Keying off it directly
      // would upsert under a *different* map key than the occurrence this
      // edit started from (recurrenceId vs plain id) and add that new key to
      // viewEventKeys without ever removing the old one — the same event then
      // renders twice, once per key. Carrying `previous`'s recurrenceId
      // forward keeps this on the same key apply() used.
      reconcile: (serverEvent) => {
        const reconciledEvent: CalendarEvent = { ...serverEvent, recurrenceId: previous?.recurrenceId ?? serverEvent.recurrenceId }
        upsertEventInStore(reconciledEvent)
        const serverKey = eventStoreKey(reconciledEvent)
        const nowInView = isEventInCurrentView(reconciledEvent)
        const currentlyInView = viewEventKeys.value.includes(serverKey)
        if (nowInView && !currentlyInView) viewEventKeys.value = [...viewEventKeys.value, serverKey]
        else if (!nowInView && currentlyInView) viewEventKeys.value = viewEventKeys.value.filter(k => k !== serverKey)
      },
      errorMessage: 'Não foi possível atualizar o evento',
      offline: {
        entity: 'event',
        action: 'update',
        method: 'PATCH',
        url: `/api/appointments/events/${id}`,
        body: payload,
        tempId: id,
        optimisticResult: optimisticEvent
      }
    })

    if (result) toast.add({ title: 'Evento atualizado', color: 'success' })
    return result !== null
  }

  async function archiveEvent(id: string): Promise<boolean> {
    // Archiving removes the whole series from view, not just one occurrence —
    // every occurrence of this event currently in the store needs to go.
    const matches = findEventEntriesById(id)
    const matchedKeys = matches.map(eventStoreKey)
    const previousViewKeys = matchedKeys.filter(k => viewEventKeys.value.includes(k))
    const now = new Date().toISOString()

    const result = await runOptimisticAction<{ success: true }>({
      apply: () => {
        for (const evt of matches) upsertEventInStore({ ...evt, archivedAt: now })
        viewEventKeys.value = viewEventKeys.value.filter(k => !matchedKeys.includes(k))
      },
      rollback: () => {
        for (const evt of matches) upsertEventInStore(evt)
        const restored = new Set([...viewEventKeys.value, ...previousViewKeys])
        viewEventKeys.value = [...restored]
      },
      request: () => $fetch(`/api/appointments/events/${id}/archive`, { method: 'POST' }).then(() => ({ success: true as const })),
      errorMessage: 'Não foi possível arquivar o evento',
      offline: {
        entity: 'event',
        action: 'delete',
        method: 'POST',
        url: `/api/appointments/events/${id}/archive`,
        tempId: id,
        optimisticResult: { success: true }
      }
    })

    if (result) toast.add({ title: 'Evento arquivado', color: 'success' })
    return result !== null
  }

  async function fetchEventDetail(id: string): Promise<CalendarEvent | null> {
    try {
      const data = await $fetch<CalendarEvent>(`/api/appointments/events/${id}`)
      const normalized = normalizeEvent(data)
      upsertEventInStore(normalized)
      return normalized
    } catch {
      // Already-seen event, connection just dropped — fall back to what we have.
      const cached = findEventEntriesById(id)[0]
      if (cached) return cached
      toast.add({ title: 'Erro', description: 'Não foi possível carregar o evento', color: 'error' })
      return null
    }
  }

  // ─── Recurring-event edits, reminders, participants (unchanged — out of offline scope) ──
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

  async function modifyOccurrence(eventId: string, payload: ModifyOccurrencePayload): Promise<boolean> {
    try {
      await $fetch(`/api/appointments/events/${eventId}/modify-occurrence`, {
        method: 'POST',
        body: payload
      })
      toast.add({ title: 'Ocorrência atualizada', color: 'success' })
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível atualizar a ocorrência', color: 'error' })
      return false
    }
  }

  async function splitSeries(eventId: string, payload: SplitSeriesPayload): Promise<boolean> {
    try {
      await $fetch(`/api/appointments/events/${eventId}/split-series`, {
        method: 'POST',
        body: payload
      })
      toast.add({ title: 'Série dividida', description: 'Esta e as próximas ocorrências foram atualizadas.', color: 'success' })
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível dividir a série', color: 'error' })
      return false
    }
  }

  // ─── Participants (unchanged — out of offline scope) ──────────────────────
  async function fetchParticipants(eventId: string): Promise<EventParticipant[]> {
    try {
      const data = await $fetch<unknown[]>(`/api/appointments/events/${eventId}/participants`)
      return (data ?? []).map(normalizeParticipant)
    } catch {
      return []
    }
  }

  async function inviteParticipant(eventId: string, email: string): Promise<EventParticipant | null> {
    try {
      const data = await $fetch(`/api/appointments/events/${eventId}/participants`, {
        method: 'POST',
        body: { email }
      })
      toast.add({ title: 'Convite enviado', color: 'success' })
      return normalizeParticipant(data)
    } catch (err: unknown) {
      const message = (err as { data?: { statusMessage?: string } })?.data?.statusMessage
      toast.add({ title: 'Erro', description: message ?? 'Não foi possível convidar essa pessoa.', color: 'error' })
      return null
    }
  }

  async function removeParticipant(eventId: string, participantId: string): Promise<boolean> {
    try {
      await $fetch(`/api/appointments/events/${eventId}/participants/${participantId}`, {
        method: 'DELETE'
      })
      toast.add({ title: 'Convidado removido', color: 'success' })
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível remover o convidado.', color: 'error' })
      return false
    }
  }

  async function respondRsvp(eventId: string, participantId: string, rsvpStatus: RsvpStatus.Accepted | RsvpStatus.Declined | RsvpStatus.Tentative): Promise<boolean> {
    try {
      await $fetch(`/api/appointments/events/${eventId}/participants/${participantId}/rsvp`, {
        method: 'PUT',
        body: { rsvpStatus }
      })
      toast.add({ title: 'Resposta enviada', color: 'success' })
      await refreshEvents()
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível enviar sua resposta.', color: 'error' })
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

  // ─── Offline sync ───────────────────────────────────────────────────────────
  // Same drain-and-converge approach as useNotes.ts/useJournal.ts: replay
  // each queued request in order, then let a full refetch settle the store
  // rather than trying to reapply each mutation's own (long-gone) reconcile
  // closure. Filters to this composable's own entities since the queue is
  // shared across modules.
  const { pendingMutations, pendingCount, dequeue: dequeueMutation, markRetry, ensureLoaded: ensureQueueLoaded } = useMutationQueue()
  const { isOnline, onReconnect } = useConnectionStatus()
  const syncingOffline = ref(false)

  // A mutation that keeps failing used to retry forever, silently, with
  // nothing but a console.error — the optimistic UI state kept showing
  // "saved" indefinitely even once the server had permanently rejected it.
  // MAX_MUTATION_RETRIES caps transient (network/5xx) retries, and any 4xx
  // is treated as permanent immediately (retrying a genuinely invalid
  // request forever can never succeed). Note: this still doesn't roll back
  // the local optimistic state on permanent failure — that would need the
  // queue to carry a rollback snapshot per mutation, which it doesn't today
  // — it stops the silent infinite retry and tells the user, which is the
  // main gap this closes.
  const MAX_MUTATION_RETRIES = 5

  async function drainMutationQueue(): Promise<void> {
    if (syncingOffline.value) return
    await ensureQueueLoaded()
    const relevant = pendingMutations.value.filter(m => (APPOINTMENTS_ENTITIES as readonly string[]).includes(m.entity))
    if (relevant.length === 0) return

    syncingOffline.value = true
    let replayedAny = false
    let permanentFailureCount = 0

    try {
      const queue = [...relevant]

      for (const mutation of queue) {
        // Coalesced/cancelled by a later action since the snapshot was taken.
        if (!pendingMutations.value.some(m => m.id === mutation.id)) continue
        if (!isOnline.value) break

        try {
          await $fetch(mutation.url, {
            method: mutation.method,
            body: mutation.body as Record<string, unknown> | undefined
          })
          await dequeueMutation(mutation.id)
          replayedAny = true
        } catch (err) {
          if (!isOnline.value) break // connection dropped mid-replay, not a real rejection

          const statusCode = (err as { statusCode?: number, response?: { status?: number } })?.statusCode
            ?? (err as { statusCode?: number, response?: { status?: number } })?.response?.status
          const isClientError = typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500
          const outOfRetries = mutation.retryCount + 1 >= MAX_MUTATION_RETRIES

          if (isClientError || outOfRetries) {
            console.error('[offline-sync] appointments mutation permanently failed, dropping', mutation, err)
            await dequeueMutation(mutation.id)
            permanentFailureCount++
          } else {
            console.error('[offline-sync] appointments mutation failed, will retry', mutation, err)
            await markRetry(mutation.id)
          }
        }
      }
    } finally {
      syncingOffline.value = false
      if (replayedAny) {
        await Promise.all([refreshEvents(), refreshCalendars(), refreshArchivedCalendars()])
        toast.add({ title: 'Sincronizado', description: 'Suas alterações offline na agenda foram salvas.', color: 'success' })
      }
      if (permanentFailureCount > 0) {
        // Local state may still show the optimistic change as if it saved —
        // a full refetch at least surfaces the server's real, authoritative
        // state instead of leaving a permanently-stale optimistic view.
        await Promise.all([refreshEvents(), refreshCalendars(), refreshArchivedCalendars()])
        toast.add({
          title: 'Não foi possível sincronizar',
          description: `${permanentFailureCount} alteração(ões) na agenda não puderam ser salvas e foram descartadas.`,
          color: 'error'
        })
      }
    }
  }

  onReconnect(() => {
    void drainMutationQueue()
  })
  onMounted(() => {
    if (isOnline.value) void drainMutationQueue()
  })

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
    toggleCalendarSubscribe,
    fetchCalendarShares,
    shareCalendar,
    updateCalendarSharePermission,
    removeCalendarShare,
    getCalendarColor,

    // Events
    eventsData,
    eventsStatus,
    eventsInitialLoading,
    eventsPage,
    eventsPageSize,
    refreshEvents,
    createEvent,
    updateEvent,
    archiveEvent,
    fetchEventDetail,
    cancelOccurrence,
    upsertReminders,
    modifyOccurrence,
    splitSeries,

    // Participants
    fetchParticipants,
    inviteParticipant,
    removeParticipant,
    respondRsvp,

    // View
    viewFrom,
    viewTo,
    searchQuery,
    activeCalendarIds,
    setViewRange,

    // Recurrence
    getRecurrenceLabel,
    recurrenceOptions,
    NONE_RECURRENCE_VALUE,

    // Offline
    isOnline,
    pendingSyncCount: pendingCount,
    syncingOffline
  }
}

export const useAppointments = createSharedComposable(_useAppointments)
