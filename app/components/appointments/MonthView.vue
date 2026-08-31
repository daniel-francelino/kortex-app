<script setup lang="ts">
import { addDays, endOfMonth, endOfWeek, format, isAfter, isSameDay, isSameMonth, startOfMonth, startOfWeek } from 'date-fns'
import type { CalendarEvent } from '~/types/appointments'
import { formatEventTime as formatCalendarEventTime, formatZonedDateKey, getEventTimeZone, sortDayEvents, zonedDateTimeToUtcIso } from '~/utils/calendarEventTime'

const props = defineProps<{
  events: CalendarEvent[]
  loading: boolean
  currentDate: Date
  viewYear: number
  viewMonth: number
}>()

const emit = defineEmits<{
  selectEvent: [event: CalendarEvent, mouseEvent: MouseEvent]
  selectSlot: [date: string, mouseEvent: MouseEvent]
  expandDay: [date: string, events: CalendarEvent[], mouseEvent: MouseEvent]
  monthChange: [from: string, to: string]
  dropEvent: [eventId: string, newDate: string]
}>()

// ─── Helpers ──────────────────────────────────────────────────────────────
function formatDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

function emitRange() {
  const first = startOfMonth(new Date(props.viewYear, props.viewMonth, 1))
  const last = endOfMonth(first)
  const gridStart = startOfWeek(first, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(last, { weekStartsOn: 0 })
  emit('monthChange', formatDate(gridStart), formatDate(gridEnd))
}

watch([() => props.viewYear, () => props.viewMonth], () => emitRange())
onMounted(() => emitRange())

// ─── Calendar grid ────────────────────────────────────────────────────────
const dayHeaders = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

interface DayCell {
  date: Date
  dateStr: string
  day: number
  isCurrentMonth: boolean
  isToday: boolean
  events: CalendarEvent[]
}

const calendarGrid = computed((): DayCell[][] => {
  const first = startOfMonth(new Date(props.viewYear, props.viewMonth, 1))
  const last = endOfMonth(first)
  const today = new Date()

  const weeks: DayCell[][] = []
  let currentDate = startOfWeek(first, { weekStartsOn: 0 })

  for (let w = 0; w < 6; w++) {
    const week: DayCell[] = []
    for (let d = 0; d < 7; d++) {
      week.push({
        date: currentDate,
        dateStr: formatDate(currentDate),
        day: currentDate.getDate(),
        isCurrentMonth: isSameMonth(currentDate, first),
        isToday: isSameDay(currentDate, today),
        events: getDayEvents(currentDate)
      })
      currentDate = addDays(currentDate, 1)
    }
    weeks.push(week)
    if (isAfter(currentDate, last) && currentDate.getDay() === 0) break
  }

  return weeks
})

function getDayEvents(date: Date): CalendarEvent[] {
  if (!props.events?.length) return []
  const dateStr = formatDate(date)
  const nextDateStr = formatDate(addDays(date, 1))

  const dayEvents = props.events.filter((evt: CalendarEvent) => {
    if (!evt.startAt || !evt.endAt) return false
    // Real UTC instants on both sides, not `getZonedDate`'s "fake local"
    // Date (whose local getters read as the event's own zone's wall clock,
    // built for extracting hour/minute for display — not for comparing
    // against a plain local-constructor Date). `dayStart`/`dayEnd` used to
    // be built from the *viewer's* system timezone via `startOfDay`, then
    // compared straight against the event's own-zone reading — the two only
    // lined up when the event's `eventTimezone` matched the viewer's system
    // zone. Computing the day boundary in the event's own zone (once per
    // event, since different events can carry different zones) keeps every
    // comparison in the same real-instant space.
    const timeZone = getEventTimeZone(evt)
    const dayStart = new Date(zonedDateTimeToUtcIso(dateStr, '00:00', timeZone)).getTime()
    const dayEnd = new Date(zonedDateTimeToUtcIso(nextDateStr, '00:00', timeZone)).getTime()
    const evtStart = new Date(evt.startAt).getTime()
    const evtEnd = new Date(evt.endAt).getTime()
    return evtStart < dayEnd && evtEnd > dayStart
  })

  return sortDayEvents(dayEvents)
}

function getEventColor(evt: CalendarEvent): string {
  return evt.calendar?.color ?? '#10b981'
}

function formatEventTime(evt: CalendarEvent): string {
  return formatCalendarEventTime(evt)
}

// ─── Drag state (Pointer Events — works on touch, unlike native HTML5 DnD) ──
const dragEvent = ref<CalendarEvent | null>(null)
const dragOver = ref<string>('')
const dragPointerId = ref<number | null>(null)

function targetDateFromPoint(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y)
  const cell = el?.closest<HTMLElement>('[data-date]')
  return cell?.dataset.date ?? null
}

function startDrag(evt: CalendarEvent, e: PointerEvent) {
  dragEvent.value = evt
  dragPointerId.value = e.pointerId
  dragOver.value = formatZonedDateKey(evt.startAt, getEventTimeZone(evt))
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!dragEvent.value || e.pointerId !== dragPointerId.value) return
  const dateStr = targetDateFromPoint(e.clientX, e.clientY)
  if (dateStr) dragOver.value = dateStr
}

function onPointerUp(e: PointerEvent) {
  if (!dragEvent.value || e.pointerId !== dragPointerId.value) return
  const targetDate = targetDateFromPoint(e.clientX, e.clientY)
  const original = formatZonedDateKey(dragEvent.value.startAt, getEventTimeZone(dragEvent.value))
  if (targetDate && targetDate !== original) {
    emit('dropEvent', dragEvent.value.id, targetDate)
  }
  endDrag()
}

function onPointerCancel() {
  endDrag()
}

function endDrag() {
  dragEvent.value = null
  dragPointerId.value = null
  dragOver.value = ''
}

// ─── Click handlers ───────────────────────────────────────────────────────
function onDayClick(cell: DayCell, e: MouseEvent) {
  emit('selectSlot', cell.dateStr, e)
}

function onEventClick(evt: CalendarEvent, e: MouseEvent) {
  e.stopPropagation()
  emit('selectEvent', evt, e)
}

function onExpandDay(cell: DayCell, e: MouseEvent) {
  emit('expandDay', cell.dateStr, cell.events, e)
}

const MAX_VISIBLE = 4
</script>

<template>
  <div
    class="flex min-h-[calc(var(--app-visual-height,100dvh)-var(--ui-header-height)-var(--mobile-bottom-nav-height,4.75rem))] flex-col border-y border-default sm:min-h-[calc(100vh-12rem)] sm:rounded-lg sm:border"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
  >
    <!-- Loading -->
    <div v-if="loading" class="flex min-h-[calc(var(--app-visual-height,100dvh)-var(--ui-header-height)-var(--mobile-bottom-nav-height,4.75rem))] flex-col sm:min-h-[calc(100vh-12rem)]">
      <div class="grid grid-cols-7 border-b border-default bg-elevated/30">
        <div
          v-for="header in dayHeaders"
          :key="header"
          class="py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-muted sm:py-2.5 sm:text-[11px]"
        >
          {{ header }}
        </div>
      </div>

      <div class="grid flex-1 grid-cols-7 grid-rows-6">
        <div
          v-for="i in 42"
          :key="i"
          class="min-h-20 border-r border-b border-default/50 p-0.5 last:border-r-0 sm:min-h-24 sm:p-1.5"
          :class="i > 35 ? 'border-b-0' : ''"
        >
          <USkeleton class="mb-3 size-6 rounded-full" />
          <div class="space-y-1">
            <USkeleton
              v-if="i % 2 === 0"
              class="h-4 w-11/12 rounded-sm"
            />
            <USkeleton
              v-if="i % 3 === 0"
              class="h-4 w-2/3 rounded-sm"
            />
            <USkeleton
              v-if="i % 5 === 0"
              class="h-4 w-4/5 rounded-sm"
            />
          </div>
        </div>
      </div>
    </div>

    <template v-else>
      <!-- Day headers -->
      <div class="sticky top-0 z-10 grid grid-cols-7 border-b border-default bg-elevated/95 backdrop-blur-sm">
        <div
          v-for="header in dayHeaders"
          :key="header"
          class="py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-muted sm:py-2.5 sm:text-[11px]"
        >
          {{ header }}
        </div>
      </div>

      <!-- Weeks: natural per-row height (not squeezed to fit the viewport in
           one screen, unlike a fixed `1fr` split) so each day can actually
           show a few readable event bars — the whole grid scrolls, matching
           how Google Calendar's own month view behaves rather than clipping
           everything past row 1 to fit on one screen. -->
      <div
        class="grid"
        :style="{ gridTemplateRows: `repeat(${calendarGrid.length}, minmax(6rem, auto))` }"
      >
        <div
          v-for="(week, wi) in calendarGrid"
          :key="wi"
          class="grid grid-cols-7 border-b border-default/50 last:border-b-0"
        >
          <div
            v-for="cell in week"
            :key="cell.dateStr"
            :data-date="cell.dateStr"
            class="group min-h-24 cursor-pointer border-r border-default/50 p-0.5 transition-colors last:border-r-0 sm:min-h-28 sm:p-1.5"
            :class="[
              !cell.isCurrentMonth ? 'bg-muted/3' : 'hover:bg-elevated/40',
              dragOver === cell.dateStr ? 'bg-primary/10' : ''
            ]"
            @click="onDayClick(cell, $event)"
          >
            <!-- Date number -->
            <div class="mb-1">
              <span
                class="inline-flex size-5 items-center justify-center rounded-full text-[11px] font-medium transition-colors sm:size-6 sm:text-xs"
                :class="[
                  cell.isToday
                    ? 'bg-primary text-white'
                    : !cell.isCurrentMonth
                      ? 'text-muted/50'
                      : 'text-muted group-hover:bg-elevated'
                ]"
              >
                {{ cell.day }}
              </span>
            </div>

            <!-- Events: solid colored bars on every size, like Google Calendar's
                 own month view — text is truncated at this column width (same
                 as Google's), but a readable label beats an unreadable dot. -->
            <div class="space-y-0.5 sm:hidden">
              <div
                v-for="(evt, ei) in cell.events.slice(0, MAX_VISIBLE)"
                :key="ei"
                class="h-[15px] min-w-0 touch-none overflow-hidden rounded-[3px] px-1 text-[10px] font-medium leading-[15px] text-white transition-opacity"
                :class="dragEvent?.id === evt.id ? 'opacity-40' : ''"
                :style="{ backgroundColor: getEventColor(evt) }"
                :title="`${formatEventTime(evt)} ${evt.title}`"
                @click.stop="onEventClick(evt, $event)"
                @pointerdown.stop="startDrag(evt, $event)"
              >
                <span class="block truncate">{{ evt.title }}</span>
              </div>

              <!-- Overflow indicator -->
              <div
                v-if="cell.events.length > MAX_VISIBLE"
                class="cursor-pointer px-1 text-[10px] font-medium text-muted hover:text-highlighted"
                @click.stop="onExpandDay(cell, $event)"
              >
                +{{ cell.events.length - MAX_VISIBLE }}
              </div>
            </div>

            <div class="hidden space-y-0.5 sm:block">
              <div
                v-for="(evt, ei) in cell.events.slice(0, MAX_VISIBLE)"
                :key="ei"
                class="flex h-4 min-w-0 cursor-grab touch-none items-center gap-1 overflow-hidden rounded-sm px-1 text-[11px] leading-4 font-medium transition-opacity"
                :class="[evt.allDay ? 'text-white' : '', dragEvent?.id === evt.id ? 'opacity-40' : '']"
                :style="evt.allDay
                  ? { backgroundColor: getEventColor(evt) }
                  : { color: getEventColor(evt) }"
                :title="`${formatEventTime(evt)} ${evt.title}`"
                @click.stop="onEventClick(evt, $event)"
                @pointerdown.stop="startDrag(evt, $event)"
              >
                <!-- Dot for timed events -->
                <span
                  v-if="!evt.allDay"
                  class="inline-block size-1.5 shrink-0 rounded-full"
                  :style="{ backgroundColor: getEventColor(evt) }"
                />
                <span class="min-w-0 truncate">
                  <span v-if="!evt.allDay" class="mr-0.5 font-normal opacity-75">
                    {{ formatEventTime(evt) }}
                  </span>
                  {{ evt.title }}
                </span>
              </div>

              <!-- Overflow indicator -->
              <div
                v-if="cell.events.length > MAX_VISIBLE"
                class="cursor-pointer px-1 text-[11px] font-medium text-muted hover:text-highlighted"
                @click.stop="onExpandDay(cell, $event)"
              >
                +{{ cell.events.length - MAX_VISIBLE }} mais
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
