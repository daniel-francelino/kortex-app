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
}

interface DateEntryResponse {
  entryDate: string
  entry: JournalEntry | null
  tags: JournalTag[]
  metrics: MetricValueWithDefinition[]
}

export function useJournal() {
  const toast = useToast()

  // ─── Today ──────────────────────────────────────────────────────────────────
  const {
    data: todayData,
    status: todayStatus,
    refresh: refreshToday
  } = useFetch<TodayResponse>('/api/journal/today', {
    lazy: true,
    key: 'journal-today'
  })

  // ─── Entry list (paginated) ─────────────────────────────────────────────────
  const listPage = ref(1)
  const listPageSize = ref(20)
  const listSearch = ref('')
  const listFrom = ref('')
  const listTo = ref('')
  const listTag = ref('')

  const {
    data: listData,
    status: listFetchStatus,
    refresh: refreshList
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

  const debouncedRefreshList = useDebounceFn(() => {
    refreshList()
  }, 300)

  watch(listSearch, () => {
    listPage.value = 1
    debouncedRefreshList()
  })

  // ─── Tags ───────────────────────────────────────────────────────────────────
  const {
    data: tags,
    status: tagsStatus,
    refresh: refreshTags
  } = useFetch<JournalTag[]>('/api/journal/tags', {
    lazy: true,
    key: 'journal-tags'
  })

  // ─── Metric definitions ─────────────────────────────────────────────────────
  const {
    data: metricDefinitions,
    status: metricDefinitionsStatus,
    refresh: refreshMetricDefinitions
  } = useFetch<MetricDefinition[]>('/api/journal/metrics', {
    lazy: true,
    key: 'journal-metric-definitions'
  })

  // ─── Insights ───────────────────────────────────────────────────────────────
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
    data: calendarDates,
    status: calendarStatus,
    refresh: refreshCalendar
  } = useFetch<{ date: string; mood: string | null }[]>('/api/journal/calendar', {
    query: computed(() => ({
      from: calendarFrom.value || undefined,
      to: calendarTo.value || undefined
    })),
    lazy: true,
    key: 'journal-calendar',
    watch: [calendarFrom, calendarTo]
  })

  // ─── Entry Actions ────────────────────────────────────────────────────────

  async function upsertEntry(payload: UpsertEntryPayload, options?: { silent?: boolean }): Promise<JournalEntry | null> {
    try {
      const entry = await $fetch<JournalEntry>('/api/journal/entries', {
        method: 'POST',
        body: payload
      })
      if (!options?.silent) {
        toast.add({ title: 'Entrada salva', description: 'Sua entrada foi salva com sucesso.', color: 'success' })
      }
      await refreshList()
      await refreshToday()
      await refreshCalendar()
      return entry
    } catch {
      if (!options?.silent) {
        toast.add({ title: 'Erro', description: 'Não foi possível salvar a entrada.', color: 'error' })
      }
      return null
    }
  }

  async function fetchEntryByDate(date: string): Promise<DateEntryResponse | null> {
    try {
      return await $fetch<DateEntryResponse>(`/api/journal/entries/${date}`)
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível carregar a entrada.', color: 'error' })
      return null
    }
  }

  // ─── Tag Actions ──────────────────────────────────────────────────────────

  async function createTag(payload: CreateJournalTagPayload): Promise<JournalTag | null> {
    try {
      const tag = await $fetch<JournalTag>('/api/journal/tags', {
        method: 'POST',
        body: payload
      })
      toast.add({ title: 'Tag criada', description: `"${tag.name}" criada com sucesso.`, color: 'success' })
      await refreshTags()
      return tag
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível criar a tag.', color: 'error' })
      return null
    }
  }

  // ─── Metric Definition Actions ────────────────────────────────────────────

  async function createMetricDefinition(payload: CreateMetricDefinitionPayload): Promise<MetricDefinition | null> {
    try {
      const def = await $fetch<MetricDefinition>('/api/journal/metrics', {
        method: 'POST',
        body: payload
      })
      toast.add({ title: 'Métrica criada', description: `"${def.name}" criada com sucesso.`, color: 'success' })
      await refreshMetricDefinitions()
      return def
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível criar a métrica.', color: 'error' })
      return null
    }
  }

  async function updateMetricDefinition(id: string, payload: UpdateMetricDefinitionPayload): Promise<MetricDefinition | null> {
    try {
      const def = await $fetch<MetricDefinition>(`/api/journal/metrics/${id}`, {
        method: 'PATCH',
        body: payload
      })
      toast.add({ title: 'Métrica atualizada', description: `"${def.name}" salva com sucesso.`, color: 'success' })
      await refreshMetricDefinitions()
      return def
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível atualizar a métrica.', color: 'error' })
      return null
    }
  }

  // ─── Metric Values Actions ────────────────────────────────────────────────

  async function upsertMetricValues(payload: UpsertMetricValuesPayload): Promise<boolean> {
    try {
      await $fetch('/api/journal/metric-values', {
        method: 'POST',
        body: payload
      })
      toast.add({ title: 'Métricas salvas', description: 'Os valores foram salvos com sucesso.', color: 'success' })
      await refreshToday()
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível salvar as métricas.', color: 'error' })
      return false
    }
  }

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
    createTag,
    createMetricDefinition,
    updateMetricDefinition,
    upsertMetricValues,
    // Helpers
    metricTypeOptions,
    getMetricTypeLabel
  }
}
