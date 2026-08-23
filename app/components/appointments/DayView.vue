<script setup lang="ts">
import type { CalendarEvent } from '~/types/appointments'
import {
  layoutTimedEvents,
  getEventTopPx,
  getEventHeightPx,
  getCurrentTimePx,
  formatHourLabel,
  snapMinutes,
  HOUR_HEIGHT,
  type PositionedEvent
} from '~/composables/useCalendarLayout'

const props = defineProps<{
  events: CalendarEvent[]
  loading: boolean
  currentDate: Date
}>()

const emit = defineEmits<{
  selectEvent: [event: CalendarEvent, mouseEvent: MouseEvent]
  selectSlot: [date: string, time: string, mouseEvent: MouseEvent]
  dayChange: [from: string, to: string]
  dropEvent: [eventId: string, newStartAt: string, newEndAt: string]
}>()

const viewDate = ref(new Date(props.currentDate))

const dayStr = computed(() => formatDate(viewDate.value))

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
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
function isOnDay(evt: CalendarEvent): boolean {
  if (!evt.startAt || !evt.endAt) return false
  const dayStart = new Date(viewDate.value.getFullYear(), viewDate.value.getMonth(), viewDate.value.getDate())
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)
  return new Date(evt.startAt) < dayEnd && new Date(evt.endAt) > dayStart
}

const allDayEvents = computed(() => props.events.filter(e => e.allDay && isOnDay(e)))
const timedEvents = computed(() => layoutTimedEvents(props.events.filter(e => !e.allDay && isOnDay(e))))

// ─── Current time ─────────────────────────────────────────────────────────
const isToday = computed(() => formatDate(new Date()) === dayStr.value)

const currentTimePx = ref(getCurrentTimePx())
let timerId: ReturnType<typeof setInterval>
onMounted(() => {
  timerId = setInterval(() => {
    currentTimePx.value = getCurrentTimePx()
  }, 60_000)
})
onUnmounted(() => clearInterval(timerId))

// ─── Drag state ───────────────────────────────────────────────────────────
interface DragState {
  active: boolean
  event: CalendarEvent | null
  durationMs: number
  pointerId: number
  targetMinutes: number
  originalStart: string
}

const drag = reactive<DragState>({
  active: false,
  event: null,
  durationMs: 0,
  pointerId: -1,
  targetMinutes: 0,
  originalStart: ''
})

const gridRef = ref<HTMLElement | null>(null)

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
    ? bodyRect.top + (drag.targetMinutes / 60) * HOUR_HEIGHT - scrollTop
    : 0

  return {
    position: 'fixed' as const,
    left: `${colRect.left + 2}px`,
    top: `${topInViewport}px`,
    width: `${colRect.width - 4}px`,
    height: `${Math.max((drag.durationMs / 3_600_000) * HOUR_HEIGHT, 20)}px`,
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
  drag.active = true
  drag.event = evt
  drag.originalStart = evt.startAt
  drag.durationMs = new Date(evt.endAt).getTime() - new Date(evt.startAt).getTime()
  drag.pointerId = e.pointerId
  drag.targetMinutes = getSnappedMinutes(e)
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!drag.active || e.pointerId !== drag.pointerId) return
  drag.targetMinutes = getSnappedMinutes(e)
}

function onPointerUp(e: PointerEvent) {
  if (!drag.active || e.pointerId !== drag.pointerId) return
  commitDrop()
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
  if (newStart.getTime() === new Date(drag.originalStart).getTime()) return
  const newEnd = new Date(newStart.getTime() + drag.durationMs)
  emit('dropEvent', drag.event.id, newStart.toISOString(), newEnd.toISOString())
}

function endDrag() {
  drag.active = false
  drag.event = null
  drag.pointerId = -1
}

function getSnappedMinutes(e: PointerEvent): number {
  const scrollEl = gridRef.value?.querySelector<HTMLElement>('[data-scroll-body]')
  if (!scrollEl) return 0
  const rect = scrollEl.getBoundingClientRect()
  const scrollTop = scrollEl.scrollTop
  const relY = e.clientY - rect.top + scrollTop
  return Math.max(0, Math.min(1425, snapMinutes((relY / HOUR_HEIGHT) * 60)))
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
  const minutes = snapMinutes(Math.floor((offsetY / HOUR_HEIGHT) * 60))
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
  const top = getEventTopPx(evt, viewDate.value)
  const height = getEventHeightPx(evt, viewDate.value)
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
            :style="{ height: `${HOUR_HEIGHT}px` }"
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
          <div class="relative" :style="{ minHeight: `${24 * HOUR_HEIGHT}px` }">
            <!-- Hour rows -->
            <div
              v-for="hour in hours"
              :key="hour"
              class="flex cursor-pointer hover:bg-elevated/20"
              :class="hour < 23 ? 'border-b border-default/30' : ''"
              :style="{ height: `${HOUR_HEIGHT}px` }"
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
              class="overflow-hidden px-1 py-0.5 text-xs"
              :style="getEventStyle(evt)"
              @click.stop="onEventClick(evt, $event)"
              @pointerdown.stop="startDrag(evt, $event)"
            >
              <div
                class="truncate font-semibold leading-tight"
                :style="{ color: getEventColor(evt) }"
              >
                {{ evt.title }}
              </div>
              <div class="mt-px text-[10px] leading-tight text-muted">
                {{ new Date(evt.startAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }}
                –
                {{ new Date(evt.endAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }}
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
