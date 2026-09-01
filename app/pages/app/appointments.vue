<script setup lang="ts">
import type { Calendar, CalendarEvent, CreateEventPayload } from '~/types/appointments'
import { CalendarVisibility } from '~/types/appointments'
import { getMoodOption } from '~/types/journal'
import type { JournalEntry } from '~/types/journal'
import { useSwipe } from '@vueuse/core'
import { addDays, addMilliseconds, addMonths, addWeeks, format, startOfWeek, subDays, subMonths, subWeeks } from 'date-fns'
import { AnimatePresence, motion } from 'motion-v'
import { getEventTimeZone, getZonedDate, zonedDateTimeToUtcIso } from '~/utils/calendarEventTime'
import { detectBrowserTimeZone, formatDisplay } from '#shared/utils/dateTime'

definePageMeta({
  layout: 'app'
})

useSeoMeta({
  title: 'Agenda'
})

const {
  calendars,
  calendarsStatus,
  archivedCalendars,
  archivedCalendarsStatus,
  eventsData,
  eventsStatus,
  eventsInitialLoading,
  activeCalendarIds,
  viewFrom,
  viewTo,
  setViewRange,
  fetchEventDetail,
  refreshCalendars,
  refreshArchivedCalendars,
  refreshEvents,
  createEvent,
  updateEvent,
  archiveEvent,
  archiveCalendar,
  restoreCalendar,
  isOnline,
  pendingSyncCount,
  syncingOffline
} = useAppointments()

// ─── View mode (Day / Week / Month) ─────────────────────────────────────
type CalendarViewMode = 'day' | 'week' | 'month'

const route = useRoute()
const STORAGE_KEY = 'sb-calendar-view'
const savedView = (typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null) as CalendarViewMode | null
const queryView = typeof route.query.view === 'string' ? route.query.view : null
const initialView = queryView && ['day', 'week', 'month'].includes(queryView)
  ? queryView as CalendarViewMode
  : (savedView && ['day', 'week', 'month'].includes(savedView) ? savedView : 'month')
const activeView = ref<CalendarViewMode>(initialView)
const calendarSlideDirection = ref<-1 | 0 | 1>(0)

watch(activeView, (v) => {
  closeAllPopovers()
  calendarSlideDirection.value = 0

  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, v)
  }
})

const viewModes: { label: string, value: CalendarViewMode, icon: string }[] = [
  { label: 'Dia', value: 'day', icon: 'i-lucide-square' },
  { label: 'Semana', value: 'week', icon: 'i-lucide-columns-3' },
  { label: 'Mês', value: 'month', icon: 'i-lucide-grid-3x3' }
]

const mobileNavItems: MobileContextNavItem[] = [
  ...viewModes,
  { label: 'Link', value: 'scheduling-link', icon: 'i-lucide-calendar-clock', to: '/app/scheduling' }
]

useMobileContextNav().registerMobileContextNav('appointments', mobileNavItems, activeView)

// ─── Navigation state ───────────────────────────────────────────────────
const today = new Date()
const viewYear = ref(today.getFullYear())
const viewMonth = ref(today.getMonth())
const viewWeekStart = ref(getWeekStart(today))
const viewDayDate = ref(new Date(today))

function getWeekStart(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 0 })
}

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const headerLabel = computed(() => {
  if (activeView.value === 'month') {
    const d = new Date(viewYear.value, viewMonth.value, 1)
    return capitalizeFirst(formatDisplay(d, "MMMM 'de' yyyy"))
  }
  if (activeView.value === 'week') {
    const start = viewWeekStart.value
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    const sStr = capitalizeFirst(formatDisplay(start, "dd 'de' MMM'.'"))
    const eStr = formatDisplay(end, "dd 'de' MMM'.' 'de' yyyy")
    return `${sStr} — ${eStr}`
  }
  return capitalizeFirst(formatDisplay(viewDayDate.value, "EEEE, dd 'de' MMMM 'de' yyyy"))
})

const calendarViewKey = computed(() => {
  if (activeView.value === 'month') return `month-${viewYear.value}-${viewMonth.value}`
  if (activeView.value === 'week') return `week-${viewWeekStart.value.toISOString()}`
  return `day-${viewDayDate.value.toISOString()}`
})

const calendarSlideInitial = computed(() => ({
  opacity: 0,
  x: calendarSlideDirection.value * 36
}))

const calendarSlideExit = computed(() => ({
  opacity: 0,
  x: calendarSlideDirection.value * -36
}))

const calendarSlideTransition = {
  duration: 0.22,
  ease: 'easeOut'
}

function goPrev() {
  closeAllPopovers()
  calendarSlideDirection.value = -1

  if (activeView.value === 'month') {
    const prev = subMonths(new Date(viewYear.value, viewMonth.value, 1), 1)
    viewYear.value = prev.getFullYear()
    viewMonth.value = prev.getMonth()
  } else if (activeView.value === 'week') {
    viewWeekStart.value = subWeeks(viewWeekStart.value, 1)
  } else {
    viewDayDate.value = subDays(viewDayDate.value, 1)
  }
}

function goNext() {
  closeAllPopovers()
  calendarSlideDirection.value = 1

  if (activeView.value === 'month') {
    const next = addMonths(new Date(viewYear.value, viewMonth.value, 1), 1)
    viewYear.value = next.getFullYear()
    viewMonth.value = next.getMonth()
  } else if (activeView.value === 'week') {
    viewWeekStart.value = addWeeks(viewWeekStart.value, 1)
  } else {
    viewDayDate.value = addDays(viewDayDate.value, 1)
  }
}

function goToday() {
  closeAllPopovers()
  calendarSlideDirection.value = 0

  const now = new Date()
  viewYear.value = now.getFullYear()
  viewMonth.value = now.getMonth()
  viewWeekStart.value = getWeekStart(now)
  viewDayDate.value = new Date(now)
}

// ─── Mobile swipe navigation ────────────────────────────────────────────
const calendarBodyRef = ref<HTMLElement | null>(null)

useSwipe(calendarBodyRef, {
  threshold: 50,
  onSwipeEnd(_event, direction) {
    if (direction === 'left') goNext()
    else if (direction === 'right') goPrev()
  }
})

// ─── Modals / Popovers ─────────────────────────────────────────────────
const calendarCreateOpen = ref(false)
const calendarToEdit = ref<Calendar | null>(null)
const calendarToArchive = ref<Calendar | null>(null)
const eventCreateOpen = ref(false)
const eventCreatePrefill = ref<{ title: string, startAt: Date | null, location: string | null } | null>(null)
const eventDetailOpen = ref(false)

function onQuickAddParsed(result: { title: string, startAt: Date | null, location: string | null }) {
  eventCreatePrefill.value = result
  eventCreateOpen.value = true
}
const eventDetailLoading = ref(false)
const calendarsExpanded = ref(false)
const isMobile = useMediaQuery('(max-width: 1023px)')
const selectedEvent = ref<CalendarEvent | null>(null)
// The recurring series' actual master row (real DTSTART/DTEND) — GET
// /events/[id] always returns the master, never a specific occurrence's
// time (see server/api/appointments/events/[id].get.ts), so this is kept
// separately from `selectedEvent` (which shows the *clicked occurrence's*
// date/time) purely so "editar todas as ocorrências" can shift the series'
// real anchor instead of overwriting it with whichever occurrence was open.
const selectedEventSeriesRoot = ref<CalendarEvent | null>(null)

// Event popover state
const eventPopoverVisible = ref(false)
const eventPopoverEvent = ref<CalendarEvent | null>(null)
const eventPopoverPosition = ref({ x: 0, y: 0 })

// Quick create popover state
const quickCreateVisible = ref(false)
const quickCreateDate = ref('')
// Only set when creation started from a Day-view slot click — Month/Week
// slots have no time granularity, so this stays null and onQuickCreate()
// falls back to a default time.
const quickCreateTime = ref<string | null>(null)
const quickCreatePosition = ref({ x: 0, y: 0 })

// Day events (month view "+X mais") popover state
const dayEventsVisible = ref(false)
const dayEventsDate = ref('')
const dayEventsList = ref<CalendarEvent[]>([])
const dayEventsPosition = ref({ x: 0, y: 0 })

const selectedCalendarId = computed(() => activeCalendarIds.value[0] ?? '')

function onSelectEvent(evt: CalendarEvent, mouseEvent: MouseEvent) {
  if (evt.calendarId === JOURNAL_MARKER_CALENDAR_ID) {
    navigateTo('/app/journal')
    return
  }

  // Close quick create / day-events popovers if open
  quickCreateVisible.value = false
  dayEventsVisible.value = false

  eventPopoverEvent.value = evt
  eventPopoverPosition.value = { x: mouseEvent.clientX, y: mouseEvent.clientY }
  eventPopoverVisible.value = true
}

function onSelectSlot(date: string, mouseEvent: MouseEvent) {
  // Close event popover if open
  eventPopoverVisible.value = false

  quickCreateDate.value = date
  quickCreateTime.value = null
  quickCreatePosition.value = { x: mouseEvent.clientX, y: mouseEvent.clientY }
  quickCreateVisible.value = true
}

function onExpandDay(date: string, events: CalendarEvent[], mouseEvent: MouseEvent) {
  eventPopoverVisible.value = false
  quickCreateVisible.value = false

  dayEventsDate.value = date
  dayEventsList.value = events
  dayEventsPosition.value = { x: mouseEvent.clientX, y: mouseEvent.clientY }
  dayEventsVisible.value = true
}

function closeDayEvents() {
  dayEventsVisible.value = false
}

function onDayEventsSelectEvent(evt: CalendarEvent, mouseEvent: MouseEvent) {
  dayEventsVisible.value = false
  onSelectEvent(evt, mouseEvent)
}

function onDaySlotSelect(date: string, time: string, mouseEvent: MouseEvent) {
  eventPopoverVisible.value = false
  quickCreateDate.value = date
  quickCreateTime.value = time
  quickCreatePosition.value = { x: mouseEvent.clientX, y: mouseEvent.clientY }
  quickCreateVisible.value = true
}

function closeEventPopover() {
  eventPopoverVisible.value = false
  eventPopoverEvent.value = null
}

function closeQuickCreate() {
  quickCreateVisible.value = false
}

// Any popover left open while the user scrolls the calendar area is anchored
// to a stale click position (or a day cell that's since scrolled away) — it
// makes no sense to land on a new date/week and still see the old popup, so
// scrolling anywhere inside the calendar body closes all of them. Attached
// with `capture: true` on the calendar body wrapper: the `scroll` event
// doesn't bubble, but a capture-phase listener on an ancestor still sees it
// fire on any scrollable descendant (the month/week/day view's own
// `overflow-auto`/`overflow-y-auto` containers included).
function closeAllPopovers() {
  eventPopoverVisible.value = false
  quickCreateVisible.value = false
  dayEventsVisible.value = false
}

onMounted(() => {
  calendarBodyRef.value?.addEventListener('scroll', closeAllPopovers, true)
})

onBeforeUnmount(() => {
  calendarBodyRef.value?.removeEventListener('scroll', closeAllPopovers, true)
})

async function onPopoverEdit(evt: CalendarEvent) {
  closeEventPopover()
  selectedEvent.value = evt
  selectedEventSeriesRoot.value = null
  eventDetailOpen.value = true
  eventDetailLoading.value = true

  try {
    const detail = await fetchEventDetail(evt.id)
    if (detail && selectedEvent.value?.id === evt.id) {
      selectedEventSeriesRoot.value = detail
      selectedEvent.value = {
        ...detail,
        // Keep the CLICKED OCCURRENCE's own date/time, not the series'
        // master row's — `detail.startAt`/`endAt` is always the recurring
        // series' real DTSTART/DTEND (see events/[id].get.ts, which reads
        // the master row directly), never the specific occurrence that was
        // opened. The edit form has to reflect what was actually clicked, or
        // "somente esta ocorrência"/"esta e as seguintes" silently apply
        // against the wrong date. `selectedEventSeriesRoot` carries the real
        // DTSTART/DTEND separately, for the "todas as ocorrências" scope.
        startAt: evt.startAt,
        endAt: evt.endAt,
        recurrenceId: evt.recurrenceId ?? detail.recurrenceId ?? null,
        isRecurring: evt.isRecurring ?? detail.isRecurring,
        isCancelled: evt.isCancelled ?? detail.isCancelled
      }
    }
  } finally {
    eventDetailLoading.value = false
  }
}

async function onPopoverArchive(evt: CalendarEvent) {
  closeEventPopover()
  const success = await archiveEvent(evt.id)
  if (success) {
    refreshEvents()
  }
}

async function onPopoverDuplicate(evt: CalendarEvent) {
  closeEventPopover()
  const timezone = detectBrowserTimeZone() ?? 'UTC'

  const payload: CreateEventPayload = {
    calendarId: evt.calendarId,
    title: `${evt.title} (cópia)`,
    description: evt.description ?? undefined,
    location: evt.location ?? undefined,
    startAt: evt.startAt,
    endAt: evt.endAt,
    eventTimezone: evt.eventTimezone || timezone,
    allDay: evt.allDay,
    rrule: evt.rrule ?? undefined
  }

  const result = await createEvent(payload)
  if (result) {
    refreshEvents()
  }
}

// One hour after `time`, clamped to 23:59 same day — quick-create keeps
// the event on the day the user clicked rather than rolling into tomorrow.
function addOneHourClamped(time: string): string {
  const [h, m] = time.split(':').map(Number)
  const totalMinutes = Math.min((h ?? 0) * 60 + (m ?? 0) + 60, 23 * 60 + 59)
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`
}

async function onQuickCreate(data: { title: string, date: string, calendarId: string }) {
  closeQuickCreate()
  const timezone = detectBrowserTimeZone() ?? 'UTC'
  // Day-view slot clicks carry the actual clicked time; Month/Week slots have
  // no time granularity and fall back to the previous fixed 09:00-10:00 default.
  const startTime = quickCreateTime.value ?? '09:00'
  const endTime = quickCreateTime.value ? addOneHourClamped(quickCreateTime.value) : '10:00'
  const payload: CreateEventPayload = {
    calendarId: data.calendarId,
    title: data.title,
    startAt: zonedDateTimeToUtcIso(data.date, startTime, timezone),
    endAt: zonedDateTimeToUtcIso(data.date, endTime, timezone),
    eventTimezone: timezone
  }

  const result = await createEvent(payload)
  if (result) {
    refreshEvents()
  }
}

function onQuickCreateMoreOptions(_date: string) {
  closeQuickCreate()
  eventCreateOpen.value = true
}

function onMonthChange(from: string, to: string) {
  setViewRange(from, to)
}

function onWeekChange(from: string, to: string) {
  setViewRange(from, to)
}

function onDayChange(from: string, to: string) {
  setViewRange(from, to)
}

function toggleCalendarsPanel() {
  calendarsExpanded.value = !calendarsExpanded.value
}

function onToggleCalendar(calendarId: string) {
  activeCalendarIds.value = selectedCalendarId.value === calendarId ? [] : [calendarId]
}

// ─── Journal entries as read-only markers ──────────────────────────────────
// Not synced into `events` (would require touching the E2EE journal flow) —
// just fetched and rendered as lightweight all-day markers reusing the same
// CalendarEvent-shaped list the views already render. Never shows title or
// content (may be encrypted ciphertext) — only the mood, which is a plain,
// unencrypted column.
const JOURNAL_MARKER_CALENDAR_ID = '__journal__'

const { data: journalEntriesData, refresh: refreshJournalEntries } = useFetch<{ data: JournalEntry[] }>('/api/journal/entries', {
  query: computed(() => ({
    from: viewFrom.value || undefined,
    to: viewTo.value || undefined,
    pageSize: 100
  })),
  lazy: true,
  immediate: false,
  key: 'appointments-journal-entries',
  watch: false,
  default: () => ({ data: [] })
})

watch([viewFrom, viewTo], () => {
  if (!viewFrom.value && !viewTo.value) return
  refreshJournalEntries()
})

function journalEntryToMarker(entry: JournalEntry): CalendarEvent {
  const moodOption = getMoodOption(entry.mood)
  const startAt = `${entry.entryDate}T00:00:00.000Z`
  const endAt = `${entry.entryDate}T23:59:59.000Z`

  return {
    id: `journal-${entry.id}`,
    calendarId: JOURNAL_MARKER_CALENDAR_ID,
    ownerUserId: '',
    title: moodOption ? `${moodOption.emoji} Diário` : 'Diário',
    description: null,
    location: null,
    startAt,
    endAt,
    eventTimezone: 'UTC',
    allDay: true,
    rrule: null,
    exdate: null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    archivedAt: null,
    calendar: {
      id: JOURNAL_MARKER_CALENDAR_ID,
      ownerUserId: '',
      name: 'Diário',
      description: null,
      color: '#a855f7',
      visibility: CalendarVisibility.Private,
      subscribeToken: null,
      subscribeEnabled: false,
      createdAt: '',
      updatedAt: '',
      archivedAt: null
    }
  }
}

const journalMarkers = computed(() => (journalEntriesData.value?.data ?? []).map(journalEntryToMarker))

const eventsList = computed(() => [...(eventsData.value?.data ?? []), ...journalMarkers.value])

function onCreateCalendar() {
  calendarToEdit.value = null
  calendarCreateOpen.value = true
}

function onEditCalendar(calendar: Calendar) {
  calendarToEdit.value = calendar
  calendarCreateOpen.value = true
}

function onArchiveCalendar(calendar: Calendar) {
  calendarToArchive.value = calendar
}

function onArchiveModalOpenUpdate(value: boolean) {
  if (!value) {
    calendarToArchive.value = null
  }
}

async function confirmArchiveCalendar() {
  if (!calendarToArchive.value) return

  const calendarId = calendarToArchive.value.id
  const success = await archiveCalendar(calendarId)

  if (success) {
    if (selectedCalendarId.value === calendarId) {
      activeCalendarIds.value = []
    }
    calendarToArchive.value = null
  }
}

async function onRestoreCalendar(calendar: Calendar) {
  await restoreCalendar(calendar.id)
}

async function onEventDrop(eventId: string, newStartAt: string, newEndAt: string) {
  if (eventId.startsWith('journal-')) return
  // Like useNotes' updateNote(), updateEvent() already applies the change to
  // the local store optimistically and reconciles it with the server's
  // response — no refreshEvents() needed here. A drag-and-drop refetch used
  // to flip eventsStatus to 'pending' and swap the whole calendar body for a
  // loading skeleton mid-drag.
  await updateEvent(eventId, { startAt: newStartAt, endAt: newEndAt })
}

async function onMonthEventDrop(eventId: string, newDate: string) {
  if (eventId.startsWith('journal-')) return
  const event = eventsList.value.find(e => e.id === eventId)
  if (!event) return
  const timeZone = getEventTimeZone(event)
  const origStart = getZonedDate(event.startAt, timeZone)
  const origEnd = getZonedDate(event.endAt, timeZone)
  const durationMs = origEnd.getTime() - origStart.getTime()
  const startTime = format(origStart, 'HH:mm')
  const newStart = getZonedDate(zonedDateTimeToUtcIso(newDate, startTime, timeZone), timeZone)
  const newEnd = addMilliseconds(newStart, durationMs)
  const endDate = format(newEnd, 'yyyy-MM-dd')
  const endTime = format(newEnd, 'HH:mm')
  await updateEvent(eventId, {
    startAt: zonedDateTimeToUtcIso(newDate, startTime, timeZone),
    endAt: zonedDateTimeToUtcIso(endDate, endTime, timeZone)
  })
}

onMounted(() => {
  refreshCalendars()
  refreshArchivedCalendars()
})
</script>

<template>
  <UDashboardPanel
    id="appointments"
    :ui="{ body: 'max-lg:gap-0 max-lg:p-0' }"
  >
    <template #header>
      <UDashboardNavbar title="Agenda">
        <template #leading>
          <AppSidebarCollapse />
        </template>

        <template #default>
          <!-- Navigation: today + arrows + period label (desktop; mobile gets its own row below) -->
          <AppointmentsDateNav
            :label="headerLabel"
            @prev="goPrev"
            @next="goNext"
            @today="goToday"
          />
        </template>

        <template #right>
          <!-- View mode (icon + tooltip) -->
          <div class="hidden items-center gap-0.5 rounded-lg border border-default p-0.5 lg:flex">
            <UTooltip
              v-for="mode in viewModes"
              :key="mode.value"
              :text="mode.label"
            >
              <UButton
                square
                :color="activeView === mode.value ? 'primary' : 'neutral'"
                :variant="activeView === mode.value ? 'soft' : 'ghost'"
                @click="activeView = mode.value"
              >
                <UIcon :name="mode.icon" class="size-5 shrink-0" />
              </UButton>
            </UTooltip>
          </div>

          <!-- Public scheduling pages -->
          <UTooltip text="Link de agendamento" class="hidden lg:flex">
            <UButton
              square
              color="neutral"
              variant="ghost"
              icon="i-lucide-calendar-clock"
              to="/app/scheduling"
            />
          </UTooltip>

          <!-- Calendar sidebar toggle -->
          <UTooltip text="Calendários" class="hidden lg:flex">
            <UButton
              color="neutral"
              variant="ghost"
              square
              :class="calendarsExpanded ? 'text-primary' : ''"
              @click="toggleCalendarsPanel"
            >
              <UIcon name="i-lucide-calendar-range" class="size-5 shrink-0" />
            </UButton>
          </UTooltip>

          <!-- Mobile: overflow menu for less-frequent actions -->
          <UDropdownMenu
            class="lg:hidden"
            :items="[[
              { label: 'Calendários', icon: 'i-lucide-calendar-range', onSelect: () => toggleCalendarsPanel() }
            ]]"
            :content="{ align: 'end' }"
          >
            <UButton
              square
              color="neutral"
              variant="ghost"
              icon="i-lucide-ellipsis-vertical"
              aria-label="Mais opções"
            />
          </UDropdownMenu>

          <!-- Quick add (natural language) -->
          <AppointmentsQuickAddPopover @parsed="onQuickAddParsed" />

          <!-- New event (mobile: a floating action button takes over instead, see below) -->
          <UTooltip text="Novo evento" class="hidden lg:flex">
            <UButton
              square
              icon="i-lucide-plus"
              @click="eventCreateOpen = true; eventCreatePrefill = null"
            />
          </UTooltip>

          <!-- Notifications always last -->
          <NotificationsButton />
        </template>
      </UDashboardNavbar>

      <!-- Mobile: date navigation gets its own row (hidden in the crowded navbar's #default) -->
      <div class="flex items-center border-b border-default px-4 py-2 lg:hidden">
        <AppointmentsDateNav
          :label="headerLabel"
          @prev="goPrev"
          @next="goNext"
          @today="goToday"
        />
      </div>
    </template>

    <template #body>
      <div class="flex h-full flex-col">
        <!-- Offline / pending sync indicator -->
        <div
          v-if="!isOnline || pendingSyncCount > 0"
          class="flex shrink-0 items-center gap-1.5 px-4 py-1.5 text-xs"
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

        <div class="flex min-h-0 flex-1">
          <!-- Sidebar: Calendar list (desktop only — a bottom drawer takes over on mobile below) -->
          <div
            v-if="calendarsExpanded && !isMobile"
            class="w-56 shrink-0 border-r border-default p-3 overflow-y-auto"
          >
            <AppointmentsCalendarList
              :calendars="calendars"
              :archived-calendars="archivedCalendars"
              :loading="calendarsStatus === 'pending'"
              :archived-loading="archivedCalendarsStatus === 'pending'"
              :active-calendar-id="selectedCalendarId"
              @create="onCreateCalendar"
              @toggle="onToggleCalendar"
              @archive="onArchiveCalendar"
              @edit="onEditCalendar"
              @restore="onRestoreCalendar"
            />
          </div>

          <!-- Main calendar area -->
          <div ref="calendarBodyRef" class="relative min-w-0 flex-1 overflow-hidden">
            <!-- No `mode="wait"` here on purpose: it made the outgoing view fully
                 fade/slide out before the incoming one even started, so every single
                 prev/next/day tap paid the full transition duration twice in a row.
                 Default (simultaneous) mode crossfades both at once — `absolute inset-0`
                 on each is what lets them overlap the same space while that happens. -->
            <AnimatePresence>
              <motion.div
                :key="calendarViewKey"
                class="absolute inset-0 overflow-auto p-0 lg:p-2"
                :initial="calendarSlideInitial"
                :animate="{ opacity: 1, x: 0 }"
                :exit="calendarSlideExit"
                :transition="calendarSlideTransition"
              >
                <!-- Month view -->
                <AppointmentsMonthView
                  v-if="activeView === 'month'"
                  :events="eventsList"
                  :loading="eventsInitialLoading"
                  :current-date="new Date()"
                  :view-year="viewYear"
                  :view-month="viewMonth"
                  @select-event="onSelectEvent"
                  @select-slot="onSelectSlot"
                  @expand-day="onExpandDay"
                  @month-change="onMonthChange"
                  @drop-event="onMonthEventDrop"
                />

                <!-- Week view -->
                <AppointmentsWeekView
                  v-if="activeView === 'week'"
                  :events="eventsList"
                  :loading="eventsInitialLoading"
                  :week-start-date="viewWeekStart"
                  @select-event="onSelectEvent"
                  @select-slot="onSelectSlot"
                  @week-change="onWeekChange"
                  @drop-event="onEventDrop"
                />

                <!-- Day view -->
                <AppointmentsDayView
                  v-if="activeView === 'day'"
                  :events="eventsList"
                  :loading="eventsInitialLoading"
                  :current-date="viewDayDate"
                  @select-event="onSelectEvent"
                  @select-slot="onDaySlotSelect"
                  @day-change="onDayChange"
                  @drop-event="onEventDrop"
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Mobile: floating "new event" button, replaces the navbar action -->
  <UButton
    v-if="isMobile"
    icon="i-lucide-plus"
    size="xl"
    square
    class="fixed z-30 size-14 items-center justify-center rounded-full shadow-lg shadow-black/30"
    :style="{
      right: 'calc(1rem + var(--safe-area-right, 0px))',
      bottom: 'calc(var(--mobile-bottom-nav-height, 4.75rem) + 1rem)'
    }"
    aria-label="Novo evento"
    @click="eventCreateOpen = true; eventCreatePrefill = null"
  />

  <!-- Calendar list: bottom drawer on mobile (mirrors the desktop sidebar above) -->
  <UDrawer
    v-if="isMobile"
    :open="calendarsExpanded"
    direction="bottom"
    title="Calendários"
    @update:open="(value: boolean) => { calendarsExpanded = value }"
  >
    <template #body>
      <div class="max-h-[70vh] overflow-y-auto">
        <AppointmentsCalendarList
          :calendars="calendars"
          :archived-calendars="archivedCalendars"
          :loading="calendarsStatus === 'pending'"
          :archived-loading="archivedCalendarsStatus === 'pending'"
          :active-calendar-id="selectedCalendarId"
          @create="onCreateCalendar"
          @toggle="onToggleCalendar"
          @archive="onArchiveCalendar"
          @edit="onEditCalendar"
          @restore="onRestoreCalendar"
        />
      </div>
    </template>
  </UDrawer>

  <!-- Event popover (Google Calendar style) -->
  <AppointmentsEventPopover
    :event="eventPopoverEvent"
    :position="eventPopoverPosition"
    :visible="eventPopoverVisible"
    @close="closeEventPopover"
    @edit="onPopoverEdit"
    @archive="onPopoverArchive"
    @duplicate="onPopoverDuplicate"
  />

  <!-- Day events popover (month view "+X mais", Google Calendar style) -->
  <AppointmentsDayEventsPopover
    :date="dayEventsDate"
    :events="dayEventsList"
    :position="dayEventsPosition"
    :visible="dayEventsVisible"
    @close="closeDayEvents"
    @select-event="onDayEventsSelectEvent"
  />

  <!-- Quick create popover -->
  <AppointmentsQuickCreatePopover
    :visible="quickCreateVisible"
    :position="quickCreatePosition"
    :date="quickCreateDate"
    :calendars="calendars"
    @close="closeQuickCreate"
    @create="onQuickCreate"
    @more-options="onQuickCreateMoreOptions"
  />

  <!-- Modals -->
  <AppointmentsCalendarCreateModal
    :open="calendarCreateOpen"
    :calendars="calendars"
    :calendar="calendarToEdit"
    @update:open="calendarCreateOpen = $event"
    @created="refreshCalendars"
    @updated="refreshCalendars"
  />

  <UModal
    :open="Boolean(calendarToArchive)"
    title="Arquivar calendário"
    description="Os eventos deste calendário ficarão ocultos até que o calendário seja restaurado."
    @update:open="onArchiveModalOpenUpdate"
  >
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancelar"
          color="neutral"
          variant="outline"
          @click="calendarToArchive = null"
        />
        <UButton
          label="Arquivar"
          color="error"
          icon="i-lucide-archive"
          @click="confirmArchiveCalendar"
        />
      </div>
    </template>
  </UModal>

  <AppointmentsEventCreateModal
    :open="eventCreateOpen"
    :calendars="calendars"
    :prefill="eventCreatePrefill"
    @update:open="eventCreateOpen = $event"
    @created="refreshEvents"
  />

  <AppointmentsEventDetailSlideover
    :open="eventDetailOpen"
    :event="selectedEvent"
    :series-root="selectedEventSeriesRoot"
    :loading="eventDetailLoading"
    :calendars="calendars"
    @update:open="eventDetailOpen = $event"
    @updated="refreshEvents"
    @archived="refreshEvents"
  />
</template>

<!--
  TO DO

  ========================
  ⚡ Performance
  ========================

  - Ao abrir a página estão sendo disparados múltiplos requests desnecessários.
    É necessário otimizar o carregamento inicial para evitar requisições repetidas.

  ========================
  📅 Calendário / Eventos
  ========================

  - Na tab de Agenda:
    - Deve ser possível editar completamente um evento ao clicar nele.
    - Todas as informações do evento devem ser exibidas corretamente.

  - Corrigir erro de "Invalid Date" na visualização da Agenda.

  - Na visualização de Mês:
    - Os dados estão sendo retornados pela API, porém os eventos não estão sendo renderizados.

  - Na visualização de Semana:
    - Os dados estão sendo retornados pela API, porém os eventos não estão sendo renderizados.

  - Quando alterar o dia selecionado, os eventos não estão sendo atualizados corretamente.

  - Corrigir erro 500 ao tentar duplicar um evento.

  - Implementar suporte a arrastar e soltar (drag and drop) para alterar data ou horário dos eventos.

  - Ao clicar em um evento:
    - Deve abrir um **HoverCard** semelhante ao Google Calendar.
    - O card deve conter:
      - Informações do evento
      - Botões de **editar**, **remover** e **duplicar**.

  - Ao clicar em um espaço vazio do calendário:
    - Deve abrir um **HoverCard para criação de evento**.
    - A data (e horário, quando aplicável) deve ser preenchida automaticamente.

  - No modo **Dia**, ao clicar em um espaço vazio:
    - O horário correspondente ao local clicado deve ser utilizado para criar o evento.

  - A seleção de data deve ser facilitada nos modos **Semana** e **Mês**, onde há muitos dias visíveis.

  - O layout da visualização **Semana** deve seguir o padrão do Google Calendar,
    exibindo a grade de horários na lateral esquerda, semelhante ao modo Dia.

  - Não é necessário manter três abas separadas (Agenda, Semana, Mês).
    O gerenciamento deve ser centralizado em um único calendário com alternância de visualização.

  - O usuário deve poder alternar entre **Dia / Semana / Mês**, e essa preferência deve ser persistida
    para melhorar a experiência na próxima visita.

  - O sistema deve seguir padrões de interação semelhantes ao **Google Calendar**,
    já que a maioria dos usuários está familiarizada com esse modelo.

  - O histórico dos eventos deve ser preservado para permitir visualização correta de dados passados,
    mesmo após alterações.

  ========================
  🗂️ Calendários / Filtros
  ========================

  - A seção de calendários está ocupando muito espaço.
    Deve ser **colapsada por padrão** e expandida apenas quando o usuário desejar.

  - Ao clicar em um calendário:
    - Ele deve ficar ativo e exibir apenas os eventos relacionados a ele.

  - Deve ser possível selecionar **apenas um calendário por vez**.

  - Ao remover a seleção:
    - Todos os calendários devem voltar a ser exibidos.

  - Hábitos devem ser considerados um **tipo de calendário**.
    Assim, deve ser possível filtrar eventos apenas de hábitos.

  - Os hábitos devem possuir **uma cor específica reservada**,
    que não pode ser utilizada por calendários comuns,
    facilitando a identificação visual.

  ========================
  🧠 Integração com Hábitos
  ========================

  - Hábitos com horário definido devem aparecer na agenda.

  - Deve ser possível marcar diretamente no calendário se o hábito foi:
    - Concluído
    - Não concluído

  - Deve ser possível alterar o horário de um hábito em um dia específico.

  - Hábitos sem horário definido devem aparecer no topo do dia,
    semelhante ao comportamento de **tarefas no Google Calendar**.

  - Se um hábito fizer parte de um **empilhamento (habit stacking)**:
    - Caso o primeiro hábito tenha horário definido,
    - os demais hábitos devem aparecer empilhados abaixo dele,
      utilizando o mesmo horário como referência visual.

  ========================
  🧭 Navegação / Layout
  ========================

  - A sidebar lateral de navegação deve iniciar **colapsada por padrão**.

  - A sidebar deve expandir:
    - ao passar o mouse sobre ela
    - ou quando o usuário clicar para expandir manualmente.

  ---

  - Deve ser possível selecionar um icon como se fosse uma avatar para o Evento.

-->
