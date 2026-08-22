import { useDebounceFn } from '@vueuse/core'
import type {
  CreateJournalTagPayload,
  CreateMetricDefinitionPayload,
  JournalEntry,
  JournalInsights,
  JournalListResponse,
  JournalTag,
  MetricDefinition,
  MetricValueWithDefinition,
  UpdateMetricDefinitionPayload,
  UpsertEntryPayload,
  UpsertMetricValuesPayload
} from '~/types/journal'
import { MetricType } from '~/types/journal'

interface TodayResponse {
  entryDate: string
  entry: JournalEntry | null
  metrics: MetricValueWithDefinition[]
  streak: number
}

interface DateEntryResponse {
  entryDate: string
  entry: JournalEntry | null
  tags: JournalTag[]
  metrics: MetricValueWithDefinition[]
}

interface CalendarDay {
  date: string
  mood: string | null
}

const JOURNAL_ENTITIES = ['journal_entry', 'journal_tag', 'metric_definition', 'metric_value'] as const

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
  const tagsById = reactive(new Map<string, JournalTag>())
  const metricDefinitionsById = reactive(new Map<string, MetricDefinition>())
  const metricValuesByKey = reactive(new Map<string, MetricValueWithDefinition>())

  function metricValueKey(entryDate: string, metricDefinitionId: string): string {
    return `${entryDate}:${metricDefinitionId}`
  }

  function upsertEntryInStore(entry: JournalEntry) {
    entriesByDate.set(entry.entryDate, { ...entriesByDate.get(entry.entryDate), ...entry })
  }
  function upsertTagInStore(tag: JournalTag) {
    tagsById.set(tag.id, { ...tagsById.get(tag.id), ...tag })
  }
  function upsertMetricDefinitionInStore(def: MetricDefinition) {
    metricDefinitionsById.set(def.id, { ...metricDefinitionsById.get(def.id), ...def })
  }
  function upsertMetricValueInStore(value: MetricValueWithDefinition) {
    const key = metricValueKey(value.entryDate, value.metricDefinitionId)
    metricValuesByKey.set(key, { ...metricValuesByKey.get(key), ...value })
  }

  // The entries API works with tag *names*, not ids (POST /api/journal/entries
  // accepts `tags: string[]`) — this resolves each name against what's known
  // locally, synthesizing a placeholder for a brand-new name so the badge
  // shows immediately; reconcile() below replaces it with the server's tags.
  function resolveTagsByName(names: string[]): JournalTag[] {
    const known = Array.from(tagsById.values())
    return names.map((name) => {
      const existing = known.find(t => t.name === name)
      if (existing) return existing
      return { id: `temp-${name}`, userId: '', name, createdAt: new Date().toISOString() }
    })
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
    for (const mv of res.metrics) upsertMetricValueInStore(mv)
    todayStreak.value = res.streak
    todayLoadedOnce.value = true
  }, { immediate: true })

  const todayData = computed<TodayResponse | null>(() => {
    if (!todayLoadedOnce.value) return null
    const entry = entriesByDate.get(todayDate) ?? null
    const metrics = Array.from(metricValuesByKey.values()).filter(v => v.entryDate === todayDate)
    return { entryDate: todayDate, entry, metrics, streak: todayStreak.value }
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
  const listTag = ref('')

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
      to: listTo.value || undefined,
      tag: listTag.value || undefined
    })),
    lazy: true,
    key: 'journal-entries-list',
    watch: [listPage, listPageSize, listFrom, listTo, listTag]
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

  // ─── Tags ───────────────────────────────────────────────────────────────────
  const {
    data: tagsFetchResult,
    status: tagsStatus,
    refresh: refreshTagsFetch
  } = useFetch<JournalTag[]>('/api/journal/tags', { lazy: true, key: 'journal-tags' })

  const tagIds = ref<string[]>([])

  watch(tagsFetchResult, (list) => {
    if (!Array.isArray(list)) return
    for (const t of list) upsertTagInStore(t)
    tagIds.value = list.map(t => t.id)
  }, { immediate: true })

  const tags = computed(() => tagIds.value.map(id => tagsById.get(id)).filter((t): t is JournalTag => !!t))

  async function refreshTags() {
    await refreshTagsFetch()
  }

  // ─── Metric definitions ─────────────────────────────────────────────────────
  const {
    data: metricDefinitionsFetchResult,
    status: metricDefinitionsStatus,
    refresh: refreshMetricDefinitionsFetch
  } = useFetch<MetricDefinition[]>('/api/journal/metrics', { lazy: true, key: 'journal-metric-definitions' })

  const metricDefinitionIds = ref<string[]>([])

  watch(metricDefinitionsFetchResult, (list) => {
    if (!Array.isArray(list)) return
    for (const d of list) upsertMetricDefinitionInStore(d)
    metricDefinitionIds.value = list.map(d => d.id)
  }, { immediate: true })

  const metricDefinitions = computed(() =>
    metricDefinitionIds.value.map(id => metricDefinitionsById.get(id)).filter((d): d is MetricDefinition => !!d)
  )

  async function refreshMetricDefinitions() {
    await refreshMetricDefinitionsFetch()
  }

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
      tags: payload.tags !== undefined ? resolveTagsByName(payload.tags) : previous?.tags
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
        upsertEntryInStore({ ...serverEntry, tags: serverEntry.tags ?? optimisticEntry.tags })
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
      if (result.entry) upsertEntryInStore({ ...result.entry, tags: result.tags })
      for (const tag of result.tags) upsertTagInStore(tag)
      for (const mv of result.metrics) upsertMetricValueInStore(mv)
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

  // ─── Tag Actions ──────────────────────────────────────────────────────────

  async function createTag(payload: CreateJournalTagPayload): Promise<JournalTag | null> {
    const tempId = `temp-${crypto.randomUUID()}`
    const optimisticTag: JournalTag = { id: tempId, userId: '', name: payload.name, createdAt: new Date().toISOString() }

    const result = await runOptimisticAction({
      apply: () => {
        upsertTagInStore(optimisticTag)
        tagIds.value = [...tagIds.value, tempId]
      },
      rollback: () => {
        tagsById.delete(tempId)
        tagIds.value = tagIds.value.filter(id => id !== tempId)
      },
      request: () => $fetch<JournalTag>('/api/journal/tags', { method: 'POST', body: payload }),
      reconcile: (serverTag) => {
        tagsById.delete(tempId)
        upsertTagInStore(serverTag)
        tagIds.value = tagIds.value.map(id => (id === tempId ? serverTag.id : id))
      },
      errorMessage: 'Não foi possível criar a tag.',
      offline: {
        entity: 'journal_tag',
        action: 'create',
        method: 'POST',
        url: '/api/journal/tags',
        body: payload,
        tempId,
        optimisticResult: optimisticTag
      }
    })

    if (result) {
      toast.add({ title: 'Tag criada', description: `"${result.name}" criada com sucesso.`, color: 'success' })
    }
    return result
  }

  // ─── Metric Definition Actions ────────────────────────────────────────────

  async function createMetricDefinition(payload: CreateMetricDefinitionPayload): Promise<MetricDefinition | null> {
    const tempId = `temp-${crypto.randomUUID()}`
    const now = new Date().toISOString()
    const optimisticDef: MetricDefinition = {
      id: tempId,
      userId: '',
      key: payload.key,
      name: payload.name,
      description: payload.description ?? null,
      type: payload.type,
      unit: payload.unit ?? null,
      minValue: payload.minValue ?? null,
      maxValue: payload.maxValue ?? null,
      step: payload.step ?? null,
      options: payload.options ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now
    }

    const result = await runOptimisticAction({
      apply: () => {
        upsertMetricDefinitionInStore(optimisticDef)
        metricDefinitionIds.value = [...metricDefinitionIds.value, tempId]
      },
      rollback: () => {
        metricDefinitionsById.delete(tempId)
        metricDefinitionIds.value = metricDefinitionIds.value.filter(id => id !== tempId)
      },
      request: () => $fetch<MetricDefinition>('/api/journal/metrics', { method: 'POST', body: payload }),
      reconcile: (serverDef) => {
        metricDefinitionsById.delete(tempId)
        upsertMetricDefinitionInStore(serverDef)
        metricDefinitionIds.value = metricDefinitionIds.value.map(id => (id === tempId ? serverDef.id : id))
      },
      errorMessage: 'Não foi possível criar a métrica.',
      offline: {
        entity: 'metric_definition',
        action: 'create',
        method: 'POST',
        url: '/api/journal/metrics',
        body: payload,
        tempId,
        optimisticResult: optimisticDef
      }
    })

    if (result) {
      toast.add({ title: 'Métrica criada', description: `"${result.name}" criada com sucesso.`, color: 'success' })
    }
    return result
  }

  async function updateMetricDefinition(id: string, payload: UpdateMetricDefinitionPayload): Promise<MetricDefinition | null> {
    const previous = metricDefinitionsById.get(id)
    if (!previous) return null

    const optimisticDef: MetricDefinition = {
      ...previous,
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.description !== undefined ? { description: payload.description } : {}),
      ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
      ...(payload.minValue !== undefined ? { minValue: payload.minValue } : {}),
      ...(payload.maxValue !== undefined ? { maxValue: payload.maxValue } : {}),
      ...(payload.step !== undefined ? { step: payload.step } : {}),
      ...(payload.options !== undefined ? { options: payload.options } : {}),
      updatedAt: new Date().toISOString()
    }

    const result = await runOptimisticAction({
      apply: () => upsertMetricDefinitionInStore(optimisticDef),
      rollback: () => upsertMetricDefinitionInStore(previous),
      request: () => $fetch<MetricDefinition>(`/api/journal/metrics/${id}`, { method: 'PATCH', body: payload }),
      reconcile: updated => upsertMetricDefinitionInStore(updated),
      errorMessage: 'Não foi possível atualizar a métrica.',
      offline: {
        entity: 'metric_definition',
        action: 'update',
        method: 'PATCH',
        url: `/api/journal/metrics/${id}`,
        body: payload,
        tempId: id.startsWith('temp-') ? id : undefined,
        optimisticResult: optimisticDef
      }
    })

    if (result) {
      toast.add({ title: 'Métrica atualizada', description: `"${result.name}" salva com sucesso.`, color: 'success' })
    }
    return result
  }

  // ─── Metric Values Actions ────────────────────────────────────────────────

  async function upsertMetricValues(payload: UpsertMetricValuesPayload): Promise<boolean> {
    const previousValues = new Map<string, MetricValueWithDefinition | undefined>()
    const optimisticValues: MetricValueWithDefinition[] = []

    for (const v of payload.values) {
      const def = Array.from(metricDefinitionsById.values()).find(d => d.key === v.metricKey)
      if (!def) continue
      const key = metricValueKey(payload.entryDate, def.id)
      const existing = metricValuesByKey.get(key)
      previousValues.set(key, existing)
      optimisticValues.push({
        id: existing?.id ?? `temp-${key}`,
        userId: existing?.userId ?? '',
        entryDate: payload.entryDate,
        metricDefinitionId: def.id,
        numberValue: v.numberValue ?? null,
        booleanValue: v.booleanValue ?? null,
        textValue: v.textValue ?? null,
        selectValue: v.selectValue ?? null,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        definition: def
      })
    }

    const result = await runOptimisticAction({
      apply: () => {
        for (const val of optimisticValues) upsertMetricValueInStore(val)
      },
      rollback: () => {
        for (const [key, prev] of previousValues.entries()) {
          if (prev) metricValuesByKey.set(key, prev)
          else metricValuesByKey.delete(key)
        }
      },
      request: () => $fetch<MetricValueWithDefinition[]>('/api/journal/metric-values', { method: 'POST', body: payload }),
      reconcile: (serverValues) => {
        for (const val of serverValues) upsertMetricValueInStore(val)
      },
      errorMessage: 'Não foi possível salvar as métricas.',
      offline: {
        entity: 'metric_value',
        action: 'update',
        method: 'POST',
        url: '/api/journal/metric-values',
        body: payload,
        optimisticResult: optimisticValues
      }
    })

    if (result) {
      toast.add({ title: 'Métricas salvas', description: 'Os valores foram salvos com sucesso.', color: 'success' })
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
    const reconciledTempIds: string[] = []

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
          if (mutation.action === 'create' && mutation.tempId) reconciledTempIds.push(mutation.tempId)
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
        // Drop the placeholders now that a real create replayed — the
        // refetch below adds the real entity in its place.
        for (const tempId of reconciledTempIds) {
          tagsById.delete(tempId)
          tagIds.value = tagIds.value.filter(id => id !== tempId)
          metricDefinitionsById.delete(tempId)
          metricDefinitionIds.value = metricDefinitionIds.value.filter(id => id !== tempId)
        }
        await Promise.all([refreshToday(), refreshList(), refreshCalendar(), refreshTags(), refreshMetricDefinitions()])
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

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const metricTypeOptions = [
    { label: 'Numérico', value: MetricType.Number },
    { label: 'Escala', value: MetricType.Scale },
    { label: 'Sim/Não', value: MetricType.Boolean },
    { label: 'Seleção', value: MetricType.Select },
    { label: 'Texto', value: MetricType.Text }
  ]

  function getMetricTypeLabel(type: string): string {
    return metricTypeOptions.find(o => o.value === type)?.label ?? type
  }

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
    listTag,
    refreshList,
    // Tags
    tags,
    tagsStatus,
    refreshTags,
    // Metric definitions
    metricDefinitions,
    metricDefinitionsStatus,
    refreshMetricDefinitions,
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
    createTag,
    createMetricDefinition,
    updateMetricDefinition,
    upsertMetricValues,
    // Offline
    isOnline,
    pendingSyncCount: pendingCount,
    syncingOffline,
    // Helpers
    metricTypeOptions,
    getMetricTypeLabel
  }
}
