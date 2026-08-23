import { useDebounceFn } from '@vueuse/core'
import type {
  JournalEntry,
  JournalInsights,
  JournalListResponse,
  UpsertEntryPayload
} from '~/types/journal'

interface TodayResponse {
  entryDate: string
  entry: JournalEntry | null
  streak: number
}

interface DateEntryResponse {
  entryDate: string
  entry: JournalEntry | null
}

interface CalendarDay {
  date: string
  mood: string | null
}

const JOURNAL_ENTITIES = ['journal_entry'] as const

export function useJournal() {
  const toast = useToast()
  const { runOptimisticAction } = useOptimisticAction()

  const todayDate = new Date().toISOString().split('T')[0] ?? ''

  // ─── Local reactive store ───────────────────────────────────────────────────
  // Single source of truth for the UI, same idea as useNotes.ts: fetch results
  // are merged (upserted) into these instead of replacing them wholesale, so
  // an optimistic mutation shows up instantly and a background refetch never
  // flashes a view back to empty/loading or clobbers an in-flight edit.
  const entriesByDate = reactive(new Map<string, JournalEntry>())

  function upsertEntryInStore(entry: JournalEntry) {
    entriesByDate.set(entry.entryDate, { ...entriesByDate.get(entry.entryDate), ...entry })
  }

  function patchCalendarDate(date: string, mood: string | null) {
    const idx = calendarDates.value.findIndex(d => d.date === date)
    if (idx !== -1) {
      calendarDates.value = calendarDates.value.map((d, i) => (i === idx ? { date, mood } : d))
    } else if (calendarFrom.value && calendarTo.value && date >= calendarFrom.value && date <= calendarTo.value) {
      calendarDates.value = [...calendarDates.value, { date, mood }].sort((a, b) => a.date.localeCompare(b.date))
    }
  }
  function removeCalendarDate(date: string) {
    calendarDates.value = calendarDates.value.filter(d => d.date !== date)
  }

  // ─── Today ──────────────────────────────────────────────────────────────────
  const {
    data: todayFetchResult,
    status: todayStatus,
    refresh: refreshTodayFetch
  } = useFetch<TodayResponse>('/api/journal/today', { lazy: true, key: 'journal-today' })

  const todayLoadedOnce = ref(false)
  const todayStreak = ref(0)

  watch(todayFetchResult, (res) => {
    if (!res) return
    if (res.entry) upsertEntryInStore(res.entry)
    todayStreak.value = res.streak
    todayLoadedOnce.value = true
  }, { immediate: true })

  const todayData = computed<TodayResponse | null>(() => {
    if (!todayLoadedOnce.value) return null
    const entry = entriesByDate.get(todayDate) ?? null
    return { entryDate: todayDate, entry, streak: todayStreak.value }
  })

  async function refreshToday() {
    await refreshTodayFetch()
  }

  // ─── Entry list (paginated) ─────────────────────────────────────────────────
  const listPage = ref(1)
  const listPageSize = ref(20)
  const listSearch = ref('')
  const listFrom = ref('')
  const listTo = ref('')

  const {
    data: listFetchResult,
    status: listFetchStatus,
    refresh: refreshListFetch
  } = useFetch<JournalListResponse>('/api/journal/entries', {
    query: computed(() => ({
      page: listPage.value,
      pageSize: listPageSize.value,
      q: listSearch.value || undefined,
      from: listFrom.value || undefined,
      to: listTo.value || undefined
    })),
    lazy: true,
    key: 'journal-entries-list',
    watch: [listPage, listPageSize, listFrom, listTo]
  })

  const paginatedEntryDates = ref<string[]>([])
  const listLoadedOnce = ref(false)
  const lastKnownListTotal = ref(0)
  const lastKnownListPage = ref(1)
  const lastKnownListPageSize = ref(listPageSize.value)

  watch(listFetchResult, (res) => {
    if (!res) return
    for (const e of res.data) upsertEntryInStore(e)
    paginatedEntryDates.value = res.data.map(e => e.entryDate)
    lastKnownListTotal.value = res.total
    lastKnownListPage.value = res.page
    lastKnownListPageSize.value = res.pageSize
    listLoadedOnce.value = true
  }, { immediate: true })

  const paginatedEntries = computed(() =>
    paginatedEntryDates.value.map(d => entriesByDate.get(d)).filter((e): e is JournalEntry => !!e)
  )

  const listData = computed<JournalListResponse | null>(() => {
    if (!listLoadedOnce.value) return null
    return {
      data: paginatedEntries.value,
      total: lastKnownListTotal.value,
      page: lastKnownListPage.value,
      pageSize: lastKnownListPageSize.value
    }
  })

  async function refreshList() {
    await refreshListFetch()
  }

  const debouncedRefreshList = useDebounceFn(() => {
    refreshList()
  }, 300)

  watch(listSearch, () => {
    listPage.value = 1
    debouncedRefreshList()
  })

  // ─── Insights ───────────────────────────────────────────────────────────────
  // Read-only server-computed aggregate — not part of the optimistic store
  // (same treatment as useNotes.ts's graphData), just refreshed on demand.
  const insightsRange = ref<'7d' | '30d' | '90d'>('30d')

  const {
    data: insights,
    status: insightsStatus,
    refresh: refreshInsights
  } = useFetch<JournalInsights>('/api/journal/insights', {
    query: computed(() => ({ range: insightsRange.value })),
    lazy: true,
    key: 'journal-insights',
    watch: [insightsRange]
  })

  // ─── Calendar dates ─────────────────────────────────────────────────────────
  const calendarFrom = ref('')
  const calendarTo = ref('')

  const {
    data: calendarFetchResult,
    status: calendarStatus,
    refresh: refreshCalendarFetch
  } = useFetch<CalendarDay[]>('/api/journal/calendar', {
    query: computed(() => ({
      from: calendarFrom.value || undefined,
      to: calendarTo.value || undefined
    })),
    lazy: true,
    key: 'journal-calendar',
    watch: [calendarFrom, calendarTo]
  })

  const calendarDates = ref<CalendarDay[]>([])

  watch(calendarFetchResult, (list) => {
    if (!Array.isArray(list)) return
    calendarDates.value = list
  }, { immediate: true })

  async function refreshCalendar() {
    await refreshCalendarFetch()
  }

  // ─── Entry Actions ────────────────────────────────────────────────────────

  async function upsertEntry(payload: UpsertEntryPayload, options?: { silent?: boolean }): Promise<JournalEntry | null> {
    const previous = entriesByDate.get(payload.entryDate)
    const now = new Date().toISOString()

    const optimisticEntry: JournalEntry = {
      id: previous?.id ?? `temp-${payload.entryDate}`,
      userId: previous?.userId ?? '',
      entryDate: payload.entryDate,
      title: payload.title !== undefined ? payload.title : (previous?.title ?? null),
      content: payload.content,
      mood: payload.mood !== undefined ? payload.mood : (previous?.mood ?? null),
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      archivedAt: null,
      locked: previous?.locked ?? false,
      isEncrypted: payload.isEncrypted !== undefined ? payload.isEncrypted : (previous?.isEncrypted ?? false),
      contentIv: payload.contentIv !== undefined ? payload.contentIv : (previous?.contentIv ?? null),
      titleIv: payload.titleIv !== undefined ? payload.titleIv : (previous?.titleIv ?? null)
    }

    const result = await runOptimisticAction({
      apply: () => {
        upsertEntryInStore(optimisticEntry)
        patchCalendarDate(payload.entryDate, optimisticEntry.mood ?? null)
      },
      rollback: () => {
        if (previous) upsertEntryInStore(previous)
        else entriesByDate.delete(payload.entryDate)
        patchCalendarDate(payload.entryDate, previous?.mood ?? null)
      },
      request: () => $fetch<JournalEntry>('/api/journal/entries', { method: 'POST', body: payload }),
      reconcile: (serverEntry) => {
        upsertEntryInStore(serverEntry)
        patchCalendarDate(payload.entryDate, serverEntry.mood ?? null)
      },
      errorMessage: 'Não foi possível salvar a entrada.',
      silent: options?.silent,
      offline: {
        entity: 'journal_entry',
        action: 'update',
        method: 'POST',
        url: '/api/journal/entries',
        body: payload,
        optimisticResult: optimisticEntry
      }
    })

    if (result) {
      if (!options?.silent) {
        toast.add({ title: 'Entrada salva', description: 'Sua entrada foi salva com sucesso.', color: 'success' })
        // Fire-and-forget corrections for views the optimistic patch above
        // doesn't fully cover (pagination totals, server-side ordering) —
        // the UI already reflects the change, this just converges the rest.
        refreshList()
      }
    }
    return result
  }

  async function fetchEntryByDate(date: string): Promise<DateEntryResponse | null> {
    try {
      const result = await $fetch<DateEntryResponse>(`/api/journal/entries/${date}`)
      if (result.entry) upsertEntryInStore(result.entry)
      return result
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível carregar a entrada.', color: 'error' })
      return null
    }
  }

  async function deleteEntry(date: string): Promise<boolean> {
    const previous = entriesByDate.get(date)
    const previousCalendar = calendarDates.value.find(d => d.date === date)

    const result = await runOptimisticAction({
      apply: () => {
        entriesByDate.delete(date)
        paginatedEntryDates.value = paginatedEntryDates.value.filter(d => d !== date)
        removeCalendarDate(date)
      },
      rollback: () => {
        if (previous) upsertEntryInStore(previous)
        if (previousCalendar) patchCalendarDate(date, previousCalendar.mood)
      },
      request: () => $fetch<{ success: boolean }>(`/api/journal/entries/${date}`, { method: 'DELETE' }),
      errorMessage: 'Não foi possível excluir a entrada.',
      offline: {
        entity: 'journal_entry',
        action: 'delete',
        method: 'DELETE',
        url: `/api/journal/entries/${date}`,
        optimisticResult: { success: true }
      }
    })

    if (result !== null) {
      toast.add({ title: 'Entrada excluída', description: 'A entrada foi removida do diário.', color: 'success' })
      refreshList()
    }
    return result !== null
  }

  // ─── Offline sync ───────────────────────────────────────────────────────────
  // Same drain-and-converge approach as useNotes.ts: replay each queued
  // request in order, then let a full refetch (rather than fine-grained
  // per-mutation reconciliation) settle the store — the mutations being
  // replayed may well be from a previous session. Filters to this
  // composable's own entities since the queue is shared with useNotes.ts.
  const { pendingMutations, pendingCount, dequeue: dequeueMutation, markRetry, ensureLoaded: ensureQueueLoaded } = useMutationQueue()
  const { isOnline, onReconnect } = useConnectionStatus()
  const syncingOffline = ref(false)

  async function drainMutationQueue(): Promise<void> {
    if (syncingOffline.value) return
    await ensureQueueLoaded()
    const relevant = pendingMutations.value.filter(m => (JOURNAL_ENTITIES as readonly string[]).includes(m.entity))
    if (relevant.length === 0) return

    syncingOffline.value = true
    let replayedAny = false

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
          console.error('[offline-sync] journal mutation failed', mutation, err)
          await markRetry(mutation.id)
        }
      }
    } finally {
      syncingOffline.value = false
      if (replayedAny) {
        await Promise.all([refreshToday(), refreshList(), refreshCalendar()])
        toast.add({ title: 'Sincronizado', description: 'Suas alterações offline no diário foram salvas.', color: 'success' })
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
    // Today
    todayData,
    todayStatus,
    refreshToday,
    // List
    listData,
    listFetchStatus,
    listPage,
    listPageSize,
    listSearch,
    listFrom,
    listTo,
    refreshList,
    // Insights
    insights,
    insightsStatus,
    insightsRange,
    refreshInsights,
    // Calendar
    calendarDates,
    calendarStatus,
    calendarFrom,
    calendarTo,
    refreshCalendar,
    // Actions
    upsertEntry,
    fetchEntryByDate,
    deleteEntry,
    // Offline
    isOnline,
    pendingSyncCount: pendingCount,
    syncingOffline
  }
}
