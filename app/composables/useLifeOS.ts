import type { DailyDashboardResponse, LifeInsights, LifeArea, EntityLink, CreateLifeAreaPayload, CreateEntityLinkPayload } from '~/types/life-os'
import { detectBrowserTimeZone } from '#shared/utils/dateTime'

export function useLifeOS() {
  const toast = useToast()
  const auth = useAuth()

  // Regra 1 (docs/timezone/ANALISE_TIMEZONE.md): the server can't detect the
  // browser's zone on its own, so the client sends it explicitly — `undefined`
  // during SSR (there's no browser there; the server falls back to the
  // user's stored preference instead of trusting a fake value).
  const clientTimezone = ref<string | undefined>(undefined)
  const dashboardQuery = computed(() => ({ tz: clientTimezone.value }))

  // ─── Daily Dashboard ────────────────────────────────────────────────────
  const {
    data: dashboard,
    status: dashboardStatus,
    refresh: refreshDashboard
  } = useFetch<DailyDashboardResponse>('/api/life/dashboard', {
    lazy: true,
    immediate: false,
    server: false,
    key: 'life-dashboard',
    watch: false,
    credentials: 'include',
    query: dashboardQuery,
    default: () => ({
      date: '',
      habits: { items: [], completedCount: 0, totalCount: 0 },
      tasks: { items: [], pendingCount: 0, overdueCount: 0 },
      events: { items: [], totalCount: 0 },
      journal: {
        id: null,
        entryDate: '',
        title: null,
        contentPreview: null,
        exists: false
      }
    })
  })

  // `data` above is never null/undefined — the `default` factory populates it
  // with zeroed-out placeholder values synchronously, before the request even
  // resolves. A page checking `!dashboard` to decide whether to show a loading
  // skeleton would never see it as falsy, so the skeleton never renders — the
  // placeholder (zero habits, zero events...) flashes instead. This tracks the
  // first real resolution instead, same idea as useAppointments' eventsLoadedOnce.
  const dashboardLoadedOnce = ref(false)
  watch(dashboardStatus, (status) => {
    if (status === 'success' || status === 'error') dashboardLoadedOnce.value = true
  }, { immediate: true })
  const dashboardInitialLoading = computed(() =>
    !dashboardLoadedOnce.value && (dashboardStatus.value === 'idle' || dashboardStatus.value === 'pending')
  )

  // ─── Insights ───────────────────────────────────────────────────────────
  const {
    data: insights,
    status: insightsStatus,
    refresh: refreshInsights
  } = useFetch<LifeInsights>('/api/life/insights', {
    lazy: true,
    immediate: false,
    server: false,
    key: 'life-insights',
    watch: false,
    credentials: 'include',
    query: dashboardQuery,
    default: () => ({
      period: '30d',
      habits: { completionRate7d: 0, completionRate30d: 0, averageStreak: 0, totalActive: 0 },
      tasks: { completedLast7d: 0, completedLast30d: 0, pendingCount: 0, overdueCount: 0 },
      goals: { totalActive: 0, averageProgress: 0, completedCount: 0 },
      journal: { entriesLast7d: 0, entriesLast30d: 0, currentStreak: 0 }
    })
  })

  // Same issue as dashboardLoadedOnce above — `insights` is never falsy either.
  const insightsLoadedOnce = ref(false)
  watch(insightsStatus, (status) => {
    if (status === 'success' || status === 'error') insightsLoadedOnce.value = true
  }, { immediate: true })
  const insightsInitialLoading = computed(() =>
    !insightsLoadedOnce.value && (insightsStatus.value === 'idle' || insightsStatus.value === 'pending')
  )

  // ─── Initial dashboard bootstrap ────────────────────────────────────────
  const initialDashboardLoadStarted = ref(false)

  async function loadInitialDashboard() {
    if (!import.meta.client || initialDashboardLoadStarted.value)
      return

    await auth.ensureReady()

    if (!auth.isAuthenticated.value)
      return

    initialDashboardLoadStarted.value = true
    clientTimezone.value = detectBrowserTimeZone()

    await Promise.all([
      refreshDashboard(),
      refreshInsights()
    ])
  }

  onMounted(() => {
    void loadInitialDashboard()
  })

  watch([auth.ready, auth.isAuthenticated], () => {
    void loadInitialDashboard()
  })

  // ─── Life Areas ─────────────────────────────────────────────────────────
  const {
    data: areasResponse,
    status: areasStatus,
    refresh: refreshAreas
  } = useFetch<{ data: LifeArea[], total: number }>('/api/life/areas', {
    lazy: true,
    default: () => ({ data: [], total: 0 })
  })

  const areas = computed(() => areasResponse.value?.data ?? [])

  async function createArea(payload: CreateLifeAreaPayload) {
    try {
      await $fetch('/api/life/areas', { method: 'POST', body: payload })
      toast.add({ title: 'Área criada', description: `"${payload.name}" foi adicionada.`, color: 'success' })
      await refreshAreas()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      toast.add({ title: 'Erro', description: msg, color: 'error' })
      throw err
    }
  }

  async function updateArea(id: string, payload: CreateLifeAreaPayload) {
    try {
      await $fetch(`/api/life/areas/${id}`, { method: 'PUT', body: payload })
      toast.add({ title: 'Área atualizada', description: `"${payload.name}" foi atualizada.`, color: 'success' })
      await refreshAreas()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      toast.add({ title: 'Erro', description: msg, color: 'error' })
      throw err
    }
  }

  async function deleteArea(id: string) {
    try {
      await $fetch(`/api/life/areas/${id}`, { method: 'DELETE' })
      toast.add({ title: 'Área excluída', description: 'Área de vida removida.', color: 'success' })
      await refreshAreas()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      toast.add({ title: 'Erro', description: msg, color: 'error' })
      throw err
    }
  }

  // ─── Entity Links ──────────────────────────────────────────────────────
  async function createLink(payload: CreateEntityLinkPayload) {
    try {
      const result = await $fetch<EntityLink>('/api/life/links', { method: 'POST', body: payload })
      toast.add({ title: 'Vínculo criado', description: 'Entidades vinculadas com sucesso.', color: 'success' })
      return result
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      toast.add({ title: 'Erro', description: msg, color: 'error' })
      throw err
    }
  }

  async function deleteLink(id: string) {
    try {
      await $fetch(`/api/life/links/${id}`, { method: 'DELETE' })
      toast.add({ title: 'Vínculo removido', description: 'Vínculo excluído com sucesso.', color: 'success' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      toast.add({ title: 'Erro', description: msg, color: 'error' })
      throw err
    }
  }

  // ─── Refresh All ────────────────────────────────────────────────────────
  async function refreshAll() {
    await Promise.all([
      refreshDashboard(),
      refreshInsights(),
      refreshAreas()
    ])
  }

  return {
    // Dashboard
    dashboard,
    dashboardStatus,
    dashboardInitialLoading,
    refreshDashboard,
    // Insights
    insights,
    insightsStatus,
    insightsInitialLoading,
    refreshInsights,
    // Life Areas
    areas,
    areasStatus,
    refreshAreas,
    createArea,
    updateArea,
    deleteArea,
    // Entity Links
    createLink,
    deleteLink,
    // Utilities
    refreshAll
  }
}
