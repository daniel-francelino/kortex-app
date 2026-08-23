<script setup lang="ts">
import type { DriveStep, Driver } from 'driver.js'
import type { Habit, HabitReflection, HabitTreeSyncNode } from '~/types/habits'
import { GuidedTourKey } from '~/types/guided-tour'
import { HabitLogStatus } from '~/types/habits'

definePageMeta({
  layout: 'app'
})

useSeoMeta({
  title: 'Hábitos'
})

const {
  todayData,
  todayStatus,
  todayDate,
  refreshToday,
  listData,
  listStatus,
  listPage,
  refreshList,
  listSearch,
  listFrequency,
  listDifficulty,
  listPageSize,
  identitiesStatus,
  refreshIdentities,
  insights,
  insightsStatus,
  refreshInsights,
  logHabit,
  frequencyOptions,
  difficultyOptions,
  fetchHabit,
  getCurrentWeekKey,
  saveReflection,
  stacks,
  stacksStatus,
  refreshStacks,
  removeStacksByTrigger,
  removeStack,
  syncHabitTree,
  tagsStatus,
  refreshTags
} = useHabits()
const { setCompleted, startIfNeeded } = useGuidedTour()
const { consumeHabitHandoff, pendingHabitHandoff } = useOnboarding()

// ─── Active tab ───────────────────────────────────────────────────────────────
const activeTab = ref('today')

const tabs = [
  { label: 'Hoje', value: 'today', icon: 'i-lucide-sun' },
  { label: 'Todos', value: 'all', icon: 'i-lucide-list' },
  { label: 'Revisão', value: 'review', icon: 'i-lucide-notebook-pen' },
  { label: 'Insights', value: 'insights', icon: 'i-lucide-bar-chart-3' }
]

useMobileContextNav().registerMobileContextNav('habits', tabs, activeTab)

const todayDateKey = computed(
  () => todayDate.value ?? new Date().toISOString().split('T')[0]!
)

const isViewingHistoricalToday = computed(
  () => todayDateKey.value !== new Date().toISOString().split('T')[0]!
)

const todayStacks = computed(() => todayData.value?.stacks ?? [])

const detailStacks = computed(() => {
  if (activeTab.value === 'today') {
    return todayStacks.value
  }

  return stacks.value ?? []
})

function ensureLoaded(
  status: Ref<'idle' | 'pending' | 'success' | 'error'>,
  refresh: () => Promise<unknown>
) {
  if (status.value === 'idle') {
    void refresh()
  }
}

// Load insights when tab is selected
watch(
  activeTab,
  (tab) => {
    if (tab === 'today') {
      ensureLoaded(todayStatus, refreshToday)
      ensureLoaded(stacksStatus, refreshStacks)
    }

    if (tab === 'all') {
      ensureLoaded(listStatus, refreshList)
      ensureLoaded(stacksStatus, refreshStacks)
    }

    if (tab === 'review') {
      reviewWeekKey.value = reviewWeekKey.value || currentWeekKey.value
      loadReflection(reviewWeekKey.value)
      loadReflectionsList(true)
    }

    if (tab === 'insights') {
      ensureLoaded(insightsStatus, refreshInsights)
    }
  },
  { immediate: true }
)

// ─── Modals ───────────────────────────────────────────────────────────────────
const createModalOpen = ref(false)
const editModalOpen = ref(false)
const archiveModalOpen = ref(false)
const detailSlideoverOpen = ref(false)
const stackCreateModalOpen = ref(false)
const stackSourceHabit = ref<Habit | null>(null)
const selectedHabit = ref<Habit | null>(null)
const settingsModalOpen = ref(false)
const shareImageModalOpen = ref(false)
const shareImageHabit = ref<Habit | null>(null)

watch(createModalOpen, (open) => {
  if (open) {
    ensureLoaded(identitiesStatus, refreshIdentities)
    ensureLoaded(tagsStatus, refreshTags)
  }
})

watch(stackCreateModalOpen, (open) => {
  if (open) {
    ensureLoaded(listStatus, refreshList)
    ensureLoaded(stacksStatus, refreshStacks)
  }
})

const ALL_FILTER_VALUE = '__all__'

const listFrequencyModel = computed({
  get: () => listFrequency.value || ALL_FILTER_VALUE,
  set: (value: string) => {
    listFrequency.value = value === ALL_FILTER_VALUE ? '' : value
  }
})

const listDifficultyModel = computed({
  get: () => listDifficulty.value || ALL_FILTER_VALUE,
  set: (value: string) => {
    listDifficulty.value = value === ALL_FILTER_VALUE ? '' : value
  }
})

// ─── Today actions ────────────────────────────────────────────────────────────
async function onToggleHabit(habitId: string, completed: boolean) {
  const date = todayDate.value ?? new Date().toISOString().split('T')[0]!
  await logHabit({ habitId, logDate: date, completed })
  await refreshInsights()
}

async function onLogWithNote(
  habitId: string,
  status: HabitLogStatus,
  note: string
) {
  const date = todayDate.value ?? new Date().toISOString().split('T')[0]!
  const completed = status !== HabitLogStatus.Skipped
  await logHabit({ habitId, logDate: date, completed, note, status })
  await refreshInsights()
}

function onNavigateDate(direction: 'prev' | 'next') {
  const current = new Date(
    (todayDate.value ?? new Date().toISOString().split('T')[0]!) + 'T12:00:00'
  )
  current.setDate(current.getDate() + (direction === 'next' ? 1 : -1))
  todayDate.value = current.toISOString().split('T')[0]!
}

async function onSelectHabit(habitId: string) {
  if (activeTab.value === 'today') {
    const habit
      = todayData.value?.habits.find(item => item.id === habitId) ?? null

    if (habit) {
      selectedHabit.value = habit
      detailSlideoverOpen.value = true
      return
    }
  }

  const habit = await fetchHabit(habitId)
  if (habit) {
    selectedHabit.value = habit
    detailSlideoverOpen.value = true
  }
}

// ─── List actions ─────────────────────────────────────────────────────────────
function onEditHabit(habit: Habit) {
  selectedHabit.value = habit
  editModalOpen.value = true
  ensureLoaded(identitiesStatus, refreshIdentities)
  ensureLoaded(tagsStatus, refreshTags)
}

function onArchiveHabit(habit: Habit) {
  selectedHabit.value = habit
  archiveModalOpen.value = true
}

function onHabitArchived() {
  detailSlideoverOpen.value = false
  selectedHabit.value = null
}

// ─── Stacking actions ─────────────────────────────────────────────────────────
async function onRemoveStack(habit: Habit) {
  await removeStacksByTrigger(habit.id, habit.name)
}

async function onRemoveSingleStack(stackId: string) {
  await removeStack(stackId)
}

function onStackHabit(habit: Habit) {
  stackSourceHabit.value = habit
  stackCreateModalOpen.value = true
}

function onShareHabit(habit: Habit) {
  shareImageHabit.value = habit
  shareImageModalOpen.value = true
}

async function onSyncHabitTree(nodes: HabitTreeSyncNode[]) {
  await syncHabitTree(nodes)
}

// ─── Weekly Review ────────────────────────────────────────────────────────────
const currentReflection = ref<HabitReflection | null>(null)
const reflectionLoading = ref(false)

const currentWeekKey = computed(() => getCurrentWeekKey())
const reviewWeekKey = ref(currentWeekKey.value)

const reflectionsList = ref<HabitReflection[]>([])
const reflectionsListLoading = ref(false)
const reflectionsPage = ref(1)
const reflectionsPageSize = 12
const reflectionsHasMore = ref(true)

const reviewWeekOptions = computed(() => {
  const items: { label: string, value: string }[] = [
    {
      label: `Semana atual (${currentWeekKey.value})`,
      value: currentWeekKey.value
    }
  ]

  const seen = new Set<string>([currentWeekKey.value])
  for (const r of reflectionsList.value) {
    if (!r?.weekKey) continue
    if (seen.has(r.weekKey)) continue
    seen.add(r.weekKey)
    items.push({ label: `Semana ${r.weekKey}`, value: r.weekKey })
  }

  return items
})

const reviewEditable = computed(
  () => reviewWeekKey.value === currentWeekKey.value
)

/** Navigate week for review */
function navigateReviewWeek(direction: 'prev' | 'next') {
  const match = reviewWeekKey.value.match(/^(\d{4})-W(\d{2})$/)
  if (!match) return
  let year = parseInt(match[1]!)
  let week = parseInt(match[2]!)
  if (direction === 'prev') {
    week--
    if (week < 1) {
      year--
      week = 52
    }
  } else {
    week++
    if (week > 52) {
      year++
      week = 1
    }
  }
  reviewWeekKey.value = `${year}-W${String(week).padStart(2, '0')}`
}

async function loadReflectionsList(reset = false) {
  if (reflectionsListLoading.value) return
  reflectionsListLoading.value = true
  try {
    if (reset) {
      reflectionsPage.value = 1
      reflectionsHasMore.value = true
      reflectionsList.value = []
    }

    const data = await $fetch<HabitReflection[]>('/api/habits/reflections', {
      query: {
        page: reflectionsPage.value,
        pageSize: reflectionsPageSize
      }
    })

    const incoming = data ?? []
    const byWeek = new Map(
      reflectionsList.value.map(r => [r.weekKey, r] as const)
    )
    for (const r of incoming) {
      if (r?.weekKey) byWeek.set(r.weekKey, r)
    }
    reflectionsList.value = Array.from(byWeek.values()).sort((a, b) =>
      a.weekKey < b.weekKey ? 1 : -1
    )

    if (incoming.length < reflectionsPageSize) {
      reflectionsHasMore.value = false
    }
  } catch {
    reflectionsHasMore.value = false
  } finally {
    reflectionsListLoading.value = false
  }
}

async function onLoadMoreReflections() {
  if (!reflectionsHasMore.value) return
  reflectionsPage.value += 1
  await loadReflectionsList(false)
}

async function loadReflection(weekKey: string) {
  reflectionLoading.value = true
  try {
    const data = await $fetch<HabitReflection | null>(
      '/api/habits/reflections',
      {
        query: { weekKey }
      }
    )
    currentReflection.value = data
  } catch {
    currentReflection.value = null
  } finally {
    reflectionLoading.value = false
  }
}

async function onSaveWeeklyReview(payload: {
  weekKey: string
  wins?: string
  improvements?: string
}) {
  const result = await saveReflection(payload)
  if (result) {
    currentReflection.value = result
    await loadReflectionsList(true)
    return true
  }
  return false
}

watch(reviewWeekKey, async (wk) => {
  if (activeTab.value !== 'review') return
  await loadReflection(wk)
})

// ─── Filter options ───────────────────────────────────────────────────────────
const frequencyFilterOptions = computed(() => [
  { label: 'Todas', value: ALL_FILTER_VALUE },
  ...frequencyOptions
])

const difficultyFilterOptions = computed(() => [
  { label: 'Todas', value: ALL_FILTER_VALUE },
  ...difficultyOptions
])

let habitsTour: Driver | null = null
let firstHabitEntryTour: Driver | null = null
let isStartingTour = false

function getVisibleElement(selectors: string | string[]): HTMLElement {
  const selectorList = Array.isArray(selectors) ? selectors : [selectors]

  for (const selector of selectorList) {
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(selector)
    )
    const visible = elements.find(element => element.offsetParent !== null)

    if (visible) {
      return visible
    }
  }

  return document.body
}

function getHabitsTabElement(value: string): HTMLElement {
  const tabsRoot = document.querySelector('[data-tour="habits-tabs"]')
  if (!tabsRoot) {
    return document.body
  }

  const tabLabels: Record<string, string> = {
    today: 'Hoje',
    all: 'Todos',
    review: 'Revisão',
    insights: 'Insights'
  }

  return (
    Array.from(tabsRoot.querySelectorAll<HTMLElement>('[role="tab"]')).find(
      (tab) => {
        const tabValue = tab.getAttribute('data-value')
        const tabText = tab.textContent?.trim()

        return tabValue === value || tabText === tabLabels[value]
      }
    ) ?? document.body
  )
}

async function focusHabitsTab(value: string) {
  activeTab.value = value
  await nextTick()
}

function buildHabitsTourSteps(): DriveStep[] {
  return [
    {
      element: '[data-tour="habits-header-actions"]',
      popover: {
        title: 'Comece pelos atalhos principais',
        description:
          'Aqui você cria um novo hábito e acessa a gestão de identidades, que ajuda a organizar os hábitos pelo tipo de pessoa que você quer se tornar.',
        side: 'bottom',
        align: 'end',
        showButtons: ['next', 'close']
      }
    },
    {
      element: '[data-tour="habits-tabs"]',
      popover: {
        title: 'Navegue pelas áreas da tela',
        description:
          'Use estas abas para alternar entre o dia de hoje, a visão completa dos hábitos, a revisão semanal e os insights de consistência.',
        side: 'bottom',
        align: 'start'
      }
    },
    {
      element: () => getHabitsTabElement('today'),
      popover: {
        title: 'Hoje é a sua base operacional',
        description:
          'Nesta área você acompanha o progresso do dia, marca execuções e registra observações rápidas de cada hábito.',
        onNextClick: async (_element, _step, { driver }) => {
          await focusHabitsTab('all')
          driver.moveNext()
        }
      }
    },
    {
      element: () => getHabitsTabElement('all'),
      popover: {
        title: 'A visão completa ajuda a organizar',
        description:
          'Aqui você busca, filtra, edita, empilha hábitos e reorganiza a estrutura completa quando quiser revisar o sistema como um todo.',
        onNextClick: async (_element, _step, { driver }) => {
          await focusHabitsTab('review')
          driver.moveNext()
        },
        onPrevClick: async (_element, _step, { driver }) => {
          await focusHabitsTab('today')
          driver.movePrevious()
        }
      }
    },
    {
      element: () => getHabitsTabElement('review'),
      popover: {
        title: 'Revisão é onde você aprende com a semana',
        description:
          'Use esta aba para registrar vitórias, pontos de ajuste e consolidar o que funcionou antes de seguir para a próxima semana.',
        onNextClick: async (_element, _step, { driver }) => {
          await focusHabitsTab('insights')
          driver.moveNext()
        },
        onPrevClick: async (_element, _step, { driver }) => {
          await focusHabitsTab('all')
          driver.movePrevious()
        }
      }
    },
    {
      element: () => getHabitsTabElement('insights'),
      popover: {
        title: 'Insights mostram padrões de consistência',
        description:
          'Use esta área para entender desempenho, frequência, evolução por identidade e pontos de atenção da sua rotina.',
        doneBtnText: 'Concluir',
        showButtons: ['previous', 'next', 'close'],
        onPrevClick: async (_element, _step, { driver }) => {
          await focusHabitsTab('review')
          driver.movePrevious()
        }
      }
    }
  ]
}

function buildFirstHabitEntryTourSteps(): DriveStep[] {
  return [
    {
      element: () =>
        getVisibleElement([
          '[data-tour="habits-create-button-desktop"]',
          '[data-tour="habits-create-button-mobile"]'
        ]),
      popover: {
        title: 'Seu primeiro hábito começa aqui',
        description:
          'Clique neste botão para abrir o formulário e montar o primeiro hábito com nome, frequência, horário e as estratégias das 4 leis.',
        nextBtnText: 'Criar hábito',
        showButtons: ['next', 'close'],
        side: 'bottom',
        align: 'end',
        onNextClick: async (_element, _step, { driver }) => {
          await setCompleted(GuidedTourKey.HabitsFirstHabitEntry)
          createModalOpen.value = true
          driver.destroy()
        }
      }
    }
  ]
}

const hasAnyHabits = computed(() => {
  const todayCount = todayData.value?.totalCount ?? 0
  const listCount = listData.value?.total ?? 0

  return todayCount > 0 || listCount > 0
})

const shouldEnableFirstHabitCreateTour = computed(() => !hasAnyHabits.value)

async function startHabitsTours(options?: { preferFirstHabit?: boolean }) {
  if (isStartingTour) {
    return
  }

  isStartingTour = true
  const initialTab = activeTab.value

  try {
    await Promise.allSettled([refreshToday(), refreshList()])

    if (!hasAnyHabits.value) {
      firstHabitEntryTour = await startIfNeeded({
        key: GuidedTourKey.HabitsFirstHabitEntry,
        onDestroyed: () => {
          activeTab.value = initialTab
          firstHabitEntryTour = null
        },
        steps: buildFirstHabitEntryTourSteps()
      })
      return
    }

    if (options?.preferFirstHabit) {
      activeTab.value = 'today'
    }

    habitsTour = await startIfNeeded({
      key: GuidedTourKey.HabitsOverview,
      onDestroyed: () => {
        activeTab.value = initialTab
        habitsTour = null
      },
      steps: buildHabitsTourSteps()
    })
  } finally {
    isStartingTour = false
  }
}

watch(pendingHabitHandoff, async (pending) => {
  if (!pending) {
    return
  }

  consumeHabitHandoff()
  await startHabitsTours({ preferFirstHabit: true })
})

onMounted(async () => {
  const shouldPreferFirstHabit = consumeHabitHandoff()
  await startHabitsTours({
    preferFirstHabit: shouldPreferFirstHabit
  })
})

onBeforeUnmount(() => {
  habitsTour?.destroy()
  habitsTour = null
  firstHabitEntryTour?.destroy()
  firstHabitEntryTour = null
})
</script>

<template>
  <UDashboardPanel id="habits">
    <template #header>
      <UDashboardNavbar title="Hábitos">
        <template #leading>
          <AppSidebarCollapse />
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <NotificationsButton />
            <div
              data-tour="habits-header-actions"
              class="flex items-center gap-2"
            >
              <UButton
                to="/app/habits/identity"
                icon="i-lucide-users"
                label="Identidades"
                color="neutral"
                variant="subtle"
                class="hidden sm:inline-flex"
              />
              <UButton
                icon="i-lucide-plus"
                square
                data-tour="habits-create-button-mobile"
                class="flex sm:hidden items-center justify-center"
                @click="createModalOpen = true"
              />
              <UButton
                label="Novo hábito"
                icon="i-lucide-plus"
                data-tour="habits-create-button-desktop"
                class="hidden sm:inline-flex"
                @click="createModalOpen = true"
              />
            </div>
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6 pb-10 sm:pb-4">
        <!-- Tabs -->
        <div data-tour="habits-tabs" class="hidden lg:block">
          <UTabs
            :items="tabs"
            :model-value="activeTab"
            @update:model-value="activeTab = $event as string"
          />
        </div>

        <!-- TODAY TAB -->
        <div v-if="activeTab === 'today'" data-tour="habits-today-panel">
          <HabitsTodayList
            :habits="todayData?.habits ?? []"
            :stacks="todayStacks"
            :completed-count="todayData?.completedCount ?? 0"
            :total-count="todayData?.totalCount ?? 0"
            :loading="todayStatus === 'pending'"
            :current-date="todayDateKey"
            @toggle="onToggleHabit"
            @select="onSelectHabit"
            @log-with-note="onLogWithNote"
            @navigate-date="onNavigateDate"
          />
        </div>

        <!-- ALL HABITS TAB -->
        <div
          v-if="activeTab === 'all'"
          class="space-y-4"
          data-tour="habits-all-panel"
        >
          <!-- Filters -->
          <div class="flex flex-wrap items-center gap-2">
            <UInput
              v-model="listSearch"
              icon="i-lucide-search"
              placeholder="Buscar hábitos..."
              class="w-full sm:max-w-xs"
            />
            <USelect
              v-model="listFrequencyModel"
              :items="frequencyFilterOptions"
              value-key="value"
              placeholder="Frequência"
              class="min-w-0 flex-1 sm:min-w-32 sm:flex-none"
            />
            <USelect
              v-model="listDifficultyModel"
              :items="difficultyFilterOptions"
              value-key="value"
              placeholder="Dificuldade"
              class="min-w-0 flex-1 sm:min-w-32 sm:flex-none"
            />
          </div>

          <HabitsAllList
            :habits="listData?.data ?? []"
            :stacks="stacks ?? []"
            :total="listData?.total ?? 0"
            :page="listPage"
            :page-size="listPageSize"
            :loading="listStatus === 'pending'"
            @update:page="listPage = $event"
            @select="onSelectHabit"
            @edit="onEditHabit"
            @stack="onStackHabit"
            @share="onShareHabit"
            @remove-stacks="onRemoveStack"
            @archive="onArchiveHabit"
            @sync-tree="onSyncHabitTree"
          />
        </div>

        <!-- REVIEW TAB -->
        <div v-if="activeTab === 'review'">
          <!-- Week selector dropdown -->
          <div class="flex flex-wrap items-center gap-2 mb-4">
            <USelect
              v-model="reviewWeekKey"
              :items="reviewWeekOptions"
              value-key="value"
              class="min-w-56"
            />
            <UButton
              v-if="reflectionsHasMore"
              label="Carregar mais"
              icon="i-lucide-download"
              color="neutral"
              variant="subtle"
              size="sm"
              :loading="reflectionsListLoading"
              :disabled="reflectionsListLoading"
              @click="onLoadMoreReflections"
            />
            <div class="ml-auto">
              <UButton
                icon="i-lucide-settings"
                label="Configurações"
                color="neutral"
                variant="subtle"
                size="sm"
                @click="settingsModalOpen = true"
              />
            </div>
          </div>

          <HabitsWeeklyReview
            :week-key="reviewWeekKey"
            :existing-reflection="currentReflection"
            :editable="reviewEditable"
            :loading="reflectionLoading"
            :on-save="reviewEditable ? onSaveWeeklyReview : undefined"
            @navigate-week="navigateReviewWeek"
          />
        </div>

        <!-- INSIGHTS TAB -->
        <div v-if="activeTab === 'insights'" data-tour="habits-insights-panel">
          <HabitsInsightsPanel
            :insights="insights ?? null"
            :loading="insightsStatus === 'pending'"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Slideover first so modals render on top -->
  <HabitsDetailSlideover
    v-if="selectedHabit"
    :open="detailSlideoverOpen"
    :habit="selectedHabit"
    :stacks="detailStacks"
    :stack-actions-disabled="activeTab === 'today' && isViewingHistoricalToday"
    @update:open="detailSlideoverOpen = $event"
    @edit="editModalOpen = true"
    @stack="onStackHabit(selectedHabit)"
    @share="
      shareImageModalOpen = true;
      shareImageHabit = selectedHabit;
    "
    @remove-stack="onRemoveSingleStack"
    @remove-stacks="onRemoveStack(selectedHabit)"
    @archive="archiveModalOpen = true"
  />

  <!-- Modals -->
  <HabitsCreateModal
    :open="createModalOpen"
    :guided-tour-enabled="shouldEnableFirstHabitCreateTour"
    @update:open="createModalOpen = $event"
  />

  <HabitsShareImageModal
    :open="shareImageModalOpen"
    :habit="shareImageHabit"
    @update:open="shareImageModalOpen = $event"
  />

  <HabitsEditModal
    v-if="selectedHabit"
    :open="editModalOpen"
    :habit="selectedHabit"
    @update:open="editModalOpen = $event"
    @updated="refreshToday()"
  />

  <HabitsArchiveModal
    v-if="selectedHabit"
    :open="archiveModalOpen"
    :habit-id="selectedHabit.id"
    :habit-name="selectedHabit.name"
    @update:open="archiveModalOpen = $event"
    @archived="onHabitArchived"
  />
  <HabitsStackCreateModal
    :open="stackCreateModalOpen"
    :habits="listData?.data ?? []"
    :initial-trigger-habit-id="stackSourceHabit?.id"
    :initial-trigger-habit-name="stackSourceHabit?.name"
    @update:open="
      (value: boolean) => {
        stackCreateModalOpen = value;
        if (!value) stackSourceHabit = null;
      }
    "
    @created="() => {}"
  />

  <HabitsSettingsModal
    :open="settingsModalOpen"
    @update:open="settingsModalOpen = $event"
  />
</template>

<!--
  TO DO

  ========================
   🏷️ Organização / Estrutura
  ========================

  - Adicionar suporte a tags nos hábitos.
    Isso permitirá melhor organização, categorização e filtragem.

  ========================
  🚀 Onboarding
  ========================

  - Validar e pesquisar para exibir da melhor forma o Onboarding
  - Agora preciso entender do onboarding para novos usuários, basicmaente,  ele preencher as informações que precisa, tipo entender o público, também explicar um pouco osbre
    1 Welcome
    2 Entender perfil do usuário
    3 Configuração mínima
    4 Product tour
    5 Primeira ação
  Tempo total ideal: menos de 2 minutos

---

## 📅 Revisão

- Implementar **notificação para lembrar o usuário de realizar a revisão**.

---

## 📱 Mobile / Responsividade

- Ajustar a interface de **hábitos no mobile**:
  - Falta espaço para empilhamento adequado dos itens.

---

## 🔔 Notificações

### OneSignal

- Implementar **In-App Messaging** utilizando OneSignal.

- Criar **integração no backend para envio de notificações** via API.

Documentação:

https://documentation.onesignal.com/reference/rest-api-overview

---

## 🌍 Localização / Preferências

- A aplicação deve respeitar as **preferências de timezone do usuário**.

- A formatação de datas deve considerar:
  - timezone definido pelo usuário nas preferências
  - ou idioma/configuração do navegador.

- Quando é mobile, se estiver em uma rota publica, deve ir para a rota de login, e se estiver logado, deve ir para a rota de hábitos.
- Notificações de hábitos na api e notificação de revisão semanal.
- Na api deve marcar como "freeze" os hábitos do dia anterior, quando no dia antecessor tiver marcação.


----

- Quando marcar um hábito como feito, o carregamento deve ser por debaixo dos panos, sem bloquear a interface.
- Também demora para marcar porque está esperando a resposta para atualizar, deve já marcar, se der erro desmarca e avisa.
- Em Todos, pode remover a possibidade de esconder, nã otem necessidade.
- Tem que resetar o modal quando fechar, porque quando abre de novo, tem os dados antigos lá, e isso pode confundir, principalmente se for um hábito diferente.
- Deve ficar desabilitado os inputs quando clicko em salvar, para evitar que o usuário altere algo que não vá fazer efeito.
- Em Metas, na listagem, seria uma boa exibir os hábitos que estão vinculados a meta.
- Em Hábitos, na listagem, encontrar uma forma de agrupar por meta, ou pelo menos exibir um indicador de quais hábitos estão vinculados a metas.
- Permitir todos os emojis, categorizados por tipo, para usar como ícones dos hábitos. Talvez usar uma biblioteca de emojis pronta, para facilitar a busca e a navegação.
- Um Hábito só pode estar vinculado com uma meta.
- Exibir como se estivesse excluido o hábito vinculado a meta, quando o hábito for excluído.
- Revisar os Detalhes de Hábito.
- Remover o Btn de Empilhar, já que o gerenciamento está como Drag & Drop.
- Nos select que tem hábitos, deve exibir em ordem alfabética, para facilitar a busca.
- Criar um Select com busca, para facilitar a busca.
- Em Todos, com exceção dos empilhamento, o primeiro nível tem que estar em ordem alfabética, para facilitar a busca, e os subníveis podem ser organizados por drag & drop, para manter a flexibilidade de organização.
- Revisão semanal deve usar o mesmo editor de texto rico para as anotações, que tem na criação e edição de hábitos, para manter a consistência e permitir formatação nas anotações.
- Quando crio uma meta não está exibindo na hora, tenho que dar reload na tela.
- Posso ter metas com data de inicio e data de fim.
- Posso ter uma meta sem data de conclusão, por exemplo, "Priorizar minha saúde física"
- Progresso deve ser revisto, em Meta, para considerar mais fatores, como data, hábitos, e outras coisas.
- Ta com Bug na paginação em Todos, no Hábitos, provavelmente porque o endpoint traz separado os dados.

-->
