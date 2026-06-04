<script setup lang="ts">
definePageMeta({
  layout: 'app'
})

useSeoMeta({
  title: 'Diário de Bordo'
})

const {
  todayData,
  todayStatus,
  refreshToday,
  listData,
  listFetchStatus,
  listPage,
  listPageSize,
  listSearch,
  listFrom,
  listTo,
  listTag,
  tags,
  calendarDates,
  calendarStatus,
  calendarFrom,
  calendarTo,
  refreshCalendar,
  upsertEntry
} = useJournal()

// ─── View mode ────────────────────────────────────────────────────────────────
type JournalView = 'editor' | 'calendar'
const activeView = ref<JournalView>('editor')

// Sub-view inside calendar: calendar grid or list
const calendarViewMode = ref<'calendar' | 'list'>('calendar')

watch(activeView, (view) => {
  if (view === 'editor') refreshToday()
  if (view === 'calendar') {
    refreshCalendar()
    listPage.value = 1
  }
})

// ─── Calendar slideover ───────────────────────────────────────────────────────
const detailSlideoverOpen = ref(false)
const selectedDate = ref('')

function onSelectDate(date: string) {
  selectedDate.value = date
  detailSlideoverOpen.value = true
}

function onCalendarMonthChange(from: string, to: string) {
  calendarFrom.value = from
  calendarTo.value = to
}

// ─── Tag filter options ───────────────────────────────────────────────────────
const ALL_FILTER_VALUE = '__all__'

const listTagModel = computed({
  get: () => listTag.value || ALL_FILTER_VALUE,
  set: (value: string) => {
    listTag.value = value === ALL_FILTER_VALUE ? '' : value
  }
})

const tagFilterOptions = computed(() => [
  { label: 'Todas', value: ALL_FILTER_VALUE },
  ...(tags.value ?? []).map(t => ({ label: t.name, value: t.name }))
])

// ─── View options ─────────────────────────────────────────────────────────────
const viewOptions: { value: JournalView, icon: string, tooltip: string }[] = [
  { value: 'editor', icon: 'i-lucide-pen-line', tooltip: 'Editor de hoje' },
  { value: 'calendar', icon: 'i-lucide-calendar-days', tooltip: 'Calendário' }
]
</script>

<template>
  <UDashboardPanel id="journal">
    <template #header>
      <UDashboardNavbar title="Diário de Bordo">
        <template #leading>
          <AppSidebarCollapse />
        </template>

        <template #right>
          <!-- View switcher -->
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
            :today-entry="todayData?.entry ?? null"
            :loading="todayStatus === 'pending'"
            :on-upsert-entry="upsertEntry"
          />
        </div>

        <!-- CALENDAR VIEW -->
        <div v-else-if="activeView === 'calendar'" class="space-y-4">
          <!-- Sub-view toggle: grid vs list -->
          <div class="flex items-center justify-end">
            <div class="flex items-center gap-0.5 rounded-lg border border-default p-0.5">
              <UTooltip text="Calendário">
                <UButton
                  icon="i-lucide-calendar"
                  size="xs"
                  :color="calendarViewMode === 'calendar' ? 'primary' : 'neutral'"
                  :variant="calendarViewMode === 'calendar' ? 'soft' : 'ghost'"
                  @click="calendarViewMode = 'calendar'"
                />
              </UTooltip>
              <UTooltip text="Lista">
                <UButton
                  icon="i-lucide-list"
                  size="xs"
                  :color="calendarViewMode === 'list' ? 'primary' : 'neutral'"
                  :variant="calendarViewMode === 'list' ? 'soft' : 'ghost'"
                  @click="calendarViewMode = 'list'"
                />
              </UTooltip>
            </div>
          </div>

          <!-- Calendar grid -->
          <JournalCalendarView
            v-if="calendarViewMode === 'calendar'"
            :entry-dates="calendarDates ?? []"
            :loading="calendarStatus === 'pending'"
            @select-date="onSelectDate"
            @month-change="onCalendarMonthChange"
          />

          <!-- List view -->
          <template v-else>
            <div class="flex flex-wrap items-center gap-2">
              <UInput
                v-model="listSearch"
                icon="i-lucide-search"
                placeholder="Buscar entradas..."
                class="max-w-xs"
              />
              <UInput
                v-model="listFrom"
                type="date"
                placeholder="De"
                class="max-w-40"
              />
              <UInput
                v-model="listTo"
                type="date"
                placeholder="Até"
                class="max-w-40"
              />
              <USelect
                v-model="listTagModel"
                :items="tagFilterOptions"
                value-key="value"
                placeholder="Tag"
                class="min-w-28"
              />
            </div>
            <JournalEntryList
              :entries="listData?.data ?? []"
              :total="listData?.total ?? 0"
              :page="listPage"
              :page-size="listPageSize"
              :loading="listFetchStatus === 'pending'"
              @update:page="listPage = $event"
              @select="onSelectDate"
            />
          </template>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <JournalEntryDetailSlideover
    v-if="selectedDate"
    :open="detailSlideoverOpen"
    :date="selectedDate"
    @update:open="detailSlideoverOpen = $event"
    @updated="refreshToday(); refreshCalendar()"
  />
</template>
