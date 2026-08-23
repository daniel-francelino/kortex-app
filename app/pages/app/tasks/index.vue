<script setup lang="ts">
import type { Task } from '~/types/tasks'
import { TaskStatus } from '~/types/tasks'

definePageMeta({
  layout: 'app'
})

useSeoMeta({
  title: 'Tarefas'
})

const {
  listData,
  listFetchStatus,
  listPage,
  listPageSize,
  listSearch,
  listStatus,
  listPriority,
  listListId,
  taskLists,
  insights,
  insightsStatus,
  refreshInsights,
  refreshList,
  completeTask,
  fetchTask,
  priorityOptions,
  statusOptions
} = useTasks()

// ─── Active tab ───────────────────────────────────────────────────────────────
const activeTab = ref('pending')

const tabs = [
  { label: 'Pendentes', value: 'pending', icon: 'i-lucide-clock' },
  { label: 'Todas', value: 'all', icon: 'i-lucide-list' },
  { label: 'Insights', value: 'insights', icon: 'i-lucide-bar-chart-3' }
]

useMobileContextNav().registerMobileContextNav('tasks', tabs, activeTab)

watch(activeTab, (tab) => {
  if (tab === 'pending') {
    listStatus.value = TaskStatus.Pending
    listPriority.value = ''
    listListId.value = ''
    listSearch.value = ''
  } else if (tab === 'all') {
    listStatus.value = ''
  }
  if (tab === 'insights') {
    refreshInsights()
  }
  listPage.value = 1
}, { immediate: true })

// ─── Modals ───────────────────────────────────────────────────────────────────
const createModalOpen = ref(false)
const editModalOpen = ref(false)
const archiveModalOpen = ref(false)
const listCreateModalOpen = ref(false)
const detailSlideoverOpen = ref(false)
const selectedTask = ref<Task | null>(null)

const ALL_FILTER_VALUE = '__all__'

const listPriorityModel = computed({
  get: () => listPriority.value || ALL_FILTER_VALUE,
  set: (value: string) => {
    listPriority.value = value === ALL_FILTER_VALUE ? '' : value
  }
})

const listStatusModel = computed({
  get: () => listStatus.value || ALL_FILTER_VALUE,
  set: (value: string) => {
    listStatus.value = value === ALL_FILTER_VALUE ? '' : value
  }
})

const listListIdModel = computed({
  get: () => listListId.value || ALL_FILTER_VALUE,
  set: (value: string) => {
    listListId.value = value === ALL_FILTER_VALUE ? '' : value
  }
})

// ─── Actions ──────────────────────────────────────────────────────────────────
async function onSelectTask(taskId: string) {
  const task = await fetchTask(taskId)
  if (task) {
    selectedTask.value = task
    detailSlideoverOpen.value = true
  }
}

function onEditTask(task: Task) {
  selectedTask.value = task
  editModalOpen.value = true
}

function onArchiveTask(task: Task) {
  selectedTask.value = task
  archiveModalOpen.value = true
}

async function onCompleteTask(task: Task) {
  await completeTask(task.id, task.title)
}

function onTaskArchived() {
  detailSlideoverOpen.value = false
  selectedTask.value = null
}

function onTaskUpdated() {
  refreshList()
}

// ─── Filter options ───────────────────────────────────────────────────────────
const priorityFilterOptions = computed(() => [
  { label: 'Todas', value: ALL_FILTER_VALUE },
  ...priorityOptions
])

const statusFilterOptions = computed(() => [
  { label: 'Todos', value: ALL_FILTER_VALUE },
  ...statusOptions
])

const listFilterOptions = computed(() => [
  { label: 'Todas', value: ALL_FILTER_VALUE },
  ...(taskLists.value ?? []).map(l => ({ label: l.name, value: l.id }))
])
</script>

<template>
  <UDashboardPanel id="tasks">
    <template #header>
      <UDashboardNavbar title="Tarefas">
        <template #leading>
          <AppSidebarCollapse />
        </template>

        <template #right>
          <NotificationsButton />
          <UButton
            icon="i-lucide-folder-plus"
            variant="outline"
            square
            class="sm:hidden"
            @click="listCreateModalOpen = true"
          />
          <UButton
            label="Nova lista"
            icon="i-lucide-folder-plus"
            variant="outline"
            class="hidden sm:inline-flex"
            @click="listCreateModalOpen = true"
          />
          <UButton
            icon="i-lucide-plus"
            square
            class="sm:hidden"
            @click="createModalOpen = true"
          />
          <UButton
            label="Nova tarefa"
            icon="i-lucide-plus"
            class="hidden sm:inline-flex"
            @click="createModalOpen = true"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <!-- Tabs -->
        <div class="hidden lg:block">
          <UTabs
            :items="tabs"
            :model-value="activeTab"
            @update:model-value="activeTab = $event as string"
          />
        </div>

        <!-- PENDING TAB -->
        <div v-if="activeTab === 'pending'" class="space-y-4">
          <TasksTasksList
            :tasks="listData?.data ?? []"
            :total="listData?.total ?? 0"
            :page="listPage"
            :page-size="listPageSize"
            :loading="listFetchStatus === 'pending'"
            @update:page="listPage = $event"
            @select="onSelectTask"
            @edit="onEditTask"
            @archive="onArchiveTask"
            @complete="onCompleteTask"
          />
        </div>

        <!-- ALL TAB -->
        <div v-if="activeTab === 'all'" class="space-y-4">
          <!-- Filters -->
          <div class="flex flex-wrap items-center gap-2">
            <UInput
              v-model="listSearch"
              icon="i-lucide-search"
              placeholder="Buscar tarefas..."
              class="w-full sm:max-w-xs"
            />
            <USelect
              v-model="listPriorityModel"
              :items="priorityFilterOptions"
              value-key="value"
              placeholder="Prioridade"
              class="min-w-0 flex-1 sm:min-w-32 sm:flex-none"
            />
            <USelect
              v-model="listStatusModel"
              :items="statusFilterOptions"
              value-key="value"
              placeholder="Status"
              class="min-w-0 flex-1 sm:min-w-32 sm:flex-none"
            />
            <USelect
              v-model="listListIdModel"
              :items="listFilterOptions"
              value-key="value"
              placeholder="Lista"
              class="min-w-0 flex-1 sm:min-w-32 sm:flex-none"
            />
          </div>

          <TasksTasksList
            :tasks="listData?.data ?? []"
            :total="listData?.total ?? 0"
            :page="listPage"
            :page-size="listPageSize"
            :loading="listFetchStatus === 'pending'"
            @update:page="listPage = $event"
            @select="onSelectTask"
            @edit="onEditTask"
            @archive="onArchiveTask"
            @complete="onCompleteTask"
          />
        </div>

        <!-- INSIGHTS TAB -->
        <div v-if="activeTab === 'insights'">
          <TasksInsightsPanel
            :insights="insights ?? null"
            :loading="insightsStatus === 'pending'"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Modals -->
  <TasksCreateModal
    :open="createModalOpen"
    @update:open="createModalOpen = $event"
  />

  <TasksEditModal
    v-if="selectedTask"
    :open="editModalOpen"
    :task="selectedTask"
    @update:open="editModalOpen = $event"
  />

  <TasksArchiveModal
    v-if="selectedTask"
    :open="archiveModalOpen"
    :task="selectedTask"
    @update:open="archiveModalOpen = $event"
    @archived="onTaskArchived"
  />

  <TasksListCreateModal
    :open="listCreateModalOpen"
    @update:open="listCreateModalOpen = $event"
  />

  <TasksDetailSlideover
    v-if="selectedTask"
    :open="detailSlideoverOpen"
    :task="selectedTask"
    @update:open="detailSlideoverOpen = $event"
    @edit="editModalOpen = true"
    @archive="archiveModalOpen = true"
    @updated="onTaskUpdated"
  />
</template>
