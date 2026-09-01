import { useDebounceFn } from '@vueuse/core'
import { detectBrowserTimeZone, todayInZone } from '#shared/utils/dateTime'
import type {
  CalendarDay,
  CreateHabitPayload,
  CreateHabitStackPayload,
  CreateHabitTagPayload,
  CreateIdentityPayload,
  CreateReflectionPayload,
  HabitChangeHistory,
  HabitInsights,
  HabitListResponse,
  HabitReflection,
  HabitStack,
  HabitTag,
  HabitTreeSyncNode,
  HabitUserSettings,
  Identity,
  LogHabitPayload,
  SharedHabitsProgress,
  TodayHabit,
  TodayHabitsResponse,
  UpdateHabitPayload,
  UpdateIdentityPayload,
  UpdateHabitUserSettingsPayload,
  Habit
} from '~/types/habits'
import { HabitDifficulty, HabitFrequency, HabitLogStatus, HabitType } from '~/types/habits'
import { PostHogEvent } from '~/types/analytics'

export function useHabits() {
  const toast = useToast()
  const { capture } = usePostHog()

  function trackHabitsEvent(event: PostHogEvent, properties?: Record<string, boolean | number | string | undefined>) {
    capture(event, {
      product_area: 'habits',
      ...properties
    })
  }

  function getHabitTrackingProperties(
    habit: Pick<Habit, 'customDays' | 'difficulty' | 'frequency' | 'habitType' | 'identityId' | 'scheduledEndTime' | 'scheduledTime' | 'tags'>
  ) {
    return {
      custom_days_count: habit.customDays?.length ?? 0,
      difficulty: habit.difficulty,
      frequency: habit.frequency,
      habit_type: habit.habitType,
      has_identity: Boolean(habit.identityId),
      has_scheduled_end_time: Boolean(habit.scheduledEndTime),
      has_scheduled_time: Boolean(habit.scheduledTime),
      tag_count: habit.tags?.length ?? 0
    }
  }

  function getHabitPayloadTrackingProperties(payload: CreateHabitPayload | UpdateHabitPayload) {
    return {
      custom_days_count: payload.customDays?.length ?? 0,
      difficulty: payload.difficulty,
      frequency: payload.frequency,
      habit_type: payload.habitType,
      has_description: Boolean(payload.description?.trim()),
      has_identity: Boolean(payload.identityId),
      has_scheduled_end_time: Boolean(payload.scheduledEndTime),
      has_scheduled_time: Boolean(payload.scheduledTime),
      tag_count: payload.tagIds?.length ?? 0
    }
  }

  function getTreeDepth(nodes: HabitTreeSyncNode[], depth = 1): number {
    if (!nodes.length)
      return depth - 1

    return Math.max(
      depth,
      ...nodes.map(node => getTreeDepth(node.children ?? [], depth + 1))
    )
  }

  // Regra 1 (docs/timezone/ANALISE_TIMEZONE.md): sent on every request below
  // that needs the server to know "today" — `undefined` during SSR, where
  // there's no browser to ask (the server falls back to the stored preference).
  const clientTimezone = detectBrowserTimeZone()

  // ─── Today habits ────────────────────────────────────────────────────────────
  const todayDate = ref(clientTimezone ? todayInZone(clientTimezone) : new Date().toISOString().split('T')[0])

  const {
    data: todayData,
    status: todayStatus,
    refresh: refreshToday
  } = useFetch<TodayHabitsResponse>('/api/habits/today', {
    query: computed(() => ({
      date: todayDate.value,
      tz: clientTimezone
    })),
    lazy: true,
    immediate: false,
    key: 'habits-today',
    watch: [todayDate]
  })

  // ─── Habits list (paginated) ────────────────────────────────────────────────
  const listPage = ref(1)
  const listPageSize = ref(20)
  const listSearch = ref('')
  const listFrequency = ref<string>('')
  const listDifficulty = ref<string>('')
  const listIdentityId = ref<string>('')
  const listArchived = ref(false)

  const {
    data: listData,
    status: listStatus,
    refresh: refreshList
  } = useFetch<HabitListResponse>('/api/habits', {
    query: computed(() => ({
      page: listPage.value,
      pageSize: listPageSize.value,
      search: listSearch.value || undefined,
      frequency: listFrequency.value || undefined,
      difficulty: listDifficulty.value || undefined,
      identityId: listIdentityId.value || undefined,
      archived: listArchived.value
    })),
    lazy: true,
    immediate: false,
    key: 'habits-list',
    watch: [listPage, listPageSize, listFrequency, listDifficulty, listIdentityId, listArchived]
  })

  const debouncedRefreshList = useDebounceFn(() => {
    refreshList()
  }, 300)

  watch(listSearch, () => {
    listPage.value = 1
    debouncedRefreshList()
  })

  // ─── Identities ─────────────────────────────────────────────────────────────
  const {
    data: identities,
    status: identitiesStatus,
    refresh: refreshIdentities
  } = useFetch<Identity[]>('/api/habits/identities', {
    lazy: true,
    immediate: false,
    key: 'habits-identities'
  })

  // ─── Tags ───────────────────────────────────────────────────────────────────
  const {
    data: tags,
    status: tagsStatus,
    refresh: refreshTags
  } = useFetch<HabitTag[]>('/api/habits/tags', {
    lazy: true,
    immediate: false,
    key: 'habits-tags'
  })

  // ─── Insights ───────────────────────────────────────────────────────────────
  const {
    data: insights,
    status: insightsStatus,
    refresh: refreshInsights
  } = useFetch<HabitInsights>('/api/habits/insights', {
    lazy: true,
    immediate: false,
    key: 'habits-insights'
  })

  // ─── Actions ────────────────────────────────────────────────────────────────

  async function createHabit(payload: CreateHabitPayload): Promise<Habit | null> {
    try {
      const habit = await $fetch<Habit>('/api/habits', {
        method: 'POST',
        body: payload
      })
      trackHabitsEvent(PostHogEvent.HabitCreated, {
        habit_id: habit.id,
        ...getHabitPayloadTrackingProperties(payload),
        ...getHabitTrackingProperties(habit)
      })
      toast.add({ title: 'Hábito criado', description: `"${habit.name}" adicionado com sucesso.`, color: 'success' })
      await Promise.all([refreshToday(), refreshList()])
      return habit
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível criar o hábito.', color: 'error' })
      return null
    }
  }

  async function updateHabit(id: string, payload: UpdateHabitPayload): Promise<Habit | null> {
    try {
      const habit = await $fetch<Habit>(`/api/habits/${id}`, {
        method: 'PUT',
        body: payload
      })
      trackHabitsEvent(PostHogEvent.HabitUpdated, {
        habit_id: habit.id,
        ...getHabitPayloadTrackingProperties(payload),
        ...getHabitTrackingProperties(habit)
      })
      toast.add({ title: 'Hábito atualizado', description: `"${habit.name}" salvo com sucesso.`, color: 'success' })
      await Promise.all([refreshToday(), refreshList()])
      return habit
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível atualizar o hábito.', color: 'error' })
      return null
    }
  }

  async function archiveHabit(id: string, name: string): Promise<boolean> {
    try {
      await $fetch(`/api/habits/${id}`, { method: 'DELETE' })
      trackHabitsEvent(PostHogEvent.HabitArchived, {
        habit_id: id
      })
      toast.add({ title: 'Hábito arquivado', description: `"${name}" foi arquivado.`, color: 'success' })
      await Promise.all([refreshToday(), refreshList()])
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível arquivar o hábito.', color: 'error' })
      return false
    }
  }

  async function restoreHabit(id: string): Promise<boolean> {
    try {
      await $fetch(`/api/habits/${id}/restore`, { method: 'POST' })
      trackHabitsEvent(PostHogEvent.HabitRestored, {
        habit_id: id
      })
      toast.add({ title: 'Hábito restaurado', description: 'O hábito foi restaurado com sucesso.', color: 'success' })
      await Promise.all([refreshToday(), refreshList()])
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível restaurar o hábito.', color: 'error' })
      return false
    }
  }

  async function logHabit(payload: LogHabitPayload): Promise<boolean> {
    const isCompleted = payload.status ? payload.status !== HabitLogStatus.Skipped : payload.completed
    const status: HabitLogStatus = payload.status ?? (payload.completed ? HabitLogStatus.Done : HabitLogStatus.Skipped)

    const habitIndex = todayData.value?.habits.findIndex(h => h.id === payload.habitId) ?? -1
    const previousHabit: TodayHabit | null
      = habitIndex >= 0 ? { ...todayData.value!.habits[habitIndex]! } : null
    const previousCompletedCount = todayData.value?.completedCount ?? 0

    if (habitIndex >= 0 && todayData.value && previousHabit) {
      const wasCompleted = previousHabit.log?.completed ?? false
      todayData.value.habits[habitIndex] = {
        ...previousHabit,
        log: {
          id: previousHabit.log?.id ?? '',
          userId: previousHabit.log?.userId ?? previousHabit.userId,
          habitId: payload.habitId,
          habitVersionId: previousHabit.log?.habitVersionId ?? '',
          logDate: payload.logDate,
          completed: payload.completed,
          status,
          note: payload.note ?? previousHabit.log?.note ?? null,
          createdAt: previousHabit.log?.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      }
      if (payload.completed !== wasCompleted) {
        todayData.value.completedCount += payload.completed ? 1 : -1
      }
    }

    try {
      await $fetch('/api/habits/log', {
        method: 'POST',
        body: { ...payload, tz: clientTimezone }
      })
      trackHabitsEvent(PostHogEvent.HabitLogged, {
        completed: isCompleted,
        habit_id: payload.habitId,
        has_note: Boolean(payload.note?.trim()),
        status
      })
      if (isCompleted) {
        toast.add({ title: 'Muito bem!', description: 'Você está construindo consistência.', color: 'success' })
      }
      await refreshToday()
      return true
    } catch (err: unknown) {
      if (habitIndex >= 0 && todayData.value && previousHabit) {
        todayData.value.habits[habitIndex] = previousHabit
        todayData.value.completedCount = previousCompletedCount
      }
      const message = (err as { data?: { statusMessage?: string } })?.data?.statusMessage
      toast.add({ title: 'Erro', description: message ?? 'Não foi possível registrar o hábito.', color: 'error' })
      return false
    }
  }

  async function createIdentity(payload: CreateIdentityPayload): Promise<Identity | null> {
    try {
      const identity = await $fetch<Identity>('/api/habits/identities', {
        method: 'POST',
        body: payload
      })
      trackHabitsEvent(PostHogEvent.HabitIdentityCreated, {
        has_description: Boolean(identity.description?.trim()),
        identity_id: identity.id
      })
      toast.add({ title: 'Identidade criada', description: `"${identity.name}" criada com sucesso.`, color: 'success' })
      await refreshIdentities()
      return identity
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível criar a identidade.', color: 'error' })
      return null
    }
  }

  async function archiveIdentity(id: string, name: string): Promise<boolean> {
    try {
      await $fetch(`/api/habits/identities/${id}`, { method: 'DELETE' })
      trackHabitsEvent(PostHogEvent.HabitIdentityArchived, {
        identity_id: id
      })
      toast.add({ title: 'Identidade arquivada', description: `"${name}" foi arquivada.`, color: 'success' })

      if (listIdentityId.value === id) {
        listIdentityId.value = ''
      }

      await Promise.all([refreshIdentities(), refreshList()])
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível arquivar a identidade.', color: 'error' })
      return false
    }
  }

  async function updateIdentity(id: string, payload: UpdateIdentityPayload): Promise<Identity | null> {
    try {
      const identity = await $fetch<Identity>(`/api/habits/identities/${id}`, {
        method: 'PUT',
        body: payload
      })
      trackHabitsEvent(PostHogEvent.HabitIdentityUpdated, {
        has_description: Boolean(identity.description?.trim()),
        identity_id: identity.id
      })
      toast.add({ title: 'Identidade atualizada', description: `"${identity.name}" salva com sucesso.`, color: 'success' })
      await Promise.all([refreshIdentities(), refreshList()])
      return identity
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível atualizar a identidade.', color: 'error' })
      return null
    }
  }

  async function createTag(payload: CreateHabitTagPayload): Promise<HabitTag | null> {
    try {
      const tag = await $fetch<HabitTag>('/api/habits/tags', {
        method: 'POST',
        body: payload
      })
      trackHabitsEvent(PostHogEvent.HabitTagCreated, {
        tag_id: tag.id
      })
      toast.add({ title: 'Tag criada', description: `"${tag.name}" criada com sucesso.`, color: 'success' })
      await refreshTags()
      return tag
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível criar a tag.', color: 'error' })
      return null
    }
  }

  async function deleteTag(id: string, name: string): Promise<boolean> {
    try {
      await $fetch(`/api/habits/tags/${id}`, { method: 'DELETE' })
      trackHabitsEvent(PostHogEvent.HabitTagDeleted, {
        tag_id: id
      })
      toast.add({ title: 'Tag excluída', description: `"${name}" foi excluída.`, color: 'success' })
      await Promise.all([refreshTags(), refreshList()])
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível excluir a tag.', color: 'error' })
      return false
    }
  }

  async function saveReflection(payload: CreateReflectionPayload): Promise<HabitReflection | null> {
    try {
      const reflection = await $fetch<HabitReflection>('/api/habits/reflections', {
        method: 'POST',
        body: payload
      })
      trackHabitsEvent(PostHogEvent.HabitReflectionSaved, {
        has_improvements: Boolean(payload.improvements?.trim()),
        has_wins: Boolean(payload.wins?.trim())
      })
      toast.add({ title: 'Reflexão salva', description: 'Sua revisão semanal foi salva.', color: 'success' })
      return reflection
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível salvar a reflexão.', color: 'error' })
      return null
    }
  }

  async function fetchCalendar(habitId: string, year: number, month: number): Promise<CalendarDay[]> {
    try {
      return await $fetch<CalendarDay[]>(`/api/habits/${habitId}/calendar`, {
        query: { year, month }
      })
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível carregar o calendário.', color: 'error' })
      return []
    }
  }

  async function fetchHabit(id: string): Promise<Habit | null> {
    try {
      return await $fetch<Habit>(`/api/habits/${id}`)
    } catch {
      toast.add({ title: 'Erro', description: 'Hábito não encontrado.', color: 'error' })
      return null
    }
  }

  async function fetchHistory(habitId: string, page = 1): Promise<HabitChangeHistory[]> {
    try {
      return await $fetch<HabitChangeHistory[]>(`/api/habits/${habitId}/history`, {
        query: { page, pageSize: 20 }
      })
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível carregar o histórico.', color: 'error' })
      return []
    }
  }

  // ─── Habit Stacks ─────────────────────────────────────────────────────────

  const {
    data: stacks,
    status: stacksStatus,
    refresh: refreshStacks
  } = useFetch<HabitStack[]>('/api/habits/stacks', {
    query: { tz: clientTimezone },
    lazy: true,
    immediate: false,
    key: 'habits-stacks'
  })

  /** Silently refresh stacks + today + list without resetting status to pending (avoids skeleton flash) */
  async function silentRefreshAfterStackChange(): Promise<void> {
    const promises: Promise<void>[] = []

    promises.push(
      $fetch<HabitStack[]>('/api/habits/stacks', { query: { tz: clientTimezone } }).then((data) => {
        stacks.value = data
      }).catch(() => {})
    )

    if (todayStatus.value === 'success') {
      promises.push(
        $fetch<TodayHabitsResponse>('/api/habits/today', { query: { date: todayDate.value, tz: clientTimezone } }).then((data) => {
          todayData.value = data
        }).catch(() => {})
      )
    }

    if (listStatus.value === 'success') {
      promises.push(
        $fetch<HabitListResponse>('/api/habits', {
          query: {
            page: listPage.value,
            pageSize: listPageSize.value,
            search: listSearch.value || undefined,
            frequency: listFrequency.value || undefined,
            difficulty: listDifficulty.value || undefined,
            identityId: listIdentityId.value || undefined,
            archived: listArchived.value
          }
        }).then((data) => {
          listData.value = data
        }).catch(() => {})
      )
    }

    await Promise.all(promises)
  }

  async function createStack(payload: CreateHabitStackPayload): Promise<HabitStack | null> {
    try {
      const stack = await $fetch<HabitStack>('/api/habits/stacks', {
        method: 'POST',
        body: payload
      })
      trackHabitsEvent(PostHogEvent.HabitStackCreated, {
        new_habit_id: stack.newHabitId,
        stack_id: stack.id,
        trigger_habit_id: stack.triggerHabitId
      })
      toast.add({ title: 'Empilhamento criado', description: 'Gatilho de hábito adicionado com sucesso.', color: 'success' })
      await silentRefreshAfterStackChange()
      return stack
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível criar o empilhamento.', color: 'error' })
      return null
    }
  }

  async function removeStack(id: string): Promise<boolean> {
    try {
      await $fetch(`/api/habits/stacks/${id}`, { method: 'DELETE' })
      trackHabitsEvent(PostHogEvent.HabitStackRemoved, {
        stack_id: id
      })
      toast.add({ title: 'Empilhamento removido', description: 'Gatilho removido com sucesso.', color: 'success' })
      await silentRefreshAfterStackChange()
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível remover o empilhamento.', color: 'error' })
      return false
    }
  }

  async function removeStacksByTrigger(triggerHabitId: string, habitName: string): Promise<boolean> {
    try {
      const result = await $fetch<{ success: boolean, removedCount: number }>(`/api/habits/stacks/trigger/${triggerHabitId}`, {
        method: 'DELETE'
      })
      trackHabitsEvent(PostHogEvent.HabitTriggerStacksRemoved, {
        removed_count: result.removedCount,
        trigger_habit_id: triggerHabitId
      })

      toast.add({
        title: 'Empilhamentos removidos',
        description: result.removedCount > 0
          ? `Os empilhamentos de "${habitName}" foram removidos.`
          : `"${habitName}" não tinha empilhamentos ativos.`,
        color: 'success'
      })

      await silentRefreshAfterStackChange()
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível remover os empilhamentos.', color: 'error' })
      return false
    }
  }

  async function syncHabitTree(nodes: HabitTreeSyncNode[]): Promise<boolean> {
    try {
      await $fetch('/api/habits/tree', {
        method: 'PUT',
        body: { nodes }
      })
      trackHabitsEvent(PostHogEvent.HabitTreeSynced, {
        max_depth: getTreeDepth(nodes),
        node_count: nodes.length
      })

      toast.add({
        title: 'Hábito atualizado',
        description: 'A ordem e os empilhamentos dos hábitos foram sincronizados.',
        color: 'success'
      })

      await silentRefreshAfterStackChange()
      return true
    } catch {
      toast.add({
        title: 'Erro',
        description: 'Não foi possível sincronizar a árvore de hábitos.',
        color: 'error'
      })
      return false
    }
  }

  // ─── Habit Settings ───────────────────────────────────────────────────────────

  async function fetchHabitSettings(): Promise<HabitUserSettings | null> {
    try {
      return await $fetch<HabitUserSettings>('/api/habits/settings')
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível carregar configurações.', color: 'error' })
      return null
    }
  }

  async function updateHabitSettings(payload: UpdateHabitUserSettingsPayload): Promise<HabitUserSettings | null> {
    try {
      const result = await $fetch<HabitUserSettings>('/api/habits/settings', {
        method: 'PUT',
        body: payload
      })
      trackHabitsEvent(PostHogEvent.HabitSettingsUpdated, {
        review_day: payload.reviewDay,
        review_reminder_enabled: payload.reviewReminderEnabled,
        share_enabled: payload.shareEnabled
      })
      toast.add({ title: 'Configurações salvas', description: 'Preferências de hábitos atualizadas.', color: 'success' })
      return result
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível salvar configurações.', color: 'error' })
      return null
    }
  }

  async function fetchSharedProgress(token: string): Promise<SharedHabitsProgress | null> {
    try {
      return await $fetch<SharedHabitsProgress>('/api/habits/share', {
        query: { token }
      })
    } catch {
      toast.add({ title: 'Erro', description: 'Link de compartilhamento inválido ou desativado.', color: 'error' })
      return null
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const frequencyOptions = [
    { label: 'Diário', value: HabitFrequency.Daily },
    { label: 'Semanal', value: HabitFrequency.Weekly },
    { label: 'Personalizado', value: HabitFrequency.Custom }
  ]

  const difficultyOptions = [
    { label: 'Pequeno', value: HabitDifficulty.Tiny },
    { label: 'Normal', value: HabitDifficulty.Normal },
    { label: 'Difícil', value: HabitDifficulty.Hard }
  ]

  const habitTypeOptions = [
    { label: 'Positivo', value: HabitType.Positive },
    { label: 'Negativo', value: HabitType.Negative }
  ]

  const dayOptions = [
    { label: 'Dom', value: 0 },
    { label: 'Seg', value: 1 },
    { label: 'Ter', value: 2 },
    { label: 'Qua', value: 3 },
    { label: 'Qui', value: 4 },
    { label: 'Sex', value: 5 },
    { label: 'Sáb', value: 6 }
  ]

  function getCurrentWeekKey(): string {
    const now = new Date()
    const oneJan = new Date(now.getFullYear(), 0, 1)
    const days = Math.floor((now.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000))
    const weekNumber = Math.ceil((days + oneJan.getDay() + 1) / 7)
    return `${now.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`
  }

  return {
    // Today
    todayData,
    todayStatus,
    todayDate,
    refreshToday,
    // List
    listData,
    listStatus,
    listPage,
    listPageSize,
    listSearch,
    listFrequency,
    listDifficulty,
    listIdentityId,
    listArchived,
    refreshList,
    // Identities
    identities,
    identitiesStatus,
    refreshIdentities,
    // Tags
    tags,
    tagsStatus,
    refreshTags,
    createTag,
    deleteTag,
    // Insights
    insights,
    insightsStatus,
    refreshInsights,
    // Actions
    createHabit,
    updateHabit,
    archiveHabit,
    restoreHabit,
    logHabit,
    createIdentity,
    updateIdentity,
    archiveIdentity,
    saveReflection,
    fetchCalendar,
    fetchHabit,
    fetchHistory,
    // Stacks
    stacks,
    stacksStatus,
    refreshStacks,
    createStack,
    removeStack,
    removeStacksByTrigger,
    syncHabitTree,
    // Settings & Share
    fetchHabitSettings,
    updateHabitSettings,
    fetchSharedProgress,
    // Helpers
    frequencyOptions,
    difficultyOptions,
    habitTypeOptions,
    dayOptions,
    getCurrentWeekKey
  }
}
