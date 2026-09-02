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
  snapMinutes,
  type PositionedEvent
} from '~/composables/useCalendarLayout'
import { usePinchZoom, useCalendarZoom } from '~/composables/useCalendarZoom'

const { hourHeight, setHourHeight } = useCalendarZoom()

const props = defineProps<{
  events: CalendarEvent[]
  loading: boolean
  currentDate: Date
}>()

const emit = defineEmits<{
  selectEvent: [event: CalendarEvent, mouseEvent: MouseEvent]
  selectSlot: [date: string, time: string, mouseEvent: MouseEvent]
  dayChange: [from: string, to: string]
  dropEvent: [eventId: string, newStartAt: string, newEndAt: string, recurrenceId: string | null]
}>()

const viewDate = ref(new Date(props.currentDate))

const dayStr = computed(() => formatDate(viewDate.value))

function formatDate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

function emitRange() {
  emit('dayChange', dayStr.value, dayStr.value)
}

watch(() => props.currentDate, (d) => {
  viewDate.value = new Date(d)
  emitRange()
})

onMounted(() => emitRange())

const hours = Array.from({ length: 24 }, (_, i) => i)

// ─── All-day vs timed events ──────────────────────────────────────────────
// Real UTC instants on both sides, day boundaries computed in the *event's
// own* zone — see the matching comment in MonthView.vue's getDayEvents().
// `dayStart`/`dayEnd` used to be built from the viewer's system timezone via
// `startOfDay`, then compared against `getZonedDate`'s event-zone reading —
// only correct when eventTimezone matched the viewer's own zone.
function isOnDay(evt: CalendarEvent): boolean {
  if (!evt.startAt || !evt.endAt) return false
  const timeZone = getEventTimeZone(evt)
  const dateStr = formatDate(viewDate.value)
  const nextDateStr = formatDate(addDays(viewDate.value, 1))
  const dayStart = new Date(zonedDateTimeToUtcIso(dateStr, '00:00', timeZone)).getTime()
  const dayEnd = new Date(zonedDateTimeToUtcIso(nextDateStr, '00:00', timeZone)).getTime()
  const evtStart = new Date(evt.startAt).getTime()
  const evtEnd = new Date(evt.endAt).getTime()
  return evtStart < dayEnd && evtEnd > dayStart
}

const allDayEvents = computed(() => props.events.filter(e => e.allDay && isOnDay(e)))
const timedEvents = computed(() => layoutTimedEvents(props.events.filter(e => !e.allDay && isOnDay(e))))

// ─── Current time ─────────────────────────────────────────────────────────
const isToday = computed(() => isSameDay(viewDate.value, new Date()))

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
// `active` only flips true once the pointer has moved past DRAG_ACTIVATION_PX
// from where it went down (see onPointerMove) — a plain tap-to-open never
// crosses it, so the ghost/ ~30% opacity dip no longer flashes on every tap,
// and `touch-none` on the event tile (template) stops the browser's own
// touch-scroll from fighting the drag on the very same vertical axis.
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
  targetMinutes: 0,
  originalStart: ''
})

const gridRef = ref<HTMLElement | null>(null)

// Auto-scroll while dragging near the top/bottom edge of the time grid —
// without this, rescheduling to an hour outside the currently visible slice
// meant abandoning the drag, scrolling manually, then starting over.
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
  const col = gridRef.value?.querySelector<HTMLElement>('[data-day-col]')
  if (!col) return { display: 'none' }
  const colRect = col.getBoundingClientRect()
  const scrollEl = gridRef.value?.querySelector<HTMLElement>('[data-scroll-body]')
  const scrollTop = scrollEl?.scrollTop ?? 0
  const bodyRect = scrollEl?.getBoundingClientRect()
  const topInViewport = bodyRect
    ? bodyRect.top + (drag.targetMinutes / 60) * hourHeight.value - scrollTop
    : 0

  return {
    position: 'fixed' as const,
    left: `${colRect.left + 2}px`,
    top: `${topInViewport}px`,
    width: `${colRect.width - 4}px`,
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
  const newStart = new Date(
    viewDate.value.getFullYear(),
    viewDate.value.getMonth(),
    viewDate.value.getDate(),
    0,
    drag.targetMinutes
  )
  const timeZone = getEventTimeZone(drag.event)
  if (newStart.getTime() === getZonedDate(drag.originalStart, timeZone).getTime()) return
  const newEnd = addMilliseconds(newStart, drag.durationMs)
  const dateStr = formatDate(newStart)
  const startTime = format(newStart, 'HH:mm')
  const endTime = format(newEnd, 'HH:mm')
  emit('dropEvent', drag.event.id, zonedDateTimeToUtcIso(dateStr, startTime, timeZone), zonedDateTimeToUtcIso(formatDate(newEnd), endTime, timeZone), drag.event.recurrenceId ?? null)
}

function endDrag() {
  drag.active = false
  drag.event = null
  drag.pointerId = -1
  stopAutoScroll()
}

function getSnappedMinutes(clientY: number): number {
  const scrollEl = gridRef.value?.querySelector<HTMLElement>('[data-scroll-body]')
  if (!scrollEl) return 0
  const rect = scrollEl.getBoundingClientRect()
  const scrollTop = scrollEl.scrollTop
  const relY = clientY - rect.top + scrollTop
  return Math.max(0, Math.min(1425, snapMinutes((relY / hourHeight.value) * 60)))
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && drag.active) endDrag()
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

// ─── Slot and event click ─────────────────────────────────────────────────
function onSlotClick(hour: number, e: MouseEvent) {
  if (drag.active) return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const offsetY = e.clientY - rect.top
  const minutes = snapMinutes(Math.floor((offsetY / hourHeight.value) * 60))
  const h = String(hour).padStart(2, '0')
  const m = String(minutes % 60).padStart(2, '0')
  emit('selectSlot', dayStr.value, `${h}:${m}`, e)
}

function onEventClick(evt: CalendarEvent, e: MouseEvent) {
  if (drag.active) return
  e.stopPropagation()
  emit('selectEvent', evt, e)
}

function getEventColor(evt: CalendarEvent): string {
  return evt.calendar?.color ?? '#10b981'
}

function getEventStyle(evt: PositionedEvent) {
  const color = getEventColor(evt)
  const top = getEventTopPx(evt, viewDate.value, hourHeight.value)
  const height = getEventHeightPx(evt, viewDate.value, hourHeight.value)
  const isDragging = drag.active && drag.event?.id === evt.id

  // Day column occupies (100% - 3rem). leftRatio/widthRatio are fractions of that column.
  return {
    position: 'absolute' as const,
    top: `${top}px`,
    height: `${height}px`,
    left: `calc(3rem + ${evt.leftRatio} * (100% - 3rem) + 2px)`,
    width: `calc(${evt.widthRatio} * (100% - 3rem) - 4px)`,
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

defineExpose({ viewDate })
</script>

<template>
  <div
    class="min-h-[calc(var(--app-visual-height,100dvh)-var(--ui-header-height)-var(--mobile-bottom-nav-height,4.75rem))] overflow-hidden border-y border-default lg:min-h-0 lg:rounded-lg lg:border"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
  >
    <!-- Loading -->
    <div
      v-if="loading"
      class="min-h-[calc(var(--app-visual-height,100dvh)-var(--ui-header-height)-var(--mobile-bottom-nav-height,4.75rem))]"
    >
      <div class="flex items-start gap-2 border-b border-default/50 px-2 py-2 sm:gap-3 sm:px-3">
        <USkeleton class="h-3 w-10 shrink-0" />
        <div class="flex flex-1 flex-wrap gap-1">
          <USkeleton class="h-5 w-32 rounded" />
          <USkeleton class="h-5 w-24 rounded" />
        </div>
      </div>

      <div class="overflow-hidden">
        <div class="relative min-h-[calc(var(--app-visual-height,100dvh)-var(--ui-header-height)-var(--mobile-bottom-nav-height,4.75rem)-2.5rem)] sm:min-h-[calc(100vh-15rem)]">
          <div
            v-for="hour in hours"
            :key="hour"
            class="flex border-b border-default/30"
            :style="{ height: `${hourHeight}px` }"
          >
            <div class="w-10 shrink-0 pr-1 text-right sm:w-12 sm:pr-2">
              <USkeleton class="ml-auto mt-0 h-2 w-7" />
            </div>
            <div class="flex-1 border-l border-default/20" />
          </div>

          <USkeleton class="absolute left-11 right-2 top-16 h-16 rounded sm:left-14 sm:right-4" />
          <USkeleton class="absolute left-11 right-6 top-44 h-24 rounded sm:left-14 sm:right-10" />
          <USkeleton class="absolute left-11 right-14 top-[22rem] h-12 rounded sm:left-14 sm:right-24" />
        </div>
      </div>
    </div>

    <div v-else>
      <!-- All-day section -->
      <div
        v-if="allDayEvents.length"
        class="flex items-start gap-2 border-b border-default/50 px-2 py-1.5 sm:gap-3 sm:px-3"
      >
        <span class="w-10 shrink-0 text-right text-[10px] text-muted/60 pt-0.5">dia int.</span>
        <div class="flex flex-wrap gap-1">
          <div
            v-for="evt in allDayEvents"
            :key="evt.id"
            class="max-w-50 cursor-pointer truncate rounded px-2 py-0.5 text-xs font-medium text-white"
            :style="{ backgroundColor: getEventColor(evt) }"
            @click="onEventClick(evt, $event)"
          >
            {{ evt.title }}
          </div>
        </div>
      </div>

      <!-- Time grid -->
      <div ref="gridRef" class="overflow-hidden">
        <div
          data-scroll-body
          class="overflow-y-auto"
          style="max-height: calc(var(--app-visual-height, 100vh) - var(--ui-header-height) - var(--mobile-bottom-nav-height, 4.75rem) - 2.5rem)"
        >
          <div class="relative" :style="{ minHeight: `${24 * hourHeight}px` }">
            <!-- Hour rows -->
            <div
              v-for="hour in hours"
              :key="hour"
              class="flex cursor-pointer hover:bg-elevated/20"
              :class="hour < 23 ? 'border-b border-default/30' : ''"
              :style="{ height: `${hourHeight}px` }"
              @click="onSlotClick(hour, $event)"
            >
              <div class="w-10 shrink-0 pr-1 text-right sm:w-12 sm:pr-2">
                <span class="-translate-y-2 block select-none text-[10px] leading-none text-muted/60">
                  {{ formatHourLabel(hour) }}
                </span>
              </div>
              <div data-day-col class="flex-1 border-l border-default/20" />
            </div>

            <!-- Current time indicator -->
            <div
              v-if="isToday"
              class="pointer-events-none absolute left-10 right-0 z-10 flex items-center sm:left-12"
              :style="{ top: `${currentTimePx}px` }"
            >
              <div class="-ml-1 size-2 rounded-full bg-red-500 shadow-sm" />
              <div class="h-px flex-1 bg-red-500/80" />
            </div>

            <!-- Timed events -->
            <div
              v-for="evt in timedEvents"
              :key="`${evt.id}-${evt.recurrenceId ?? ''}`"
              class="touch-none overflow-hidden px-1 py-0.5 text-xs"
              :style="getEventStyle(evt)"
              @click.stop="onEventClick(evt, $event)"
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
  </div>

  <!-- Drag ghost -->
  <Teleport to="body">
    <div v-if="drag.active && drag.event" :style="ghostStyle" />
  </Teleport>
</template>
