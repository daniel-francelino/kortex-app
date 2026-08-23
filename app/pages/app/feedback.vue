<script setup lang="ts">
import type { Feedback, CreateFeedbackPayload } from '~/types/feedback'
import {
  FeedbackType,
  FeedbackStatus,
  FeedbackPriority,
  feedbackTypeLabels,
  feedbackStatusLabels,
  feedbackPriorityLabels
} from '~/types/feedback'

definePageMeta({ layout: 'app' })

useSeoMeta({
  title: 'Feedback'
})

const {
  listData,
  listFetchStatus,
  listPage,
  listPageSize,
  listType,
  listStatus,
  listSearch,
  createFeedback,
  fetchFeedback,
  deleteFeedback,
  addResponse,
  adminListData,
  adminListFetchStatus,
  adminPage,
  adminPageSize,
  adminType,
  adminStatus,
  adminPriority,
  adminSearch,
  refreshAdminList,
  adminUpdateFeedback,
  adminLinkEntity
} = useFeedback()

const activeTab = ref('my')
const tabs = [
  { label: 'Meus feedbacks', value: 'my', icon: 'i-lucide-message-circle' },
  { label: 'Admin', value: 'admin', icon: 'i-lucide-shield' }
]

useMobileContextNav().registerMobileContextNav('feedback', tabs, activeTab)

const createModalOpen = ref(false)
const detailSlideoverOpen = ref(false)
const adminSlideoverOpen = ref(false)
const selectedFeedback = ref<Feedback | null>(null)

const ALL_FILTER_VALUE = '__all__'

const listTypeModel = computed({
  get: () => listType.value || ALL_FILTER_VALUE,
  set: (value: string) => {
    listType.value = value === ALL_FILTER_VALUE ? '' : value
  }
})

const listStatusModel = computed({
  get: () => listStatus.value || ALL_FILTER_VALUE,
  set: (value: string) => {
    listStatus.value = value === ALL_FILTER_VALUE ? '' : value
  }
})

const adminTypeModel = computed({
  get: () => adminType.value || ALL_FILTER_VALUE,
  set: (value: string) => {
    adminType.value = value === ALL_FILTER_VALUE ? '' : value
  }
})

const adminStatusModel = computed({
  get: () => adminStatus.value || ALL_FILTER_VALUE,
  set: (value: string) => {
    adminStatus.value = value === ALL_FILTER_VALUE ? '' : value
  }
})

const adminPriorityModel = computed({
  get: () => adminPriority.value || ALL_FILTER_VALUE,
  set: (value: string) => {
    adminPriority.value = value === ALL_FILTER_VALUE ? '' : value
  }
})

const userFeedbacks = computed(() => listData.value?.data ?? [])
const userTotal = computed(() => listData.value?.total ?? 0)
const adminFeedbacks = computed(() => adminListData.value?.data ?? [])
const adminTotal = computed(() => adminListData.value?.total ?? 0)

const typeFilterOptions = [
  { label: 'Todos os tipos', value: ALL_FILTER_VALUE },
  ...Object.values(FeedbackType).map(t => ({
    label: feedbackTypeLabels[t],
    value: t
  }))
]

const statusFilterOptions = [
  { label: 'Todos os status', value: ALL_FILTER_VALUE },
  ...Object.values(FeedbackStatus).map(s => ({
    label: feedbackStatusLabels[s],
    value: s
  }))
]

const priorityFilterOptions = [
  { label: 'Todas prioridades', value: ALL_FILTER_VALUE },
  ...Object.values(FeedbackPriority).map(p => ({
    label: feedbackPriorityLabels[p],
    value: p
  }))
]

// ─── Handlers ────────────────────────────────────────
async function onCreateSubmit(payload: CreateFeedbackPayload) {
  await createFeedback(payload)
}

function onSelectFeedback(fb: Feedback) {
  selectedFeedback.value = fb
  detailSlideoverOpen.value = true
}

function onSelectAdminFeedback(fb: Feedback) {
  selectedFeedback.value = fb
  adminSlideoverOpen.value = true
}

async function onDeleteFeedback(id: string) {
  await deleteFeedback(id)
  detailSlideoverOpen.value = false
  selectedFeedback.value = null
}

async function onRespond(feedbackId: string, content: string) {
  await addResponse(feedbackId, { content })
  if (selectedFeedback.value) {
    selectedFeedback.value = await fetchFeedback(feedbackId)
  }
}

async function onAdminUpdateStatus(id: string, status: FeedbackStatus) {
  await adminUpdateFeedback(id, { status })
}

async function onAdminUpdatePriority(id: string, priority: FeedbackPriority) {
  await adminUpdateFeedback(id, { priority })
}

async function onAdminRespond(feedbackId: string, content: string) {
  await addResponse(feedbackId, { content })
  await refreshAdminList()
}

async function onAdminLinkEntity(feedbackId: string, entityType: string, entityId: string | undefined, externalUrl: string | undefined) {
  await adminLinkEntity(feedbackId, { entityType, entityId, externalUrl })
}

function onUserPageUpdate(page: number) {
  listPage.value = page
}

function onAdminPageUpdate(page: number) {
  adminPage.value = page
}
</script>

<template>
  <UDashboardPanel id="feedback">
    <template #header>
      <UDashboardNavbar title="Feedback">
        <template #leading>
          <AppSidebarCollapse />
        </template>
        <template #right>
          <NotificationsButton />
          <UButton label="Novo feedback" icon="i-lucide-plus" @click="createModalOpen = true" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="p-4 space-y-4">
        <div class="hidden lg:block">
          <UTabs
            :items="tabs"
            :model-value="activeTab"
            @update:model-value="activeTab = $event as string"
          />
        </div>

        <!-- My Feedbacks Tab -->
        <div v-if="activeTab === 'my'" class="space-y-4">
          <div class="flex flex-wrap items-center gap-3">
            <UInput
              v-model="listSearch"
              icon="i-lucide-search"
              placeholder="Buscar feedbacks..."
              class="w-full sm:w-64"
            />
            <USelect
              v-model="listTypeModel"
              :items="typeFilterOptions"
              value-key="value"
              class="w-40"
            />
            <USelect
              v-model="listStatusModel"
              :items="statusFilterOptions"
              value-key="value"
              class="w-40"
            />
          </div>

          <FeedbackList
            :feedbacks="userFeedbacks"
            :loading="listFetchStatus === 'pending'"
            :total="userTotal"
            :page="listPage"
            :page-size="listPageSize"
            @select="onSelectFeedback"
            @delete="onDeleteFeedback"
            @update:page="onUserPageUpdate"
          />
        </div>

        <!-- Admin Tab -->
        <div v-if="activeTab === 'admin'" class="space-y-4">
          <div class="flex flex-wrap items-center gap-3">
            <UInput
              v-model="adminSearch"
              icon="i-lucide-search"
              placeholder="Buscar feedbacks..."
              class="w-full sm:w-64"
            />
            <USelect
              v-model="adminTypeModel"
              :items="typeFilterOptions"
              value-key="value"
              class="w-40"
            />
            <USelect
              v-model="adminStatusModel"
              :items="statusFilterOptions"
              value-key="value"
              class="w-40"
            />
            <USelect
              v-model="adminPriorityModel"
              :items="priorityFilterOptions"
              value-key="value"
              class="w-40"
            />
          </div>

          <FeedbackAdminList
            :feedbacks="adminFeedbacks"
            :loading="adminListFetchStatus === 'pending'"
            :total="adminTotal"
            :page="adminPage"
            :page-size="adminPageSize"
            @select="onSelectAdminFeedback"
            @update-status="onAdminUpdateStatus"
            @update-priority="onAdminUpdatePriority"
            @update:page="onAdminPageUpdate"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Create Modal -->
  <FeedbackCreateModal
    :open="createModalOpen"
    @update:open="createModalOpen = $event"
    @submit="onCreateSubmit"
  />

  <!-- User Detail Slideover -->
  <FeedbackDetailSlideover
    :open="detailSlideoverOpen"
    :feedback="selectedFeedback"
    @update:open="detailSlideoverOpen = $event"
    @delete="onDeleteFeedback"
    @respond="onRespond"
  />

  <!-- Admin Detail Slideover -->
  <FeedbackAdminSlideover
    :open="adminSlideoverOpen"
    :feedback="selectedFeedback"
    @update:open="adminSlideoverOpen = $event"
    @update-status="onAdminUpdateStatus"
    @update-priority="onAdminUpdatePriority"
    @respond="onAdminRespond"
    @link-entity="onAdminLinkEntity"
  />
</template>
