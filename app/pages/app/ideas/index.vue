<script setup lang="ts">
import type { Idea, IdeaStatus } from '~/types/ideas'

definePageMeta({
  layout: 'app'
})

useSeoMeta({
  title: 'Ideias'
})

const {
  ideasData,
  ideasStatus,
  lists,
  tags,
  page,
  filters,
  refreshIdeas,
  updateIdeaStatus,
  statusOptions,
  priorityOptions,
  debouncedSetSearch
} = useIdeas()

// ─── View & UI state ──────────────────────────────────────────────────────────

const activeView = ref<'table' | 'board'>('table')
const viewOptions = [
  { label: 'Tabela', value: 'table', icon: 'i-lucide-table' },
  { label: 'Quadro', value: 'board', icon: 'i-lucide-kanban' }
]

useMobileContextNav().registerMobileContextNav('ideas', viewOptions, activeView)

const createModalOpen = ref(false)
const detailOpen = ref(false)
const selectedIdeaId = ref<string | null>(null)
const localSearch = ref('')

// ─── Handlers ─────────────────────────────────────────────────────────────────

function onSelectIdea(idea: Idea): void {
  selectedIdeaId.value = idea.id
  detailOpen.value = true
}

function onIdeaSaved(idea: { id: string }): void {
  createModalOpen.value = false
  selectedIdeaId.value = idea.id
  detailOpen.value = true
}

function onIdeaUpdated(): void {
  refreshIdeas()
}

function onIdeaDeleted(): void {
  selectedIdeaId.value = null
  detailOpen.value = false
  refreshIdeas()
}

async function onUpdateStatus(id: string, status: IdeaStatus): Promise<void> {
  await updateIdeaStatus(id, status)
}

function onFilterList(listId: string): void {
  filters.listId = listId
}

function onSearchInput(val: string): void {
  localSearch.value = val
  debouncedSetSearch(val)
}
</script>

<template>
  <UDashboardPanel id="ideas" class="!flex-row">
    <!-- Left sidebar: Lists + Tags + Filters -->
    <div class="w-60 shrink-0 flex flex-col border-r border-default h-full">
      <div class="px-3 py-3 border-b border-default">
        <h2 class="text-sm font-semibold text-highlighted">
          Ideias
        </h2>
      </div>

      <div class="flex-1 overflow-y-auto p-3 space-y-5">
        <!-- Lists -->
        <IdeasIdeaListManager @filter-list="onFilterList" />

        <!-- Quick filters -->
        <div>
          <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Filtros
          </h3>
          <div class="space-y-2">
            <div>
              <label class="text-xs text-muted mb-1 block">Status</label>
              <USelect
                v-model="filters.status"
                :items="[{ label: 'Todos', value: '' }, ...statusOptions]"
                value-key="value"
                size="xs"
                class="w-full"
              />
            </div>
            <div>
              <label class="text-xs text-muted mb-1 block">Prioridade</label>
              <USelect
                v-model="filters.priority"
                :items="[{ label: 'Todas', value: '' }, ...priorityOptions]"
                value-key="value"
                size="xs"
                class="w-full"
              />
            </div>
          </div>
        </div>

        <!-- Tags (quick view) -->
        <div>
          <h3 class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            <UIcon name="i-lucide-tags" class="size-3 mr-1 inline" />
            Tags
          </h3>
          <div v-if="tags && tags.length > 0" class="space-y-0.5">
            <button
              v-for="tag in tags"
              :key="tag.id"
              class="w-full text-left rounded px-2 py-1 text-xs hover:bg-elevated transition-colors"
              :class="filters.tagId === tag.id ? 'bg-elevated text-primary font-medium' : 'text-default'"
              @click="filters.tagId = filters.tagId === tag.id ? '' : tag.id"
            >
              #{{ tag.name }}
            </button>
          </div>
          <p v-else class="text-xs text-muted">
            Nenhuma tag
          </p>
        </div>
      </div>
    </div>

    <!-- Main content -->
    <div class="flex-1 flex flex-col h-full min-w-0">
      <!-- Navbar -->
      <UDashboardNavbar>
        <template #leading>
          <AppSidebarCollapse />
        </template>

        <template #center>
          <UInput
            :model-value="localSearch"
            icon="i-lucide-search"
            placeholder="Buscar ideias..."
            size="sm"
            class="w-80"
            @update:model-value="onSearchInput"
          />
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <!-- View Toggle -->
            <div class="hidden items-center border border-default rounded-md lg:flex">
              <UButton
                icon="i-lucide-table"
                size="xs"
                :variant="activeView === 'table' ? 'solid' : 'ghost'"
                :color="activeView === 'table' ? 'primary' : 'neutral'"
                class="rounded-r-none"
                @click="activeView = 'table'"
              />
              <UButton
                icon="i-lucide-kanban"
                size="xs"
                :variant="activeView === 'board' ? 'solid' : 'ghost'"
                :color="activeView === 'board' ? 'primary' : 'neutral'"
                class="rounded-l-none"
                @click="activeView = 'board'"
              />
            </div>

            <UButton
              icon="i-lucide-plus"
              label="Nova ideia"
              size="sm"
              @click="createModalOpen = true"
            />

            <NotificationsButton />
          </div>
        </template>
      </UDashboardNavbar>

      <!-- Active filters bar -->
      <div
        v-if="filters.status || filters.priority || filters.listId || filters.tagId"
        class="flex items-center gap-2 px-4 py-2 border-b border-default bg-elevated/30"
      >
        <span class="text-xs text-muted">Filtros:</span>
        <UBadge
          v-if="filters.status"
          size="xs"
          color="info"
          variant="subtle"
          class="cursor-pointer"
          @click="filters.status = ''"
        >
          Status: {{ statusOptions.find(s => s.value === filters.status)?.label }}
          <UIcon name="i-lucide-x" class="size-3 ml-0.5" />
        </UBadge>
        <UBadge
          v-if="filters.priority"
          size="xs"
          color="warning"
          variant="subtle"
          class="cursor-pointer"
          @click="filters.priority = ''"
        >
          Prioridade: {{ priorityOptions.find(p => p.value === filters.priority)?.label }}
          <UIcon name="i-lucide-x" class="size-3 ml-0.5" />
        </UBadge>
        <UBadge
          v-if="filters.listId"
          size="xs"
          color="neutral"
          variant="subtle"
          class="cursor-pointer"
          @click="filters.listId = ''"
        >
          Lista: {{ lists?.find(l => l.id === filters.listId)?.name }}
          <UIcon name="i-lucide-x" class="size-3 ml-0.5" />
        </UBadge>
        <UBadge
          v-if="filters.tagId"
          size="xs"
          color="neutral"
          variant="subtle"
          class="cursor-pointer"
          @click="filters.tagId = ''"
        >
          Tag: #{{ tags?.find(t => t.id === filters.tagId)?.name }}
          <UIcon name="i-lucide-x" class="size-3 ml-0.5" />
        </UBadge>
        <UButton
          label="Limpar"
          size="xs"
          variant="link"
          @click="filters.status = ''; filters.priority = ''; filters.listId = ''; filters.tagId = ''"
        />
      </div>

      <!-- Content views -->
      <div class="flex-1 overflow-hidden">
        <!-- Table View -->
        <IdeasIdeasTable
          v-if="activeView === 'table'"
          :ideas="ideasData?.data ?? []"
          :total="ideasData?.total ?? 0"
          :page="page"
          :loading="ideasStatus === 'pending'"
          @select="onSelectIdea"
          @update:page="page = $event"
          @update-status="onUpdateStatus"
          @create="createModalOpen = true"
        />

        <!-- Board View -->
        <IdeasIdeasBoard
          v-else
          :ideas="ideasData?.data ?? []"
          :loading="ideasStatus === 'pending'"
          @select="onSelectIdea"
          @update-status="onUpdateStatus"
          @create="createModalOpen = true"
        />
      </div>
    </div>

    <!-- Detail Slideover -->
    <IdeasIdeaDetailSlideover
      :idea-id="selectedIdeaId"
      :open="detailOpen"
      :lists="lists ?? []"
      :tags="tags ?? []"
      @update:open="detailOpen = $event"
      @updated="onIdeaUpdated"
      @deleted="onIdeaDeleted"
    />

    <!-- Create Modal -->
    <IdeasIdeaCreateModal
      :open="createModalOpen"
      :lists="lists ?? []"
      :tags="tags ?? []"
      @update:open="createModalOpen = $event"
      @saved="onIdeaSaved"
    />
  </UDashboardPanel>
</template>
