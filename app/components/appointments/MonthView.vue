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
const dragOver = ref<string>('')  // dateStr of hovered cell

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
  <div>
    <!-- Loading -->
    <div v-if="loading" class="grid grid-cols-7 gap-px">
      <USkeleton v-for="i in 35" :key="i" class="h-24" />
    </div>

    <!-- Grid -->
    <div v-else>
      <!-- Day headers -->
      <div class="grid grid-cols-7 border-b border-default">
        <div
          v-for="header in dayHeaders"
          :key="header"
          class="py-2 text-center text-xs font-medium text-muted"
        >
          {{ header }}
        </div>
      </div>

      <!-- Weeks -->
      <div
        v-for="(week, wi) in calendarGrid"
        :key="wi"
        class="grid grid-cols-7 border-b border-default last:border-b-0"
      >
        <div
          v-for="cell in week"
          :key="cell.dateStr"
          class="min-h-24 cursor-pointer border-r border-default p-1 transition-colors last:border-r-0 hover:bg-elevated/50"
          :class="[
            !cell.isCurrentMonth ? 'bg-muted/5' : '',
            dragOver === cell.dateStr ? 'bg-primary/10' : ''
          ]"
          @click="onDayClick(cell, $event)"
          @dragover="onDragOver(cell.dateStr, $event)"
          @dragleave="onDragLeave"
          @drop="onDrop(cell.dateStr, $event)"
        >
          <!-- Date number -->
          <div class="mb-1 flex justify-end">
            <span
              class="flex size-6 items-center justify-center rounded-full text-xs"
              :class="[
                cell.isToday ? 'bg-primary font-bold text-white' : '',
                !cell.isCurrentMonth ? 'text-muted' : 'text-highlighted'
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
              class="cursor-grab truncate rounded px-1 py-0.5 text-xs"
              :class="evt.allDay ? 'text-white' : ''"
              :style="evt.allDay
                ? { backgroundColor: getEventColor(evt) }
                : { backgroundColor: getEventColor(evt) + '20', color: getEventColor(evt), borderLeft: `3px solid ${getEventColor(evt)}` }"
              draggable="true"
              @click="onEventClick(evt, $event)"
              @dragstart="onEventDragStart(evt, $event)"
              @dragend="onDragEnd"
            >
              <span v-if="!evt.allDay" class="mr-1 opacity-70">
                {{ new Date(evt.startAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) }}
              </span>
              {{ evt.title }}
            </div>

            <!-- Overflow indicator -->
            <div
              v-if="cell.events.length > MAX_VISIBLE"
              class="cursor-pointer px-1 text-xs text-muted hover:text-highlighted"
              @click.stop="onDayClick(cell, $event)"
            >
              +{{ cell.events.length - MAX_VISIBLE }} mais
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
