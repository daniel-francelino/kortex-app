<script setup lang="ts">
definePageMeta({
  layout: 'app',
  ssr: false
})

useSeoMeta({
  title: 'Diário de Bordo'
})

const {
  todayData,
  todayStatus,
  refreshToday,
  calendarDates,
  calendarStatus,
  calendarFrom,
  calendarTo,
  refreshCalendar,
  upsertEntry,
  listData,
  listFetchStatus,
  listPage,
  listSearch,
  listTag,
  refreshList,
  tags,
  refreshTags,
  insights,
  insightsStatus,
  insightsRange,
  refreshInsights
} = useJournal()

const isMobile = useIsMobile()

// ─── View mode ────────────────────────────────────────────────────────────────
type JournalView = 'editor' | 'calendar' | 'list' | 'insights'
const activeView = ref<JournalView>('editor')

watch(activeView, (view) => {
  if (view === 'editor') refreshToday()
  if (view === 'calendar') refreshCalendar()
  if (view === 'list') {
    refreshList()
    refreshTags()
  }
  if (view === 'insights') refreshInsights()
})

// ─── Editor ref (for unsaved-changes check) ───────────────────────────────────
const editorRef = ref<{ isUnsaved: () => boolean, doSave: () => Promise<void> } | null>(null)

// ─── Unsaved-changes confirmation on route leave ──────────────────────────────
const confirmLeaveOpen = ref(false)
let resolvePendingNav: ((allow: boolean) => void) | null = null

onBeforeRouteLeave(async () => {
  const editor = editorRef.value
  if (!editor?.isUnsaved()) return // nothing unsaved, allow navigation

  return new Promise<boolean | undefined>((resolve) => {
    resolvePendingNav = resolve
    confirmLeaveOpen.value = true
  }).then(allow => (allow ? undefined : false))
})

async function onConfirmSaveAndLeave() {
  confirmLeaveOpen.value = false
  await editorRef.value?.doSave()
  resolvePendingNav?.(true)
  resolvePendingNav = null
}

function onConfirmDiscardAndLeave() {
  confirmLeaveOpen.value = false
  resolvePendingNav?.(true)
  resolvePendingNav = null
}

function onConfirmCancel() {
  confirmLeaveOpen.value = false
  resolvePendingNav?.(false)
  resolvePendingNav = null
}

// Calendar entry modal
const detailModalOpen = ref(false)
const selectedDate = ref('')

function onSelectDate(date: string) {
  selectedDate.value = date
  detailModalOpen.value = true
}

function onCalendarMonthChange(from: string, to: string) {
  calendarFrom.value = from
  calendarTo.value = to
}

// ─── View options ─────────────────────────────────────────────────────────────
const viewOptions: { value: JournalView, icon: string, tooltip: string }[] = [
  { value: 'editor', icon: 'i-lucide-pen-line', tooltip: 'Editor de hoje' },
  { value: 'calendar', icon: 'i-lucide-calendar-days', tooltip: 'Calendário' },
  { value: 'list', icon: 'i-lucide-list', tooltip: 'Lista de entradas' },
  { value: 'insights', icon: 'i-lucide-bar-chart-3', tooltip: 'Insights' }
]

// ─── Entry list view ────────────────────────────────────────────────────────────
const tagFilterOptions = computed(() => [
  { label: 'Todas as tags', value: '' },
  ...(tags.value ?? []).map(t => ({ label: t.name, value: t.name }))
])

function onListEntrySelect(date: string) {
  onSelectDate(date)
}

// ─── Insights view ────────────────────────────────────────────────────────────
function onInsightsRangeChange(range: '7d' | '30d' | '90d') {
  insightsRange.value = range
}
</script>

<template>
  <UDashboardPanel id="journal">
    <template #header>
      <UDashboardNavbar title="Diário de Bordo">
        <template #leading>
          <AppSidebarCollapse />
        </template>

        <template #right>
          <div class="flex items-center gap-0.5 rounded-lg border border-default p-0.5">
            <UTooltip
              v-for="opt in viewOptions"
              :key="opt.value"
              :text="opt.tooltip"
            >
              <UButton
                square
                :color="activeView === opt.value ? 'primary' : 'neutral'"
                :variant="activeView === opt.value ? 'soft' : 'ghost'"
                @click="activeView = opt.value"
              >
                <UIcon :name="opt.icon" class="size-5 shrink-0" />
              </UButton>
            </UTooltip>
          </div>

          <NotificationsButton />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <!-- EDITOR VIEW -->
        <div v-if="activeView === 'editor'">
          <JournalTodayEditor
            ref="editorRef"
            :today-entry="todayData?.entry ?? null"
            :metrics="todayData?.metrics ?? []"
            :streak="todayData?.streak ?? 0"
            :loading="todayStatus === 'pending'"
            :on-upsert-entry="upsertEntry"
          />
        </div>

        <!-- CALENDAR VIEW -->
        <div v-else-if="activeView === 'calendar'">
          <JournalCalendarView
            :entry-dates="calendarDates ?? []"
            :loading="calendarStatus === 'pending'"
            @select-date="onSelectDate"
            @month-change="onCalendarMonthChange"
          />
        </div>

        <!-- LIST VIEW -->
        <div v-else-if="activeView === 'list'" class="space-y-4">
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
            <UInput
              v-model="listSearch"
              icon="i-lucide-search"
              placeholder="Buscar no diário..."
              class="flex-1"
            />
            <USelect
              v-model="listTag"
              :items="tagFilterOptions"
              value-key="value"
              class="w-full sm:w-44"
            />
          </div>

          <JournalEntryList
            :entries="listData?.data ?? []"
            :total="listData?.total ?? 0"
            :page="listPage"
            :page-size="listData?.pageSize ?? 20"
            :loading="listFetchStatus === 'pending'"
            @update:page="listPage = $event"
            @select="onListEntrySelect"
          />
        </div>

        <!-- INSIGHTS VIEW -->
        <div v-else-if="activeView === 'insights'" class="space-y-4">
          <div
            v-if="(todayData?.streak ?? 0) > 0"
            class="flex items-center gap-2 rounded-lg border border-default bg-elevated/30 px-4 py-3"
          >
            <span class="text-xl leading-none">🔥</span>
            <span class="text-sm text-highlighted">
              <strong>{{ todayData?.streak }}</strong> {{ todayData?.streak === 1 ? 'dia seguido' : 'dias seguidos' }} escrevendo no diário
            </span>
          </div>

          <JournalInsightsPanel
            :insights="insights ?? null"
            :loading="insightsStatus === 'pending'"
            @range-change="onInsightsRangeChange"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Unsaved changes confirmation -->
  <UModal
    :open="confirmLeaveOpen"
    :dismissible="false"
    @update:open="confirmLeaveOpen = $event"
  >
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-pencil-line" class="size-4 text-warning" />
        <span class="text-sm font-semibold text-highlighted">Alterações não salvas</span>
      </div>
    </template>

    <template #body>
      <p class="text-sm text-muted">
        Você tem alterações no diário que ainda não foram salvas. O que deseja fazer?
      </p>
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-end gap-2">
        <UButton
          label="Cancelar"
          variant="ghost"
          color="neutral"
          :size="isMobile ? 'md' : 'sm'"
          @click="onConfirmCancel"
        />
        <UButton
          label="Descartar"
          variant="outline"
          color="error"
          :size="isMobile ? 'md' : 'sm'"
          @click="onConfirmDiscardAndLeave"
        />
        <UButton
          label="Salvar e sair"
          icon="i-lucide-check"
          :size="isMobile ? 'md' : 'sm'"
          @click="onConfirmSaveAndLeave"
        />
      </div>
    </template>
  </UModal>

  <JournalEntryDetailModal
    v-if="selectedDate"
    :open="detailModalOpen"
    :date="selectedDate"
    @update:open="detailModalOpen = $event"
    @updated="refreshToday(); refreshCalendar(); refreshList()"
  />
</template>
