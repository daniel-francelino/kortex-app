import type {
  SchedulingPage,
  AvailabilityRule,
  SchedulingQuestion,
  Booking,
  CreateSchedulingPagePayload,
  UpdateSchedulingPagePayload
} from '~/types/scheduling'

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
    bufferBeforeMinutes: Number(page.bufferBeforeMinutes ?? page.buffer_before_minutes ?? 0),
    bufferAfterMinutes: Number(page.bufferAfterMinutes ?? page.buffer_after_minutes ?? 0),
    slotIncrementMinutes: Number(page.slotIncrementMinutes ?? page.slot_increment_minutes ?? 15),
    minNoticeHours: Number(page.minNoticeHours ?? page.min_notice_hours ?? 4),
    maxAdvanceDays: Number(page.maxAdvanceDays ?? page.max_advance_days ?? 60),
    maxBookingsPerDay: (page.maxBookingsPerDay as number | null) ?? (page.max_bookings_per_day as number | null) ?? null,
    shareToken: String(page.shareToken ?? page.share_token ?? ''),
    isActive: Boolean(page.isActive ?? page.is_active),
    createdAt: String(page.createdAt ?? page.created_at ?? ''),
    updatedAt: String(page.updatedAt ?? page.updated_at ?? ''),
    archivedAt: (page.archivedAt as string | null) ?? (page.archived_at as string | null) ?? null,
    availabilityRules: Array.isArray(page.availabilityRules) ? page.availabilityRules.map(normalizeAvailabilityRule) : undefined,
    questions: Array.isArray(page.questions) ? page.questions.map(normalizeQuestion) : undefined
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
    createdAt: String(b.createdAt ?? b.created_at ?? ''),
    updatedAt: String(b.updatedAt ?? b.updated_at ?? ''),
    cancelledAt: (b.cancelledAt as string | null) ?? (b.cancelled_at as string | null) ?? null
  }
}

export function useSchedulingPages() {
  const toast = useToast()

  const {
    data: pages,
    status: pagesStatus,
    refresh: refreshPages
  } = useFetch<SchedulingPage[]>('/api/appointments/scheduling-pages', {
    lazy: true,
    immediate: false,
    key: 'scheduling-pages',
    default: () => [],
    transform: data => (data ?? []).map(normalizeSchedulingPage)
  })

  async function createSchedulingPage(payload: CreateSchedulingPagePayload): Promise<SchedulingPage | null> {
    try {
      const data = await $fetch('/api/appointments/scheduling-pages', {
        method: 'POST',
        body: payload
      })
      toast.add({ title: 'Página de agendamento criada', color: 'success' })
      await refreshPages()
      return normalizeSchedulingPage(data)
    } catch (err: unknown) {
      const message = (err as { data?: { statusMessage?: string } })?.data?.statusMessage
      toast.add({ title: 'Erro', description: message ?? 'Não foi possível criar a página.', color: 'error' })
      return null
    }
  }

  async function fetchSchedulingPage(id: string): Promise<SchedulingPage | null> {
    try {
      const data = await $fetch(`/api/appointments/scheduling-pages/${id}`)
      return normalizeSchedulingPage(data)
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível carregar a página.', color: 'error' })
      return null
    }
  }

  async function updateSchedulingPage(id: string, payload: UpdateSchedulingPagePayload): Promise<SchedulingPage | null> {
    try {
      const data = await $fetch(`/api/appointments/scheduling-pages/${id}`, {
        method: 'PATCH',
        body: payload
      })
      toast.add({ title: 'Página atualizada', color: 'success' })
      await refreshPages()
      return normalizeSchedulingPage(data)
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível atualizar a página.', color: 'error' })
      return null
    }
  }

  async function archiveSchedulingPage(id: string): Promise<boolean> {
    try {
      await $fetch(`/api/appointments/scheduling-pages/${id}/archive`, { method: 'POST' })
      toast.add({ title: 'Página arquivada', color: 'success' })
      await refreshPages()
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível arquivar a página.', color: 'error' })
      return false
    }
  }

  async function regenerateShareToken(id: string): Promise<SchedulingPage | null> {
    try {
      const data = await $fetch(`/api/appointments/scheduling-pages/${id}/regenerate-token`, { method: 'POST' })
      toast.add({ title: 'Link regenerado', color: 'success' })
      return normalizeSchedulingPage(data)
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível regenerar o link.', color: 'error' })
      return null
    }
  }

  async function fetchBookings(pageId: string): Promise<Booking[]> {
    try {
      const data = await $fetch<unknown[]>(`/api/appointments/scheduling-pages/${pageId}/bookings`)
      return (data ?? []).map(normalizeBooking)
    } catch {
      return []
    }
  }

  return {
    pages,
    pagesStatus,
    refreshPages,
    createSchedulingPage,
    fetchSchedulingPage,
    updateSchedulingPage,
    archiveSchedulingPage,
    regenerateShareToken,
    fetchBookings
  }
}
