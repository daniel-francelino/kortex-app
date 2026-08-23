<script setup lang="ts">
import type { Goal } from '~/types/goals'

definePageMeta({
  layout: 'app'
})

useSeoMeta({
  title: 'Metas'
})

const {
  listData,
  listFetchStatus,
  listPage,
  listPageSize,
  listSearch,
  listStatus,
  listTimeCategory,
  listLifeCategory,
  refreshList,
  completeGoal,
  restoreGoal,
  fetchGoal,
  timeCategoryOptions,
  lifeCategoryOptions,
  statusOptions,
  insights,
  insightsStatus,
  refreshInsights
} = useGoals()

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const activeTab = ref('list')
const tabs = [
  { label: 'Lista', value: 'list', icon: 'i-lucide-list' },
  { label: 'Insights', value: 'insights', icon: 'i-lucide-bar-chart-3' }
]

function ensureLoaded(status: Ref<'idle' | 'pending' | 'success' | 'error'>, refresh: () => Promise<unknown>) {
  if (status.value === 'idle') void refresh()
}

watch(activeTab, (tab) => {
  if (tab === 'insights') ensureLoaded(insightsStatus, refreshInsights)
})

// ─── Modals ───────────────────────────────────────────────────────────────────
const createModalOpen = ref(false)
const editModalOpen = ref(false)
const archiveModalOpen = ref(false)
const detailSlideoverOpen = ref(false)
const selectedGoal = ref<Goal | null>(null)
const createHabitModalOpen = ref(false)
const createHabitGoalId = ref<string | undefined>(undefined)
const detailSlideoverRef = ref<{ reload: () => Promise<void> } | null>(null)

const ALL_FILTER_VALUE = '__all__'

const listTimeCategoryModel = computed({
  get: () => listTimeCategory.value || ALL_FILTER_VALUE,
  set: (value: string) => {
    listTimeCategory.value = value === ALL_FILTER_VALUE ? '' : value
  }
})

const listLifeCategoryModel = computed({
  get: () => listLifeCategory.value || ALL_FILTER_VALUE,
  set: (value: string) => {
    listLifeCategory.value = value === ALL_FILTER_VALUE ? '' : value
  }
})

const listStatusModel = computed({
  get: () => listStatus.value || ALL_FILTER_VALUE,
  set: (value: string) => {
    listStatus.value = value === ALL_FILTER_VALUE ? '' : value
  }
})

// ─── Initial load ─────────────────────────────────────────────────────────────
if (listFetchStatus.value === 'idle') {
  void refreshList()
}

// ─── Actions ──────────────────────────────────────────────────────────────────
async function onSelectGoal(goalId: string) {
  const goal = await fetchGoal(goalId)
  if (goal) {
    selectedGoal.value = goal
    detailSlideoverOpen.value = true
  }
}

function onEditGoal(goal: Goal) {
  selectedGoal.value = goal
  editModalOpen.value = true
}

function onArchiveGoal(goal: Goal) {
  selectedGoal.value = goal
  archiveModalOpen.value = true
}

async function onCompleteGoal(goal: Goal) {
  const ok = await completeGoal(goal.id, goal.title)
  if (ok) refreshList()
}

async function onRestoreGoal(goal: Goal) {
  const ok = await restoreGoal(goal.id)
  if (ok) refreshList()
}

function onGoalArchived() {
  detailSlideoverOpen.value = false
  selectedGoal.value = null
  refreshList()
}

function onGoalUpdated() {
  refreshList()
}

function onCreateHabitForGoal(goalId: string) {
  createHabitGoalId.value = goalId
  createHabitModalOpen.value = true
}

function onHabitCreated() {
  refreshList()
  if (detailSlideoverOpen.value && selectedGoal.value && createHabitGoalId.value === selectedGoal.value.id) {
    detailSlideoverRef.value?.reload()
  }
}

// ─── Filter options ───────────────────────────────────────────────────────────
const timeCategoryFilterOptions = computed(() => [
  { label: 'Todos', value: ALL_FILTER_VALUE },
  ...timeCategoryOptions
])

const lifeCategoryFilterOptions = computed(() => [
  { label: 'Todas', value: ALL_FILTER_VALUE },
  ...lifeCategoryOptions
])

const statusFilterOptions = computed(() => [
  { label: 'Todas', value: ALL_FILTER_VALUE },
  ...statusOptions
])
</script>

<template>
  <UDashboardPanel id="goals">
    <template #header>
      <UDashboardNavbar title="Metas">
        <template #leading>
          <AppSidebarCollapse />
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <NotificationsButton />
            <UButton
              label="Nova meta"
              icon="i-lucide-plus"
              @click="createModalOpen = true"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <UTabs
          :items="tabs"
          :model-value="activeTab"
          @update:model-value="activeTab = $event as string"
        />

        <template v-if="activeTab === 'list'">
          <!-- Filters -->
          <div class="flex flex-wrap items-center gap-2">
            <UInput
              v-model="listSearch"
              icon="i-lucide-search"
              placeholder="Buscar metas..."
              class="max-w-xs"
            />
            <USelect
              v-model="listTimeCategoryModel"
              :items="timeCategoryFilterOptions"
              value-key="value"
              placeholder="Prazo"
              class="min-w-32"
            />
            <USelect
              v-model="listLifeCategoryModel"
              :items="lifeCategoryFilterOptions"
              value-key="value"
              placeholder="Área"
              class="min-w-32"
            />
            <USelect
              v-model="listStatusModel"
              :items="statusFilterOptions"
              value-key="value"
              placeholder="Status"
              class="min-w-32"
            />
          </div>

          <!-- List -->
          <GoalsList
            :goals="listData?.data ?? []"
            :total="listData?.total ?? 0"
            :page="listPage"
            :page-size="listPageSize"
            :loading="listFetchStatus === 'pending'"
            @update:page="listPage = $event"
            @select="onSelectGoal"
            @edit="onEditGoal"
            @archive="onArchiveGoal"
            @complete="onCompleteGoal"
            @restore="onRestoreGoal"
          />
        </template>

        <GoalsInsightsPanel
          v-else-if="activeTab === 'insights'"
          :insights="insights ?? null"
          :loading="insightsStatus === 'pending'"
        />
      </div>
    </template>
  </UDashboardPanel>

  <!-- Modals -->
  <GoalsCreateModal
    :open="createModalOpen"
    @update:open="createModalOpen = $event"
    @saved="refreshList"
  />

  <GoalsEditModal
    v-if="selectedGoal"
    :open="editModalOpen"
    :goal="selectedGoal"
    @update:open="editModalOpen = $event"
    @saved="refreshList"
  />

  <GoalsArchiveModal
    v-if="selectedGoal"
    :open="archiveModalOpen"
    :goal="selectedGoal"
    @update:open="archiveModalOpen = $event"
    @archived="onGoalArchived"
  />

  <GoalsDetailSlideover
    v-if="selectedGoal"
    ref="detailSlideoverRef"
    :open="detailSlideoverOpen"
    :goal="selectedGoal"
    @update:open="detailSlideoverOpen = $event"
    @edit="editModalOpen = true"
    @archive="archiveModalOpen = true"
    @updated="onGoalUpdated"
    @create-habit="onCreateHabitForGoal"
  />

  <HabitsCreateModal
    :open="createHabitModalOpen"
    :initial-goal-id="createHabitGoalId"
    @update:open="createHabitModalOpen = $event"
    @created="onHabitCreated"
  />
</template>
