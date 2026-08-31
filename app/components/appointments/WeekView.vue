<script setup lang="ts">
import { addDays, addMilliseconds, format, isSameDay } from 'date-fns'
import type { CalendarEvent } from '~/types/appointments'
import { getEventTimeZone, getZonedDate, zonedDateTimeToUtcIso } from '~/utils/calendarEventTime'
import {
  layoutTimedEvents,
  getEventTopPx,
  getEventHeightPx,
  getCurrentTimePx,
  formatHourLabel,
  type PositionedEvent
} from '~/composables/useCalendarLayout'
import { usePinchZoom, useCalendarZoom } from '~/composables/useCalendarZoom'

const { hourHeight, setHourHeight } = useCalendarZoom()

const props = defineProps<{
  events: CalendarEvent[]
  loading: boolean
  weekStartDate: Date
}>()

const emit = defineEmits<{
  selectEvent: [event: CalendarEvent, mouseEvent: MouseEvent]
  selectSlot: [date: string, mouseEvent: MouseEvent]
  weekChange: [from: string, to: string]
  dropEvent: [eventId: string, newStartAt: string, newEndAt: string]
}>()

// ─── Helpers ──────────────────────────────────────────────────────────────
function formatDate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

function emitRange() {
  const from = formatDate(props.weekStartDate)
  const end = addDays(props.weekStartDate, 6)
  emit('weekChange', from, formatDate(end))
}

watch(() => props.weekStartDate, () => emitRange(), { immediate: false })
onMounted(() => emitRange())

// ─── Day columns ──────────────────────────────────────────────────────────
interface DayColumn {
  date: Date
  dateStr: string
  label: string
  dayNumber: number
  isToday: boolean
  allDayEvents: CalendarEvent[]
  timedEvents: PositionedEvent[]
}

const weekDays = computed((): DayColumn[] => {
  const today = new Date()

  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(props.weekStartDate, i)
    const dateStr = formatDate(date)
    const nextDateStr = formatDate(addDays(date, 1))

    // Real UTC instants on both sides — see the matching comment in
    // MonthView.vue's getDayEvents(). Day boundaries computed in the
    // *event's own* zone (not the viewer's system zone via startOfDay), so
    // the comparison against the event's real startAt/endAt is apples-to-apples
    // regardless of whether eventTimezone matches the viewer's own zone.
    const dayEvents = (props.events ?? []).filter((evt: CalendarEvent) => {
      if (!evt.startAt || !evt.endAt) return false
      const timeZone = getEventTimeZone(evt)
      const dayStart = new Date(zonedDateTimeToUtcIso(dateStr, '00:00', timeZone)).getTime()
      const dayEnd = new Date(zonedDateTimeToUtcIso(nextDateStr, '00:00', timeZone)).getTime()
      const evtStart = new Date(evt.startAt).getTime()
      const evtEnd = new Date(evt.endAt).getTime()
      return evtStart < dayEnd && evtEnd > dayStart
    })

    return {
      date,
      dateStr: formatDate(date),
      label: date.toLocaleDateString('pt-BR', { weekday: 'short' }),
      dayNumber: date.getDate(),
      isToday: isSameDay(date, today),
      allDayEvents: dayEvents.filter(e => e.allDay),
      timedEvents: layoutTimedEvents(dayEvents.filter(e => !e.allDay))
    }
  })
})

const hasAllDayEvents = computed(() => weekDays.value.some(d => d.allDayEvents.length > 0))
const hours = Array.from({ length: 24 }, (_, i) => i)

// ─── Current time indicator ───────────────────────────────────────────────
// Depends on hourHeight directly (recomputes on zoom) and on nowTick (bumped
// every minute) since plain elapsed time isn't itself a reactive trigger.
const nowTick = ref(Date.now())
const currentTimePx = computed(() => {
  void nowTick.value
  return getCurrentTimePx(hourHeight.value)
})
let timerId: ReturnType<typeof setInterval>
onMounted(() => {
  timerId = setInterval(() => {
    nowTick.value = Date.now()
  }, 60_000)
})
onUnmounted(() => clearInterval(timerId))

// ─── Drag state ───────────────────────────────────────────────────────────
// Same activation-threshold + auto-scroll approach as DayView.vue — see the
// comment there for why: a plain tap must never flip `active` (no
// ghost/opacity flash), and `touch-none` on the event tile (template) keeps
// the browser's own touch-scroll from fighting the drag on the same axis.
const DRAG_ACTIVATION_PX = 6
const EDGE_SCROLL_ZONE_PX = 44
const MAX_AUTOSCROLL_SPEED = 16

interface DragState {
  active: boolean
  event: CalendarEvent | null
  durationMs: number
  pointerId: number
  pointerStartX: number
  pointerStartY: number
  targetDayIndex: number
  targetMinutes: number
  originalStart: string
}

const drag = reactive<DragState>({
  active: false,
  event: null,
  durationMs: 0,
  pointerId: -1,
  pointerStartX: 0,
  pointerStartY: 0,
  targetDayIndex: 0,
  targetMinutes: 0,
  originalStart: ''
})

const gridRef = ref<HTMLElement | null>(null)

let lastPointerClientY = 0
let autoScrollRAF: number | null = null

function autoScrollTick() {
  if (!drag.active) {
    autoScrollRAF = null
    return
  }

  const scrollEl = gridRef.value?.querySelector<HTMLElement>('[data-scroll-body]')
  if (scrollEl) {
    const rect = scrollEl.getBoundingClientRect()
    const distTop = lastPointerClientY - rect.top
    const distBottom = rect.bottom - lastPointerClientY
    let scrolled = false

    if (distTop < EDGE_SCROLL_ZONE_PX && scrollEl.scrollTop > 0) {
      const strength = 1 - Math.max(distTop, 0) / EDGE_SCROLL_ZONE_PX
      scrollEl.scrollTop = Math.max(0, scrollEl.scrollTop - MAX_AUTOSCROLL_SPEED * strength)
      scrolled = true
    } else if (distBottom < EDGE_SCROLL_ZONE_PX && scrollEl.scrollTop < scrollEl.scrollHeight - scrollEl.clientHeight) {
      const strength = 1 - Math.max(distBottom, 0) / EDGE_SCROLL_ZONE_PX
      scrollEl.scrollTop = Math.min(scrollEl.scrollHeight - scrollEl.clientHeight, scrollEl.scrollTop + MAX_AUTOSCROLL_SPEED * strength)
      scrolled = true
    }

    if (scrolled) drag.targetMinutes = getSnappedMinutes(lastPointerClientY)
  }

  autoScrollRAF = requestAnimationFrame(autoScrollTick)
}

function startAutoScroll() {
  if (autoScrollRAF !== null) return
  autoScrollRAF = requestAnimationFrame(autoScrollTick)
}

function stopAutoScroll() {
  if (autoScrollRAF !== null) {
    cancelAnimationFrame(autoScrollRAF)
    autoScrollRAF = null
  }
}

const ghostStyle = computed(() => {
  if (!drag.active || !drag.event) return { display: 'none' }
  const color = drag.event.calendar?.color ?? '#10b981'
  const cols = gridRef.value?.querySelectorAll<HTMLElement>('[data-day-col]')
  const dayEl = cols?.[drag.targetDayIndex]
  if (!dayEl) return { display: 'none' }
  const rect = dayEl.getBoundingClientRect()
  const scrollEl = gridRef.value?.querySelector<HTMLElement>('[data-scroll-body]')
  const scrollOffset = scrollEl?.scrollTop ?? 0
  const bodyRect = scrollEl?.getBoundingClientRect()
  const topInViewport = bodyRect ? (bodyRect.top + (drag.targetMinutes / 60) * hourHeight.value - scrollOffset) : 0
  return {
    position: 'fixed' as const,
    left: `${rect.left + 2}px`,
    top: `${topInViewport}px`,
    width: `${rect.width - 4}px`,
    height: `${(drag.durationMs / 3_600_000) * hourHeight.value}px`,
    backgroundColor: color + '30',
    borderLeft: `3px solid ${color}`,
    borderRadius: '4px',
    zIndex: 9999,
    pointerEvents: 'none' as const,
    opacity: 0.85
  }
})

function startDrag(evt: CalendarEvent, e: PointerEvent) {
  e.stopPropagation()
  drag.active = false
  drag.event = evt
  drag.originalStart = evt.startAt
  const timeZone = getEventTimeZone(evt)
  drag.durationMs = getZonedDate(evt.endAt, timeZone).getTime() - getZonedDate(evt.startAt, timeZone).getTime()
  drag.pointerId = e.pointerId
  drag.pointerStartX = e.clientX
  drag.pointerStartY = e.clientY
  drag.targetDayIndex = getColIndexFromPointer(e)
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!drag.event || e.pointerId !== drag.pointerId) return

  if (!drag.active) {
    const dx = e.clientX - drag.pointerStartX
    const dy = e.clientY - drag.pointerStartY
    if (Math.hypot(dx, dy) < DRAG_ACTIVATION_PX) return
    drag.active = true
    startAutoScroll()
  }

  lastPointerClientY = e.clientY
  drag.targetDayIndex = getColIndexFromPointer(e)
  drag.targetMinutes = getSnappedMinutes(e.clientY)
}

function onPointerUp(e: PointerEvent) {
  if (!drag.event || e.pointerId !== drag.pointerId) return
  if (drag.active) commitDrop()
  endDrag()
}

function onPointerCancel() {
  endDrag()
}

function commitDrop() {
  if (!drag.event) return
  const targetDay = weekDays.value[drag.targetDayIndex]
  if (!targetDay) return
  const newStart = new Date(
    targetDay.date.getFullYear(),
    targetDay.date.getMonth(),
    targetDay.date.getDate(),
    0,
    drag.targetMinutes
  )
  const timeZone = getEventTimeZone(drag.event)
  if (newStart.getTime() === getZonedDate(drag.originalStart, timeZone).getTime()) return
  const newEnd = addMilliseconds(newStart, drag.durationMs)
  const dateStr = formatDate(newStart)
  const startTime = format(newStart, 'HH:mm')
  const endTime = format(newEnd, 'HH:mm')
  emit('dropEvent', drag.event.id, zonedDateTimeToUtcIso(dateStr, startTime, timeZone), zonedDateTimeToUtcIso(formatDate(newEnd), endTime, timeZone))
}

function endDrag() {
  drag.active = false
  drag.event = null
  drag.pointerId = -1
  stopAutoScroll()
}

function getColIndexFromPointer(e: PointerEvent): number {
  const cols = gridRef.value?.querySelectorAll<HTMLElement>('[data-day-col]')
  if (!cols) return 0
  for (let i = 0; i < cols.length; i++) {
    const rect = cols[i]!.getBoundingClientRect()
    if (e.clientX >= rect.left && e.clientX < rect.right) return i
  }
  return 0
}

function getSnappedMinutes(clientY: number): number {
  const scrollEl = gridRef.value?.querySelector<HTMLElement>('[data-scroll-body]')
  if (!scrollEl) return 0
  const rect = scrollEl.getBoundingClientRect()
  const scrollTop = scrollEl.scrollTop
  const relY = clientY - rect.top + scrollTop
  const raw = (relY / hourHeight.value) * 60
  return Math.max(0, Math.min(1425, Math.round(raw / 15) * 15))
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && drag.active) endDrag()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

// ─── Event/slot handlers ──────────────────────────────────────────────────
function onSlotClick(day: DayColumn, e: MouseEvent) {
  if (drag.active) return
  emit('selectSlot', day.dateStr, e)
}

function onEventClick(evt: CalendarEvent, e: MouseEvent) {
  if (drag.active) return
  e.stopPropagation()
  emit('selectEvent', evt, e)
}

function getEventColor(evt: CalendarEvent): string {
  return evt.calendar?.color ?? '#10b981'
}

function getEventStyle(evt: PositionedEvent, day: DayColumn) {
  const color = getEventColor(evt)
  const top = getEventTopPx(evt, day.date, hourHeight.value)
  const height = getEventHeightPx(evt, day.date, hourHeight.value)
  const isDragging = drag.active && drag.event?.id === evt.id

  return {
    position: 'absolute' as const,
    top: `${top}px`,
    height: `${height}px`,
    left: `calc(${evt.leftRatio * 100}% + 2px)`,
    width: `calc(${evt.widthRatio * 100}% - 4px)`,
    backgroundColor: color + '20',
    borderLeft: `3px solid ${color}`,
    borderRadius: '3px',
    zIndex: isDragging ? 1 : 5,
    opacity: isDragging ? 0.3 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
    userSelect: 'none' as const
  }
}

// ─── Pinch-to-zoom (mobile) ─────────────────────────────────────────────────
const scrollBodyRef = ref<HTMLElement | null>(null)
const { attach: attachPinchZoom, detach: detachPinchZoom } = usePinchZoom({
  scrollEl: scrollBodyRef,
  hourHeight,
  setHourHeight
})

onMounted(() => {
  scrollBodyRef.value = gridRef.value?.querySelector<HTMLElement>('[data-scroll-body]') ?? null
  if (scrollBodyRef.value) attachPinchZoom(scrollBodyRef.value)
})

onUnmounted(() => {
  if (scrollBodyRef.value) detachPinchZoom(scrollBodyRef.value)
})
</script>

<template>
  <div
    class="flex min-h-[calc(var(--app-visual-height,100dvh)-var(--ui-header-height)-var(--mobile-bottom-nav-height,4.75rem))] flex-col overflow-hidden border-y border-default lg:min-h-0 lg:rounded-lg lg:border"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
  >
    <!-- Loading -->
    <div
      v-if="loading"
      class="flex min-h-[calc(var(--app-visual-height,100dvh)-var(--ui-header-height)-var(--mobile-bottom-nav-height,4.75rem))] flex-col sm:min-h-[calc(100vh-12rem)]"
    >
      <div class="flex shrink-0 border-b border-default bg-elevated/30">
        <div class="w-10 shrink-0 sm:w-14" />
        <div
          v-for="day in weekDays"
          :key="day.dateStr"
          class="flex flex-1 flex-col items-center border-l border-default/30 py-2"
        >
          <USkeleton class="h-3 w-8" />
          <USkeleton class="mt-1 size-7 rounded-full" />
        </div>
      </div>

      <div class="flex min-h-8 shrink-0 border-b border-default/30 bg-default">
        <div class="w-10 shrink-0 sm:w-14" />
        <div
          v-for="day in weekDays"
          :key="`all-day-${day.dateStr}`"
          class="flex-1 border-l border-default/20 p-1"
        >
          <USkeleton
            v-if="day.dayNumber % 3 === 0"
            class="h-4 w-10/12 rounded-sm"
          />
        </div>
      </div>

      <div class="flex flex-1 overflow-hidden">
        <div class="w-10 shrink-0 sm:w-14">
          <div
            v-for="hour in hours"
            :key="hour"
            class="relative flex justify-end pr-1 sm:pr-2"
            :style="{ height: `${hourHeight}px` }"
          >
            <USkeleton class="absolute -top-1 h-2 w-7" />
          </div>
        </div>

        <div class="grid flex-1 grid-cols-7">
          <div
            v-for="(day, dayIndex) in weekDays"
            :key="`loading-${day.dateStr}`"
            class="relative border-l border-default/20"
          >
            <div
              v-for="hour in hours"
              :key="hour"
              class="border-b border-default/20"
              :style="{ height: `${hourHeight}px` }"
            />
            <USkeleton
              v-if="dayIndex % 2 === 0"
              class="absolute left-1 right-1 top-20 h-16 rounded"
            />
            <USkeleton
              v-if="dayIndex % 3 === 1"
              class="absolute left-1 right-1 top-56 h-24 rounded"
            />
            <USkeleton
              v-if="dayIndex % 4 === 2"
              class="absolute left-1 right-1 top-96 h-12 rounded"
            />
          </div>
        </div>
      </div>
    </div>

    <template v-else>
      <!-- ── Header ────────────────────────────────────────────── -->
      <div class="flex shrink-0 border-b border-default bg-elevated/30">
        <div class="w-10 shrink-0 sm:w-14" />
        <div
          v-for="day in weekDays"
          :key="day.dateStr"
          class="flex flex-1 flex-col items-center border-l border-default/30 py-2"
        >
          <span
            class="text-[10px] font-semibold uppercase tracking-wide"
            :class="day.isToday ? 'text-primary' : 'text-muted'"
          >
            {{ day.label }}
          </span>
          <span
            class="mt-0.5 flex size-7 items-center justify-center rounded-full text-sm font-semibold"
            :class="day.isToday ? 'bg-primary text-white' : 'text-highlighted'"
          >
            {{ day.dayNumber }}
          </span>
        </div>
      </div>

      <!-- ── All-day row ────────────────────────────────────────── -->
      <div
        v-if="hasAllDayEvents"
        class="flex shrink-0 border-b border-default/30 bg-default"
      >
        <div class="flex w-10 shrink-0 items-start justify-end pr-1 pt-1.5 sm:w-14 sm:pr-2">
          <span class="text-[10px] text-muted/60">dia int.</span>
        </div>
        <div
          v-for="day in weekDays"
          :key="day.dateStr"
          class="min-h-6 flex-1 border-l border-default/20 p-0.5"
        >
          <div
            v-for="evt in day.allDayEvents"
            :key="evt.id"
            class="mb-0.5 cursor-pointer truncate rounded px-1 py-px text-[11px] font-medium text-white"
            :style="{ backgroundColor: getEventColor(evt) }"
            @click="onEventClick(evt, $event)"
          >
            {{ evt.title }}
          </div>
        </div>
      </div>

      <!-- ── Scrollable body ───────────────────────────────────── -->
      <div ref="gridRef" class="overflow-hidden">
        <div data-scroll-body class="flex overflow-y-auto" style="max-height: calc(var(--app-visual-height, 100vh) - var(--ui-header-height) - var(--mobile-bottom-nav-height, 4.75rem) - 5.5rem)">
          <!-- Hour labels -->
          <div class="w-10 shrink-0 sm:w-14">
            <div
              v-for="hour in hours"
              :key="hour"
              class="relative flex justify-end pr-1 sm:pr-2"
              :style="{ height: `${hourHeight}px` }"
            >
              <span class="absolute -top-2 select-none text-[10px] leading-none text-muted/60">
                {{ formatHourLabel(hour) }}
              </span>
            </div>
          </div>

          <!-- Day columns -->
          <div class="flex flex-1">
            <div
              v-for="day in weekDays"
              :key="day.dateStr"
              data-day-col
              class="relative flex-1 border-l border-default/20"
              :class="day.isToday ? 'bg-primary/2' : ''"
            >
              <!-- Hour rows (click targets) -->
              <div
                v-for="hour in hours"
                :key="hour"
                class="cursor-pointer hover:bg-elevated/20"
                :class="hour < 23 ? 'border-b border-default/20' : ''"
                :style="{ height: `${hourHeight}px` }"
                @click="onSlotClick(day, $event)"
              />

              <!-- Current time line (today only) -->
              <div
                v-if="day.isToday"
                class="pointer-events-none absolute left-0 right-0 z-10 flex items-center"
                :style="{ top: `${currentTimePx}px` }"
              >
                <div class="-ml-1 size-2 rounded-full bg-red-500 shadow-sm" />
                <div class="h-px flex-1 bg-red-500/80" />
              </div>

              <!-- Timed events -->
              <div
                v-for="evt in day.timedEvents"
                :key="`${evt.id}-${evt.recurrenceId ?? ''}`"
                class="touch-none overflow-hidden px-1 py-0.5 text-xs"
                :style="getEventStyle(evt, day)"
                @click="onEventClick(evt, $event)"
                @pointerdown.stop="startDrag(evt, $event)"
              >
                <div
                  class="wrap-break-word font-semibold leading-tight"
                  :style="{ color: getEventColor(evt) }"
                >
                  {{ evt.title }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>

  <!-- Drag ghost (teleported to body) -->
  <Teleport to="body">
    <div
      v-if="drag.active && drag.event"
      :style="ghostStyle"
    />
  </Teleport>
</template>
