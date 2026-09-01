import { SchedulingLocationType } from '~/types/scheduling'
import type {
  SchedulingPage,
  AvailabilityRule,
  AvailabilityRuleInput,
  SchedulingQuestion,
  SchedulingQuestionInput,
  Booking,
  CreateSchedulingPagePayload,
  UpdateSchedulingPagePayload
} from '~/types/scheduling'

const SCHEDULING_ENTITIES = ['scheduling_page'] as const

function normalizeAvailabilityRule(input: unknown): AvailabilityRule {
  const rule = (input ?? {}) as Record<string, unknown>
  return {
    id: String(rule.id ?? ''),
    dayOfWeek: Number(rule.dayOfWeek ?? rule.day_of_week ?? 0),
    startTime: String(rule.startTime ?? rule.start_time ?? ''),
    endTime: String(rule.endTime ?? rule.end_time ?? '')
  }
}

function normalizeQuestion(input: unknown): SchedulingQuestion {
  const q = (input ?? {}) as Record<string, unknown>
  return {
    id: String(q.id ?? ''),
    label: String(q.label ?? ''),
    type: (q.type ?? 'text') as SchedulingQuestion['type'],
    isRequired: Boolean(q.isRequired ?? q.is_required),
    isHidden: Boolean(q.isHidden ?? q.is_hidden),
    options: (q.options as string[] | null) ?? null,
    sortOrder: Number(q.sortOrder ?? q.sort_order ?? 0)
  }
}

function normalizeSchedulingPage(input: unknown): SchedulingPage {
  const page = (input ?? {}) as Record<string, unknown>
  return {
    id: String(page.id ?? ''),
    userId: String(page.userId ?? page.user_id ?? ''),
    calendarId: String(page.calendarId ?? page.calendar_id ?? ''),
    title: String(page.title ?? ''),
    description: (page.description as string | null) ?? null,
    durationMinutes: Number(page.durationMinutes ?? page.duration_minutes ?? 30),
    locationType: (page.locationType ?? page.location_type ?? 'video_link') as SchedulingPage['locationType'],
    locationDetails: (page.locationDetails as string | null) ?? (page.location_details as string | null) ?? null,
    timezone: String(page.timezone ?? ''),
    color: (page.color as string | null) ?? null,
    bufferBeforeMinutes: Number(page.bufferBeforeMinutes ?? page.buffer_before_minutes ?? 0),
    bufferAfterMinutes: Number(page.bufferAfterMinutes ?? page.buffer_after_minutes ?? 0),
    slotIncrementMinutes: Number(page.slotIncrementMinutes ?? page.slot_increment_minutes ?? 15),
    minNoticeHours: Number(page.minNoticeHours ?? page.min_notice_hours ?? 4),
    maxAdvanceDays: Number(page.maxAdvanceDays ?? page.max_advance_days ?? 60),
    maxBookingsPerDay: (page.maxBookingsPerDay as number | null) ?? (page.max_bookings_per_day as number | null) ?? null,
    calendarEventTitleTemplate: (page.calendarEventTitleTemplate as string | null) ?? (page.calendar_event_title_template as string | null) ?? null,
    cancellationEnabled: Boolean(page.cancellationEnabled ?? page.cancellation_enabled ?? true),
    rescheduleEnabled: Boolean(page.rescheduleEnabled ?? page.reschedule_enabled ?? true),
    cancellationMinNoticeHours: (page.cancellationMinNoticeHours as number | null) ?? (page.cancellation_min_notice_hours as number | null) ?? null,
    cancellationReasonRequired: Boolean(page.cancellationReasonRequired ?? page.cancellation_reason_required),
    hideDetailsOnManagePage: Boolean(page.hideDetailsOnManagePage ?? page.hide_details_on_manage_page),
    requiresConfirmation: Boolean(page.requiresConfirmation ?? page.requires_confirmation),
    shareToken: String(page.shareToken ?? page.share_token ?? ''),
    isActive: Boolean(page.isActive ?? page.is_active),
    createdAt: String(page.createdAt ?? page.created_at ?? ''),
    updatedAt: String(page.updatedAt ?? page.updated_at ?? ''),
    archivedAt: (page.archivedAt as string | null) ?? (page.archived_at as string | null) ?? null,
    availabilityRules: Array.isArray(page.availabilityRules) ? page.availabilityRules.map(normalizeAvailabilityRule) : undefined,
    questions: Array.isArray(page.questions) ? page.questions.map(normalizeQuestion) : undefined,
    bookingsCount: typeof page.bookingsCount === 'number' ? page.bookingsCount : undefined
  }
}

function normalizeBooking(input: unknown): Booking {
  const b = (input ?? {}) as Record<string, unknown>
  return {
    id: String(b.id ?? ''),
    schedulingPageId: String(b.schedulingPageId ?? b.scheduling_page_id ?? ''),
    eventId: String(b.eventId ?? b.event_id ?? ''),
    guestName: String(b.guestName ?? b.guest_name ?? ''),
    guestEmail: String(b.guestEmail ?? b.guest_email ?? ''),
    guestTimezone: String(b.guestTimezone ?? b.guest_timezone ?? ''),
    answers: (b.answers as Record<string, string>) ?? {},
    status: (b.status ?? 'confirmed') as Booking['status'],
    manageToken: String(b.manageToken ?? b.manage_token ?? ''),
    cancellationReason: (b.cancellationReason as string | null) ?? (b.cancellation_reason as string | null) ?? null,
    createdAt: String(b.createdAt ?? b.created_at ?? ''),
    updatedAt: String(b.updatedAt ?? b.updated_at ?? ''),
    cancelledAt: (b.cancelledAt as string | null) ?? (b.cancelled_at as string | null) ?? null,
    startAt: (b.startAt as string | null) ?? (b.start_at as string | null) ?? null,
    endAt: (b.endAt as string | null) ?? (b.end_at as string | null) ?? null
  }
}

function buildOptimisticRules(rules: AvailabilityRuleInput[]): AvailabilityRule[] {
  return rules.map(r => ({ id: crypto.randomUUID(), dayOfWeek: r.dayOfWeek, startTime: r.startTime, endTime: r.endTime }))
}

function buildOptimisticQuestions(questions?: SchedulingQuestionInput[]): SchedulingQuestion[] {
  return (questions ?? []).map(q => ({
    id: crypto.randomUUID(),
    label: q.label,
    type: q.type,
    isRequired: q.isRequired ?? false,
    isHidden: q.isHidden ?? false,
    options: q.options ?? null,
    sortOrder: q.sortOrder ?? 0
  }))
}

export function useSchedulingPages() {
  const toast = useToast()
  const { runOptimisticAction } = useOptimisticAction()

  // ─── Local reactive store ───────────────────────────────────────────────────
  // Same idea as useNotes.ts/useJournal.ts/useAppointments.ts: fetch results
  // are upserted into this instead of replacing state wholesale.
  const pagesById = reactive(new Map<string, SchedulingPage>())
  const pageIds = ref<string[]>([])

  function upsertPageInStore(page: SchedulingPage) {
    pagesById.set(page.id, { ...pagesById.get(page.id), ...page })
  }

  const {
    data: pagesFetchResult,
    status: pagesStatus,
    refresh: refreshPagesFetch
  } = useFetch<SchedulingPage[]>('/api/appointments/scheduling-pages', {
    lazy: true,
    immediate: false,
    key: 'scheduling-pages',
    default: () => [],
    transform: data => (data ?? []).map(normalizeSchedulingPage)
  })

  watch(pagesFetchResult, (list) => {
    if (!list) return
    for (const p of list) upsertPageInStore(p)
    pageIds.value = list.map(p => p.id)
  }, { immediate: true })

  const pages = computed(() => pageIds.value.map(id => pagesById.get(id)).filter((p): p is SchedulingPage => !!p))

  async function refreshPages() {
    await refreshPagesFetch()
  }

  async function createSchedulingPage(payload: CreateSchedulingPagePayload): Promise<SchedulingPage | null> {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()

    const optimisticPage: SchedulingPage = {
      id,
      userId: '',
      calendarId: payload.calendarId,
      title: payload.title,
      description: payload.description ?? null,
      durationMinutes: payload.durationMinutes,
      locationType: payload.locationType ?? SchedulingLocationType.VideoLink,
      locationDetails: payload.locationDetails ?? null,
      timezone: payload.timezone,
      color: payload.color ?? null,
      bufferBeforeMinutes: payload.bufferBeforeMinutes ?? 0,
      bufferAfterMinutes: payload.bufferAfterMinutes ?? 0,
      slotIncrementMinutes: payload.slotIncrementMinutes ?? 15,
      minNoticeHours: payload.minNoticeHours ?? 4,
      maxAdvanceDays: payload.maxAdvanceDays ?? 60,
      maxBookingsPerDay: payload.maxBookingsPerDay ?? null,
      calendarEventTitleTemplate: payload.calendarEventTitleTemplate ?? null,
      cancellationEnabled: payload.cancellationEnabled ?? true,
      rescheduleEnabled: payload.rescheduleEnabled ?? true,
      cancellationMinNoticeHours: payload.cancellationMinNoticeHours ?? null,
      cancellationReasonRequired: payload.cancellationReasonRequired ?? false,
      hideDetailsOnManagePage: payload.hideDetailsOnManagePage ?? false,
      requiresConfirmation: payload.requiresConfirmation ?? false,
      shareToken: '',
      isActive: true,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      availabilityRules: buildOptimisticRules(payload.availabilityRules),
      questions: buildOptimisticQuestions(payload.questions),
      bookingsCount: 0
    }

    const result = await runOptimisticAction<SchedulingPage>({
      apply: () => {
        upsertPageInStore(optimisticPage)
        pageIds.value = [id, ...pageIds.value]
      },
      rollback: () => {
        pagesById.delete(id)
        pageIds.value = pageIds.value.filter(i => i !== id)
      },
      request: () => $fetch('/api/appointments/scheduling-pages', {
        method: 'POST',
        body: { ...payload, id }
      }).then(normalizeSchedulingPage),
      reconcile: serverPage => upsertPageInStore(serverPage),
      errorMessage: 'Não foi possível criar a página.',
      offline: {
        entity: 'scheduling_page',
        action: 'create',
        method: 'POST',
        url: '/api/appointments/scheduling-pages',
        body: { ...payload, id },
        tempId: id,
        optimisticResult: optimisticPage
      }
    })

    if (result) toast.add({ title: 'Página de agendamento criada', color: 'success' })
    return result
  }

  async function fetchSchedulingPage(id: string): Promise<SchedulingPage | null> {
    try {
      const data = await $fetch(`/api/appointments/scheduling-pages/${id}`)
      const normalized = normalizeSchedulingPage(data)
      upsertPageInStore(normalized)
      return normalized
    } catch {
      // Already-seen page, connection just dropped — fall back to what we have.
      const cached = pagesById.get(id)
      if (cached) return cached
      toast.add({ title: 'Erro', description: 'Não foi possível carregar a página.', color: 'error' })
      return null
    }
  }

  async function updateSchedulingPage(id: string, payload: UpdateSchedulingPagePayload): Promise<SchedulingPage | null> {
    const previous = pagesById.get(id)
    const now = new Date().toISOString()

    const optimisticPage: SchedulingPage = {
      id,
      userId: previous?.userId ?? '',
      calendarId: payload.calendarId !== undefined ? payload.calendarId : (previous?.calendarId ?? ''),
      title: payload.title !== undefined ? payload.title : (previous?.title ?? ''),
      description: payload.description !== undefined ? (payload.description ?? null) : (previous?.description ?? null),
      durationMinutes: payload.durationMinutes !== undefined ? payload.durationMinutes : (previous?.durationMinutes ?? 30),
      locationType: payload.locationType !== undefined ? payload.locationType : (previous?.locationType ?? SchedulingLocationType.VideoLink),
      locationDetails: payload.locationDetails !== undefined ? (payload.locationDetails ?? null) : (previous?.locationDetails ?? null),
      timezone: payload.timezone !== undefined ? payload.timezone : (previous?.timezone ?? ''),
      color: payload.color !== undefined ? payload.color : (previous?.color ?? null),
      bufferBeforeMinutes: payload.bufferBeforeMinutes !== undefined ? payload.bufferBeforeMinutes : (previous?.bufferBeforeMinutes ?? 0),
      bufferAfterMinutes: payload.bufferAfterMinutes !== undefined ? payload.bufferAfterMinutes : (previous?.bufferAfterMinutes ?? 0),
      slotIncrementMinutes: payload.slotIncrementMinutes !== undefined ? payload.slotIncrementMinutes : (previous?.slotIncrementMinutes ?? 15),
      minNoticeHours: payload.minNoticeHours !== undefined ? payload.minNoticeHours : (previous?.minNoticeHours ?? 4),
      maxAdvanceDays: payload.maxAdvanceDays !== undefined ? payload.maxAdvanceDays : (previous?.maxAdvanceDays ?? 60),
      maxBookingsPerDay: payload.maxBookingsPerDay !== undefined ? payload.maxBookingsPerDay : (previous?.maxBookingsPerDay ?? null),
      calendarEventTitleTemplate: payload.calendarEventTitleTemplate !== undefined ? payload.calendarEventTitleTemplate : (previous?.calendarEventTitleTemplate ?? null),
      cancellationEnabled: payload.cancellationEnabled !== undefined ? payload.cancellationEnabled : (previous?.cancellationEnabled ?? true),
      rescheduleEnabled: payload.rescheduleEnabled !== undefined ? payload.rescheduleEnabled : (previous?.rescheduleEnabled ?? true),
      cancellationMinNoticeHours: payload.cancellationMinNoticeHours !== undefined ? payload.cancellationMinNoticeHours : (previous?.cancellationMinNoticeHours ?? null),
      cancellationReasonRequired: payload.cancellationReasonRequired !== undefined ? payload.cancellationReasonRequired : (previous?.cancellationReasonRequired ?? false),
      hideDetailsOnManagePage: payload.hideDetailsOnManagePage !== undefined ? payload.hideDetailsOnManagePage : (previous?.hideDetailsOnManagePage ?? false),
      requiresConfirmation: payload.requiresConfirmation !== undefined ? payload.requiresConfirmation : (previous?.requiresConfirmation ?? false),
      shareToken: previous?.shareToken ?? '',
      isActive: payload.isActive !== undefined ? payload.isActive : (previous?.isActive ?? true),
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      archivedAt: previous?.archivedAt ?? null,
      availabilityRules: payload.availabilityRules ? buildOptimisticRules(payload.availabilityRules) : previous?.availabilityRules,
      questions: payload.questions ? buildOptimisticQuestions(payload.questions) : previous?.questions,
      bookingsCount: previous?.bookingsCount
    }

    const result = await runOptimisticAction<SchedulingPage>({
      apply: () => upsertPageInStore(optimisticPage),
      rollback: () => { if (previous) upsertPageInStore(previous) },
      request: () => $fetch(`/api/appointments/scheduling-pages/${id}`, {
        method: 'PATCH',
        body: payload
      }).then(normalizeSchedulingPage),
      reconcile: serverPage => upsertPageInStore(serverPage),
      errorMessage: 'Não foi possível atualizar a página.',
      offline: {
        entity: 'scheduling_page',
        action: 'update',
        method: 'PATCH',
        url: `/api/appointments/scheduling-pages/${id}`,
        body: payload,
        tempId: id,
        optimisticResult: optimisticPage
      }
    })

    if (result) toast.add({ title: 'Página atualizada', color: 'success' })
    return result
  }

  async function archiveSchedulingPage(id: string): Promise<boolean> {
    const previous = pagesById.get(id)
    const now = new Date().toISOString()

    const result = await runOptimisticAction<{ success: true }>({
      apply: () => {
        if (previous) upsertPageInStore({ ...previous, isActive: false, archivedAt: now })
        pageIds.value = pageIds.value.filter(i => i !== id)
      },
      rollback: () => {
        if (previous) {
          upsertPageInStore(previous)
          if (!pageIds.value.includes(id)) pageIds.value = [...pageIds.value, id]
        }
      },
      request: () => $fetch(`/api/appointments/scheduling-pages/${id}/archive`, { method: 'POST' }).then(() => ({ success: true as const })),
      errorMessage: 'Não foi possível arquivar a página.',
      offline: {
        entity: 'scheduling_page',
        action: 'delete',
        method: 'POST',
        url: `/api/appointments/scheduling-pages/${id}/archive`,
        tempId: id,
        optimisticResult: { success: true }
      }
    })

    if (result) toast.add({ title: 'Página arquivada', color: 'success' })
    return result !== null
  }

  // ─── Unchanged — out of offline scope (server-generated token / read-then-create) ──
  async function regenerateShareToken(id: string): Promise<SchedulingPage | null> {
    try {
      const data = await $fetch(`/api/appointments/scheduling-pages/${id}/regenerate-token`, { method: 'POST' })
      toast.add({ title: 'Link regenerado', color: 'success' })
      const normalized = normalizeSchedulingPage(data)
      upsertPageInStore(normalized)
      return normalized
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível regenerar o link.', color: 'error' })
      return null
    }
  }

  async function duplicateSchedulingPage(pageId: string): Promise<SchedulingPage | null> {
    const full = await fetchSchedulingPage(pageId)
    if (!full) return null

    return createSchedulingPage({
      calendarId: full.calendarId,
      title: `${full.title} (cópia)`,
      description: full.description ?? undefined,
      durationMinutes: full.durationMinutes,
      locationType: full.locationType,
      locationDetails: full.locationDetails ?? undefined,
      timezone: full.timezone,
      color: full.color,
      bufferBeforeMinutes: full.bufferBeforeMinutes,
      bufferAfterMinutes: full.bufferAfterMinutes,
      slotIncrementMinutes: full.slotIncrementMinutes,
      minNoticeHours: full.minNoticeHours,
      maxAdvanceDays: full.maxAdvanceDays,
      maxBookingsPerDay: full.maxBookingsPerDay,
      calendarEventTitleTemplate: full.calendarEventTitleTemplate,
      cancellationEnabled: full.cancellationEnabled,
      rescheduleEnabled: full.rescheduleEnabled,
      cancellationMinNoticeHours: full.cancellationMinNoticeHours,
      cancellationReasonRequired: full.cancellationReasonRequired,
      hideDetailsOnManagePage: full.hideDetailsOnManagePage,
      requiresConfirmation: full.requiresConfirmation,
      availabilityRules: (full.availabilityRules ?? []).map(r => ({
        dayOfWeek: r.dayOfWeek,
        startTime: r.startTime,
        endTime: r.endTime
      })),
      questions: (full.questions ?? []).map(q => ({
        label: q.label,
        type: q.type,
        isRequired: q.isRequired,
        isHidden: q.isHidden,
        options: q.options ?? undefined,
        sortOrder: q.sortOrder
      }))
    })
  }

  async function fetchBookings(pageId: string): Promise<Booking[]> {
    try {
      const data = await $fetch<unknown[]>(`/api/appointments/scheduling-pages/${pageId}/bookings`)
      return (data ?? []).map(normalizeBooking)
    } catch {
      return []
    }
  }

  // These two are deliberately not routed through runOptimisticAction/the
  // offline queue like the rest of this composable: bookings aren't kept in
  // `pagesById` (they live in the caller's own useAsyncData, e.g.
  // scheduling-bookings/[id].vue), and approving/cancelling someone's
  // real-world meeting is exactly the kind of action that should surface a
  // clear error immediately rather than silently retry later while offline.
  async function approveBooking(pageId: string, bookingId: string): Promise<Booking | null> {
    try {
      const data = await $fetch(`/api/appointments/scheduling-pages/${pageId}/bookings/${bookingId}/approve`, { method: 'POST' })
      toast.add({ title: 'Reserva aprovada', color: 'success' })
      return normalizeBooking(data)
    } catch (err: unknown) {
      const message = (err as { data?: { statusMessage?: string } })?.data?.statusMessage
      toast.add({ title: 'Erro', description: message ?? 'Não foi possível aprovar a reserva.', color: 'error' })
      return null
    }
  }

  async function cancelBookingAsHost(pageId: string, bookingId: string, reason?: string): Promise<Booking | null> {
    try {
      const data = await $fetch(`/api/appointments/scheduling-pages/${pageId}/bookings/${bookingId}/cancel`, {
        method: 'POST',
        body: { reason }
      })
      toast.add({ title: 'Reserva cancelada', color: 'success' })
      return normalizeBooking(data)
    } catch (err: unknown) {
      const message = (err as { data?: { statusMessage?: string } })?.data?.statusMessage
      toast.add({ title: 'Erro', description: message ?? 'Não foi possível cancelar a reserva.', color: 'error' })
      return null
    }
  }

  // ─── Offline sync ───────────────────────────────────────────────────────────
  // Same drain-and-converge approach as useAppointments.ts/useNotes.ts. Filters
  // to this composable's own entity since the queue is shared across modules.
  const { pendingMutations, pendingCount, dequeue: dequeueMutation, markRetry, ensureLoaded: ensureQueueLoaded } = useMutationQueue()
  const { isOnline, onReconnect } = useConnectionStatus()
  const syncingOffline = ref(false)

  async function drainMutationQueue(): Promise<void> {
    if (syncingOffline.value) return
    await ensureQueueLoaded()
    const relevant = pendingMutations.value.filter(m => (SCHEDULING_ENTITIES as readonly string[]).includes(m.entity))
    if (relevant.length === 0) return

    syncingOffline.value = true
    let replayedAny = false

    try {
      const queue = [...relevant]

      for (const mutation of queue) {
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
          if (!isOnline.value) break
          console.error('[offline-sync] scheduling-page mutation failed', mutation, err)
          await markRetry(mutation.id)
        }
      }
    } finally {
      syncingOffline.value = false
      if (replayedAny) {
        await refreshPages()
        toast.add({ title: 'Sincronizado', description: 'Suas alterações offline nas páginas de agendamento foram salvas.', color: 'success' })
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
    pages,
    pagesStatus,
    refreshPages,
    createSchedulingPage,
    fetchSchedulingPage,
    updateSchedulingPage,
    archiveSchedulingPage,
    regenerateShareToken,
    duplicateSchedulingPage,
    fetchBookings,
    approveBooking,
    cancelBookingAsHost,
    // Offline
    isOnline,
    pendingSyncCount: pendingCount,
    syncingOffline
  }
}
