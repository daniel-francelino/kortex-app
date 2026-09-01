import type {
  OnboardingProfile,
  OnboardingResponse,
  OnboardingState
} from '~/types/onboarding'

function createDefaultOnboardingState(): OnboardingState {
  return {
    status: 'not_started',
    currentStep: 'welcome',
    startedAt: null,
    completedAt: null,
    profile: {
      primaryGoal: null,
      experienceLevel: null,
      guidanceStyle: null
    }
  }
}

type OnboardingStore = {
  loaded: boolean
  loading: boolean
  open: boolean
  onboarding: OnboardingState
  // `null` = never explicitly chosen (docs/timezone/ANALISE_TIMEZONE.md,
  // Regra 2) — consumers (FlowModal) fall back to the detected browser zone
  // for display, but must never treat `null` as "already UTC" when deciding
  // what to send back on save, or they'd lock that fallback in permanently.
  timezone: string | null
}

export function useOnboarding() {
  const state = useState<OnboardingStore>('user-onboarding', () => ({
    loaded: false,
    loading: false,
    open: false,
    onboarding: createDefaultOnboardingState(),
    timezone: null
  }))
  const pendingHabitHandoff = useState<boolean>('user-onboarding-habits-handoff', () => false)
  const requestFetch = useRequestFetch()
  const requestHeaders = import.meta.server ? useRequestHeaders(['cookie']) : undefined

  async function load(force = false) {
    if (state.value.loading)
      return

    if (state.value.loaded && !force)
      return

    state.value.loading = true

    try {
      const response = await requestFetch<OnboardingResponse>('/api/settings/onboarding', {
        headers: requestHeaders
      })

      state.value.onboarding = response.onboarding
      state.value.timezone = response.timezone
      state.value.loaded = true
    } catch {
      state.value.loaded = true
    } finally {
      state.value.loading = false
    }
  }

  async function saveProgress(payload: {
    currentStep?: OnboardingState['currentStep']
    profile?: Partial<OnboardingProfile>
    status?: OnboardingState['status']
    timezone?: string
    markCompleted?: boolean
  }) {
    const response = await $fetch<OnboardingResponse>('/api/settings/onboarding', {
      method: 'PUT',
      body: payload
    })

    state.value.onboarding = response.onboarding
    state.value.timezone = response.timezone
    state.value.loaded = true
    return response
  }

  function open() {
    state.value.open = true
  }

  function close() {
    state.value.open = false
  }

  async function continueLater(payload: {
    currentStep: OnboardingState['currentStep']
    profile?: Partial<OnboardingProfile>
    timezone?: string
  }) {
    await saveProgress({
      ...payload,
      status: 'in_progress'
    })
    close()
  }

  async function completeAndStartFirstHabit(payload: {
    profile?: Partial<OnboardingProfile>
    timezone?: string
  }) {
    await saveProgress({
      ...payload,
      currentStep: 'first_action',
      status: 'completed',
      markCompleted: true
    })
    pendingHabitHandoff.value = true
    close()
  }

  function consumeHabitHandoff() {
    const pending = pendingHabitHandoff.value
    pendingHabitHandoff.value = false
    return pending
  }

  const isCompleted = computed(
    () => state.value.onboarding.status === 'completed'
  )

  return {
    close,
    completeAndStartFirstHabit,
    consumeHabitHandoff,
    continueLater,
    isCompleted,
    load,
    open,
    pendingHabitHandoff: readonly(pendingHabitHandoff),
    saveProgress,
    state: readonly(state)
  }
}
