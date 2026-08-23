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
  refreshList,
  insights,
  insightsStatus,
  insightsRange,
  refreshInsights,
  isOnline,
  pendingSyncCount,
  syncingOffline
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
        <!-- Offline / pending sync indicator -->
        <div
          v-if="!isOnline || pendingSyncCount > 0"
          class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs"
          :class="!isOnline ? 'text-warning bg-warning/5' : 'text-muted bg-elevated/40'"
        >
          <UIcon
            :name="!isOnline ? 'i-lucide-cloud-off' : syncingOffline ? 'i-lucide-loader-2' : 'i-lucide-cloud-upload'"
            class="size-3.5 shrink-0"
            :class="syncingOffline ? 'animate-spin' : ''"
          />
          <span v-if="!isOnline">Offline — as alterações serão sincronizadas ao reconectar</span>
          <span v-else-if="syncingOffline">Sincronizando alterações offline...</span>
          <span v-else>{{ pendingSyncCount }} alteração(ões) pendente(s) de sincronização</span>
        </div>

        <!-- EDITOR VIEW -->
        <div v-if="activeView === 'editor'">
          <JournalTodayEditor
            ref="editorRef"
            :today-entry="todayData?.entry ?? null"
            :streak="todayData?.streak ?? 0"
            :loading="todayStatus === 'pending'"
            :is-online="isOnline"
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
          <UInput
            v-model="listSearch"
            icon="i-lucide-search"
            placeholder="Buscar no diário..."
          />

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
