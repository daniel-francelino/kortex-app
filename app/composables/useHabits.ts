import { createSharedComposable, useDebounceFn } from '@vueuse/core'
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

// Nuxt 4 defaults useFetch/useAsyncData's `data` ref to shallow (was deep in
// Nuxt 3) — mutating a nested property (`todayData.value.habits[i] = x`,
// `todayData.value.habits = [...]`) triggers NO reactivity at all, only
// reassigning `.value` itself does. Every optimistic mutation below must
// therefore rebuild a brand-new top-level object for `todayData`/`listData`
// rather than touching their nested arrays in place — this helper is the
// "replace one item, new array" building block for that.
// See docs/habits/OPTIMISTIC_UPDATES.md §7 for the full incident writeup —
// this is what made marking a habit done show a success toast but never
// visually update until a hard refresh.
function replaceAt<T>(list: T[], index: number, value: T): T[] {
  return list.map((item, i) => (i === index ? value : item))
}

// Shape of POST /api/habits/log's response — the raw `habit_logs` row
// (snake_case, straight from Supabase) plus the recalculated streak, used by
// logHabit()'s reconcile step (see docs/habits/OPTIMISTIC_UPDATES.md).
interface HabitLogResult {
  id: string
  user_id: string
  habit_id: string
  habit_version_id: string
  log_date: string
  completed: boolean
  status: string
  note: string | null
  created_at: string
  updated_at: string
  streak: { currentStreak: number, longestStreak: number, status: 'active' | 'frozen' } | null
}

// Singleton — shared across every component that calls useHabits(), same
// idea as useAppointments.ts's createSharedComposable(_useAppointments).
// Without this, each modal (CreateModal/EditModal/ArchiveModal/...) got its
// own private todayData/listData: an optimistic edit applied inside one of
// them mutated a copy nothing on screen was reading from, so index.vue
// (the page that actually renders the list) only ever saw the change once
// its own explicit refresh call landed — the optimistic update was correct
// but invisible until then. It also means the offline-sync drain loop
// (onReconnect/onMounted below) now only ever gets wired up once, for real,
// instead of needing the manual "only register once" flag this used to have.
function _useHabits() {
  const toast = useToast()
  const { capture } = usePostHog()
  const { runOptimisticAction } = useOptimisticAction()

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
      // Whether the new habit is due *today* depends on frequency/day-of-week
      // logic the server already resolved — not worth re-deriving client-side
      // just to fabricate an optimistic insert into todayData. A silent
      // refresh (writes straight into .value, doesn't touch todayStatus/
      // listStatus) still avoids the list-wide skeleton flash this pass is
      // about — see silentRefreshAfterStackChange below.
      void silentRefreshAfterStackChange()
      return habit
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível criar o hábito.', color: 'error' })
      return null
    }
  }

  async function updateHabit(id: string, payload: UpdateHabitPayload): Promise<Habit | null> {
    const todayIndex = todayData.value?.habits.findIndex(h => h.id === id) ?? -1
    const listIndex = listData.value?.data.findIndex(h => h.id === id) ?? -1
    const previousToday = todayIndex >= 0 ? todayData.value!.habits[todayIndex]! : null
    const previousList = listIndex >= 0 ? listData.value!.data[listIndex]! : null
    const base = previousToday ?? previousList

    const resolvedIdentity = payload.identityId !== undefined
      ? (payload.identityId ? (identities.value ?? []).find(i => i.id === payload.identityId) ?? base?.identity ?? null : null)
      : undefined
    const resolvedTags = payload.tagIds !== undefined
      ? (tags.value ?? []).filter(t => payload.tagIds!.includes(t.id))
      : undefined

    function applyPatch<T extends Habit>(habit: T): T {
      return {
        ...habit,
        ...payload,
        identity: resolvedIdentity !== undefined ? resolvedIdentity : habit.identity,
        tags: resolvedTags !== undefined ? resolvedTags : habit.tags,
        updatedAt: new Date().toISOString()
      }
    }

    const result = await runOptimisticAction<Habit>({
      apply: () => {
        if (todayIndex >= 0 && todayData.value) {
          todayData.value = { ...todayData.value, habits: replaceAt(todayData.value.habits, todayIndex, applyPatch(todayData.value.habits[todayIndex]!)) }
        }
        if (listIndex >= 0 && listData.value) {
          listData.value = { ...listData.value, data: replaceAt(listData.value.data, listIndex, applyPatch(listData.value.data[listIndex]!)) }
        }
      },
      rollback: () => {
        if (todayIndex >= 0 && todayData.value && previousToday) {
          todayData.value = { ...todayData.value, habits: replaceAt(todayData.value.habits, todayIndex, previousToday) }
        }
        if (listIndex >= 0 && listData.value && previousList) {
          listData.value = { ...listData.value, data: replaceAt(listData.value.data, listIndex, previousList) }
        }
      },
      request: () => $fetch<Habit>(`/api/habits/${id}`, { method: 'PUT', body: payload }),
      reconcile: (habit) => {
        const idxToday = todayData.value?.habits.findIndex(h => h.id === id) ?? -1
        const idxList = listData.value?.data.findIndex(h => h.id === id) ?? -1
        if (idxToday >= 0 && todayData.value) {
          todayData.value = { ...todayData.value, habits: replaceAt(todayData.value.habits, idxToday, { ...todayData.value.habits[idxToday], ...habit }) }
        }
        if (idxList >= 0 && listData.value) {
          listData.value = { ...listData.value, data: replaceAt(listData.value.data, idxList, habit) }
        }
      },
      errorMessage: 'Não foi possível atualizar o hábito'
    })

    if (result) {
      trackHabitsEvent(PostHogEvent.HabitUpdated, {
        habit_id: result.id,
        ...getHabitPayloadTrackingProperties(payload),
        ...getHabitTrackingProperties(result)
      })
      toast.add({ title: 'Hábito atualizado', description: `"${result.name}" salvo com sucesso.`, color: 'success' })
    }
    return result
  }

  async function archiveHabit(id: string, name: string): Promise<boolean> {
    const todayIndex = todayData.value?.habits.findIndex(h => h.id === id) ?? -1
    const listIndex = listData.value?.data.findIndex(h => h.id === id) ?? -1
    const previousTodayHabit = todayIndex >= 0 ? todayData.value!.habits[todayIndex]! : null
    const previousListHabit = listIndex >= 0 ? listData.value!.data[listIndex]! : null
    const previousCompletedCount = todayData.value?.completedCount ?? 0
    const previousTodayTotal = todayData.value?.totalCount ?? 0
    const previousListTotal = listData.value?.total ?? 0

    const result = await runOptimisticAction<unknown>({
      apply: () => {
        if (previousTodayHabit && todayData.value) {
          todayData.value = {
            ...todayData.value,
            habits: todayData.value.habits.filter(h => h.id !== id),
            totalCount: Math.max(0, todayData.value.totalCount - 1),
            completedCount: previousTodayHabit.log?.completed
              ? Math.max(0, todayData.value.completedCount - 1)
              : todayData.value.completedCount
          }
        }
        // Archived habits don't belong in the active list — only strip it
        // out here if that's actually the view currently loaded.
        if (previousListHabit && listData.value && !listArchived.value) {
          listData.value = {
            ...listData.value,
            data: listData.value.data.filter(h => h.id !== id),
            total: Math.max(0, listData.value.total - 1)
          }
        }
      },
      rollback: () => {
        if (previousTodayHabit && todayData.value) {
          todayData.value = {
            ...todayData.value,
            habits: [...todayData.value.habits, previousTodayHabit],
            totalCount: previousTodayTotal,
            completedCount: previousCompletedCount
          }
        }
        if (previousListHabit && listData.value) {
          listData.value = {
            ...listData.value,
            data: [...listData.value.data, previousListHabit],
            total: previousListTotal
          }
        }
      },
      request: () => $fetch(`/api/habits/${id}`, { method: 'DELETE' }),
      errorMessage: 'Não foi possível arquivar o hábito'
    })

    if (result !== null) {
      trackHabitsEvent(PostHogEvent.HabitArchived, { habit_id: id })
      toast.add({ title: 'Hábito arquivado', description: `"${name}" foi arquivado.`, color: 'success' })
    }
    return result !== null
  }

  async function restoreHabit(id: string): Promise<boolean> {
    // Only ever called from the archived view (listArchived === true) — the
    // item stops belonging there the moment it's restored.
    const listIndex = listData.value?.data.findIndex(h => h.id === id) ?? -1
    const previousListHabit = listIndex >= 0 ? listData.value!.data[listIndex]! : null
    const previousListTotal = listData.value?.total ?? 0

    const result = await runOptimisticAction<unknown>({
      apply: () => {
        if (previousListHabit && listData.value && listArchived.value) {
          listData.value = {
            ...listData.value,
            data: listData.value.data.filter(h => h.id !== id),
            total: Math.max(0, listData.value.total - 1)
          }
        }
      },
      rollback: () => {
        if (previousListHabit && listData.value) {
          listData.value = {
            ...listData.value,
            data: [...listData.value.data, previousListHabit],
            total: previousListTotal
          }
        }
      },
      request: () => $fetch(`/api/habits/${id}/restore`, { method: 'POST' }),
      errorMessage: 'Não foi possível restaurar o hábito'
    })

    if (result !== null) {
      trackHabitsEvent(PostHogEvent.HabitRestored, { habit_id: id })
      toast.add({ title: 'Hábito restaurado', description: 'O hábito foi restaurado com sucesso.', color: 'success' })
      // The restored habit may be due today — no reliable way to know that
      // client-side, so a silent background refresh picks it back up in the
      // today list without flashing a skeleton over everything else.
      void silentRefreshAfterStackChange()
    }
    return result !== null
  }

  async function logHabit(payload: LogHabitPayload): Promise<boolean> {
    const isCompleted = payload.status ? payload.status !== HabitLogStatus.Skipped : payload.completed
    const status: HabitLogStatus = payload.status ?? (payload.completed ? HabitLogStatus.Done : HabitLogStatus.Skipped)

    const habitIndex = todayData.value?.habits.findIndex(h => h.id === payload.habitId) ?? -1
    const previousHabit: TodayHabit | null
      = habitIndex >= 0 ? { ...todayData.value!.habits[habitIndex]! } : null
    const previousCompletedCount = todayData.value?.completedCount ?? 0

    if (habitIndex < 0 || !todayData.value || !previousHabit) return false

    const wasCompleted = previousHabit.log?.completed ?? false
    const optimisticLog = {
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

    const result = await runOptimisticAction<HabitLogResult>({
      apply: () => {
        todayData.value = {
          ...todayData.value!,
          habits: replaceAt(todayData.value!.habits, habitIndex, { ...previousHabit, log: optimisticLog }),
          completedCount: payload.completed !== wasCompleted
            ? todayData.value!.completedCount + (payload.completed ? 1 : -1)
            : todayData.value!.completedCount
        }
      },
      rollback: () => {
        todayData.value = {
          ...todayData.value!,
          habits: replaceAt(todayData.value!.habits, habitIndex, previousHabit),
          completedCount: previousCompletedCount
        }
      },
      request: () => $fetch<HabitLogResult>('/api/habits/log', {
        method: 'POST',
        body: { ...payload, tz: clientTimezone }
      }),
      // Merges back only what the client couldn't have computed itself — the
      // recalculated streak — instead of the old unconditional refreshToday()
      // that swapped the whole list for a loading skeleton on every mark
      // (see docs/habits/OPTIMISTIC_UPDATES.md).
      reconcile: (serverResult) => {
        const idx = todayData.value?.habits.findIndex(h => h.id === payload.habitId) ?? -1
        if (idx < 0 || !todayData.value) return
        const current = todayData.value.habits[idx]!
        const reconciled: TodayHabit = {
          ...current,
          log: {
            ...optimisticLog,
            id: serverResult.id,
            habitVersionId: serverResult.habit_version_id
          },
          streak: serverResult.streak
            ? {
                habitId: payload.habitId,
                userId: previousHabit.userId,
                currentStreak: serverResult.streak.currentStreak,
                longestStreak: serverResult.streak.longestStreak,
                status: serverResult.streak.status,
                lastCompletedDate: current.streak?.lastCompletedDate ?? null,
                updatedAt: optimisticLog.updatedAt
              }
            : current.streak
        }
        todayData.value = { ...todayData.value, habits: replaceAt(todayData.value.habits, idx, reconciled) }
      },
      errorMessage: 'Não foi possível registrar o hábito',
      offline: {
        entity: 'habit_log',
        // Deliberately 'create', not 'update': useMutationQueue's enqueue()
        // coalesces consecutive 'update' entries that share the same entity
        // + url into one, merging their bodies — fine for e.g. events, whose
        // url embeds the specific id being edited, but /api/habits/log is
        // the *same* url for every habit (the habitId travels in the body).
        // Marking habit A then habit B offline under 'update' would merge
        // both bodies into a single queued mutation and silently drop one.
        // 'create' skips that merge branch entirely, so each log action
        // queues as its own independent entry.
        action: 'create',
        method: 'POST',
        url: '/api/habits/log',
        body: { ...payload, tz: clientTimezone },
        // Upserted server-side on (habit_id, log_date) — log.post.ts:94 — so
        // replaying this once connectivity returns is naturally idempotent,
        // no tempId reconciliation needed the way event/note creates do.
        // Field names match the server's raw (snake_case) row shape, not
        // the camelCase `optimisticLog` used for the local store above.
        optimisticResult: {
          id: optimisticLog.id,
          user_id: optimisticLog.userId,
          habit_id: optimisticLog.habitId,
          habit_version_id: optimisticLog.habitVersionId,
          log_date: optimisticLog.logDate,
          completed: optimisticLog.completed,
          status: optimisticLog.status,
          note: optimisticLog.note,
          created_at: optimisticLog.createdAt,
          updated_at: optimisticLog.updatedAt,
          streak: null
        }
      }
    })

    if (result) {
      trackHabitsEvent(PostHogEvent.HabitLogged, {
        completed: isCompleted,
        habit_id: payload.habitId,
        has_note: Boolean(payload.note?.trim()),
        status
      })
      if (isCompleted) {
        toast.add({ title: 'Muito bem!', description: 'Você está construindo consistência.', color: 'success' })
      }
    }
    return result !== null
  }

  async function createIdentity(payload: CreateIdentityPayload): Promise<Identity | null> {
    const tempId = `temp-${crypto.randomUUID()}`
    const now = new Date().toISOString()
    const optimisticIdentity: Identity = {
      id: tempId,
      userId: '',
      name: payload.name,
      description: payload.description ?? null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null
    }

    const result = await runOptimisticAction<Identity>({
      apply: () => {
        identities.value = [...(identities.value ?? []), optimisticIdentity]
      },
      rollback: () => {
        identities.value = (identities.value ?? []).filter(i => i.id !== tempId)
      },
      request: () => $fetch<Identity>('/api/habits/identities', { method: 'POST', body: payload }),
      reconcile: (identity) => {
        identities.value = (identities.value ?? []).map(i => i.id === tempId ? identity : i)
      },
      errorMessage: 'Não foi possível criar a identidade'
    })

    if (result) {
      trackHabitsEvent(PostHogEvent.HabitIdentityCreated, {
        has_description: Boolean(result.description?.trim()),
        identity_id: result.id
      })
      toast.add({ title: 'Identidade criada', description: `"${result.name}" criada com sucesso.`, color: 'success' })
    }
    return result
  }

  async function archiveIdentity(id: string, name: string): Promise<boolean> {
    const previous = (identities.value ?? []).find(i => i.id === id) ?? null
    const previousListIdentityFilter = listIdentityId.value

    const result = await runOptimisticAction<unknown>({
      apply: () => {
        identities.value = (identities.value ?? []).filter(i => i.id !== id)
        if (listIdentityId.value === id) listIdentityId.value = ''
      },
      rollback: () => {
        if (previous) identities.value = [...(identities.value ?? []), previous]
        listIdentityId.value = previousListIdentityFilter
      },
      request: () => $fetch(`/api/habits/identities/${id}`, { method: 'DELETE' }),
      errorMessage: 'Não foi possível arquivar a identidade'
    })

    if (result !== null) {
      trackHabitsEvent(PostHogEvent.HabitIdentityArchived, { identity_id: id })
      toast.add({ title: 'Identidade arquivada', description: `"${name}" foi arquivada.`, color: 'success' })
      // Habits shown elsewhere may still reference this identity — a silent
      // background refresh (not refreshList(), which flips status and
      // flashes the skeleton) keeps them in sync.
      void silentRefreshAfterStackChange()
    }
    return result !== null
  }

  async function updateIdentity(id: string, payload: UpdateIdentityPayload): Promise<Identity | null> {
    const previous = (identities.value ?? []).find(i => i.id === id) ?? null
    if (!previous) return null

    const optimistic: Identity = { ...previous, ...payload, updatedAt: new Date().toISOString() }

    const result = await runOptimisticAction<Identity>({
      apply: () => {
        identities.value = (identities.value ?? []).map(i => i.id === id ? optimistic : i)
      },
      rollback: () => {
        identities.value = (identities.value ?? []).map(i => i.id === id ? previous : i)
      },
      request: () => $fetch<Identity>(`/api/habits/identities/${id}`, { method: 'PUT', body: payload }),
      reconcile: (identity) => {
        identities.value = (identities.value ?? []).map(i => i.id === id ? identity : i)
      },
      errorMessage: 'Não foi possível atualizar a identidade'
    })

    if (result) {
      trackHabitsEvent(PostHogEvent.HabitIdentityUpdated, {
        has_description: Boolean(result.description?.trim()),
        identity_id: result.id
      })
      toast.add({ title: 'Identidade atualizada', description: `"${result.name}" salva com sucesso.`, color: 'success' })
      void silentRefreshAfterStackChange()
    }
    return result
  }

  async function createTag(payload: CreateHabitTagPayload): Promise<HabitTag | null> {
    const tempId = `temp-${crypto.randomUUID()}`
    const now = new Date().toISOString()
    const optimisticTag: HabitTag = {
      id: tempId,
      userId: '',
      name: payload.name,
      color: payload.color ?? '#6366f1',
      createdAt: now,
      updatedAt: now
    }

    const result = await runOptimisticAction<HabitTag>({
      apply: () => {
        tags.value = [...(tags.value ?? []), optimisticTag]
      },
      rollback: () => {
        tags.value = (tags.value ?? []).filter(t => t.id !== tempId)
      },
      request: () => $fetch<HabitTag>('/api/habits/tags', { method: 'POST', body: payload }),
      reconcile: (tag) => {
        tags.value = (tags.value ?? []).map(t => t.id === tempId ? tag : t)
      },
      errorMessage: 'Não foi possível criar a tag'
    })

    if (result) {
      trackHabitsEvent(PostHogEvent.HabitTagCreated, { tag_id: result.id })
      toast.add({ title: 'Tag criada', description: `"${result.name}" criada com sucesso.`, color: 'success' })
    }
    return result
  }

  async function deleteTag(id: string, name: string): Promise<boolean> {
    const previous = (tags.value ?? []).find(t => t.id === id) ?? null

    const result = await runOptimisticAction<unknown>({
      apply: () => {
        tags.value = (tags.value ?? []).filter(t => t.id !== id)
      },
      rollback: () => {
        if (previous) tags.value = [...(tags.value ?? []), previous]
      },
      request: () => $fetch(`/api/habits/tags/${id}`, { method: 'DELETE' }),
      errorMessage: 'Não foi possível excluir a tag'
    })

    if (result !== null) {
      trackHabitsEvent(PostHogEvent.HabitTagDeleted, { tag_id: id })
      toast.add({ title: 'Tag excluída', description: `"${name}" foi excluída.`, color: 'success' })
      // Habits shown elsewhere may still reference this tag.
      void silentRefreshAfterStackChange()
    }
    return result !== null
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

  // ─── Offline sync (habit_log only) ──────────────────────────────────────
  // Same shape as useAppointments.ts's drain loop — replays whatever
  // logHabit() queued while offline (see the `offline:` block above).
  const { pendingMutations, pendingCount: pendingSyncCount, dequeue: dequeueMutation, markRetry, ensureLoaded: ensureQueueLoaded } = useMutationQueue()
  const { isOnline, onReconnect } = useConnectionStatus()
  const syncingOffline = ref(false)
  const MAX_MUTATION_RETRIES = 5

  async function drainMutationQueue(): Promise<void> {
    if (syncingOffline.value) return
    await ensureQueueLoaded()
    const relevant = pendingMutations.value.filter(m => m.entity === 'habit_log')
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
            console.error('[offline-sync] habit log mutation permanently failed, dropping', mutation, err)
            await dequeueMutation(mutation.id)
            permanentFailureCount++
          } else {
            console.error('[offline-sync] habit log mutation failed, will retry', mutation, err)
            await markRetry(mutation.id)
          }
        }
      }
    } finally {
      syncingOffline.value = false
      if (replayedAny) {
        await refreshToday()
        toast.add({ title: 'Sincronizado', description: 'Seus hábitos marcados offline foram salvos.', color: 'success' })
      }
      if (permanentFailureCount > 0) {
        await refreshToday()
        toast.add({
          title: 'Não foi possível sincronizar',
          description: `${permanentFailureCount} marcação(ões) de hábito não puderam ser salvas e foram descartadas.`,
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
    // Offline sync
    isOnline,
    pendingSyncCount,
    syncingOffline: readonly(syncingOffline),
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

export const useHabits = createSharedComposable(_useHabits)
