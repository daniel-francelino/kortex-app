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

watch(activeView, (view) => {
  if (view === 'editor') refreshToday()
  if (view === 'calendar') refreshCalendar()
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
        <div v-else-if="activeView === 'calendar'">
          <JournalCalendarView
            :entry-dates="calendarDates ?? []"
            :loading="calendarStatus === 'pending'"
            @select-date="onSelectDate"
            @month-change="onCalendarMonthChange"
          />
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
