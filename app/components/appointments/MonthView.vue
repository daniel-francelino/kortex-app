<script setup lang="ts">
import type { CalendarEvent } from '~/types/appointments'

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
  monthChange: [from: string, to: string]
  dropEvent: [eventId: string, newDate: string]
}>()

// ─── Helpers ──────────────────────────────────────────────────────────────
function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function emitRange() {
  const first = new Date(props.viewYear, props.viewMonth, 1)
  const last = new Date(props.viewYear, props.viewMonth + 1, 0)
  const startDay = first.getDay()
  const gridStart = new Date(first)
  gridStart.setDate(gridStart.getDate() - startDay)
  const gridEnd = new Date(last)
  gridEnd.setDate(gridEnd.getDate() + (6 - last.getDay()))
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
  const first = new Date(props.viewYear, props.viewMonth, 1)
  const last = new Date(props.viewYear, props.viewMonth + 1, 0)
  const startDay = first.getDay()
  const today = new Date()
  const todayStr = formatDate(today)

  const weeks: DayCell[][] = []
  const currentDate = new Date(first)
  currentDate.setDate(currentDate.getDate() - startDay)

  for (let w = 0; w < 6; w++) {
    const week: DayCell[] = []
    for (let d = 0; d < 7; d++) {
      const dateStr = formatDate(currentDate)
      week.push({
        date: new Date(currentDate),
        dateStr,
        day: currentDate.getDate(),
        isCurrentMonth: currentDate.getMonth() === props.viewMonth,
        isToday: dateStr === todayStr,
        events: getDayEvents(currentDate)
      })
      currentDate.setDate(currentDate.getDate() + 1)
    }
    weeks.push(week)
    if (currentDate > last && currentDate.getDay() === 0) break
  }

  return weeks
})

function getDayEvents(date: Date): CalendarEvent[] {
  if (!props.events?.length) return []
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)

  return props.events.filter((evt: CalendarEvent) => {
    if (!evt.startAt || !evt.endAt) return false
    const evtStart = new Date(evt.startAt)
    const evtEnd = new Date(evt.endAt)
    return evtStart < dayEnd && evtEnd > dayStart
  })
}

function getEventColor(evt: CalendarEvent): string {
  return evt.calendar?.color ?? '#10b981'
}

// ─── Drag state ───────────────────────────────────────────────────────────
const dragEvent = ref<CalendarEvent | null>(null)
const dragOver = ref<string>('')

function onEventDragStart(evt: CalendarEvent, e: DragEvent) {
  dragEvent.value = evt
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', evt.id)
  }
}

function onDragOver(dateStr: string, e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  dragOver.value = dateStr
}

function onDragLeave() {
  dragOver.value = ''
}

function onDrop(dateStr: string, e: DragEvent) {
  e.preventDefault()
  dragOver.value = ''
  if (!dragEvent.value) return
  const original = formatDate(new Date(dragEvent.value.startAt))
  if (original === dateStr) { dragEvent.value = null; return }
  emit('dropEvent', dragEvent.value.id, dateStr)
  dragEvent.value = null
}

function onDragEnd() {
  dragEvent.value = null
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

const MAX_VISIBLE = 3
</script>

<template>
  <div class="overflow-hidden rounded-lg border border-default">
    <!-- Loading -->
    <div v-if="loading" class="grid grid-cols-7">
      <USkeleton v-for="i in 35" :key="i" class="h-28 rounded-none" />
    </div>

    <template v-else>
      <!-- Day headers -->
      <div class="grid grid-cols-7 border-b border-default bg-elevated/30">
        <div
          v-for="header in dayHeaders"
          :key="header"
          class="py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted"
        >
          {{ header }}
        </div>
      </div>

      <!-- Weeks -->
      <div>
        <div
          v-for="(week, wi) in calendarGrid"
          :key="wi"
          class="grid grid-cols-7 border-b border-default/50 last:border-b-0"
        >
          <div
            v-for="cell in week"
            :key="cell.dateStr"
            class="group min-h-28 cursor-pointer border-r border-default/50 p-1.5 transition-colors last:border-r-0"
            :class="[
              !cell.isCurrentMonth ? 'bg-muted/3' : 'hover:bg-elevated/40',
              dragOver === cell.dateStr ? 'bg-primary/10' : ''
            ]"
            @click="onDayClick(cell, $event)"
            @dragover="onDragOver(cell.dateStr, $event)"
            @dragleave="onDragLeave"
            @drop="onDrop(cell.dateStr, $event)"
          >
            <!-- Date number -->
            <div class="mb-1">
              <span
                class="inline-flex size-6 items-center justify-center rounded-full text-xs font-medium transition-colors"
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

            <!-- Events (max 3 visible) -->
            <div class="space-y-0.5">
              <div
                v-for="(evt, ei) in cell.events.slice(0, MAX_VISIBLE)"
                :key="ei"
                class="flex cursor-grab items-center gap-1 truncate rounded-sm px-1 py-px text-[11px] leading-4 font-medium"
                :class="evt.allDay ? 'text-white' : ''"
                :style="evt.allDay
                  ? { backgroundColor: getEventColor(evt) }
                  : { color: getEventColor(evt) }"
                draggable="true"
                @click.stop="onEventClick(evt, $event)"
                @dragstart="onEventDragStart(evt, $event)"
                @dragend="onDragEnd"
              >
                <!-- Dot for timed events -->
                <span
                  v-if="!evt.allDay"
                  class="inline-block size-1.5 shrink-0 rounded-full"
                  :style="{ backgroundColor: getEventColor(evt) }"
                />
                <span class="truncate">
                  <span v-if="!evt.allDay" class="mr-0.5 font-normal opacity-75">
                    {{ new Date(evt.startAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }}
                  </span>
                  {{ evt.title }}
                </span>
              </div>

              <!-- Overflow indicator -->
              <div
                v-if="cell.events.length > MAX_VISIBLE"
                class="cursor-pointer px-1 text-[11px] font-medium text-muted hover:text-highlighted"
                @click.stop="onDayClick(cell, $event)"
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
