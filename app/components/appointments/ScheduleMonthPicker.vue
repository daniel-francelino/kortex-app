<script setup lang="ts">
import { formatDisplay } from '#shared/utils/dateTime'

const props = defineProps<{
  modelValue: string | null
  availableDates: Set<string>
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [date: string]
  'month-change': [year: number, month: number]
}>()

const today = new Date()
const viewYear = ref(today.getFullYear())
const viewMonth = ref(today.getMonth())

const dayHeaders = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const todayStr = formatDate(today)

interface DayCell {
  dateStr: string
  day: number
  isCurrentMonth: boolean
  isPast: boolean
  hasAvailability: boolean
}

const grid = computed((): DayCell[][] => {
  const first = new Date(viewYear.value, viewMonth.value, 1)
  const last = new Date(viewYear.value, viewMonth.value + 1, 0)
  const startDay = first.getDay()

  const weeks: DayCell[][] = []
  const cursor = new Date(first)
  cursor.setDate(cursor.getDate() - startDay)

  for (let w = 0; w < 6; w++) {
    const week: DayCell[] = []
    for (let d = 0; d < 7; d++) {
      const dateStr = formatDate(cursor)
      week.push({
        dateStr,
        day: cursor.getDate(),
        isCurrentMonth: cursor.getMonth() === viewMonth.value,
        isPast: dateStr < todayStr,
        hasAvailability: props.availableDates.has(dateStr)
      })
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
    if (cursor > last && cursor.getDay() === 0) break
  }

  return weeks
})

const monthLabel = computed(() =>
  formatDisplay(new Date(viewYear.value, viewMonth.value, 1), "MMMM 'de' yyyy")
)

function emitMonthChange() {
  emit('month-change', viewYear.value, viewMonth.value)
}

function goPrevMonth() {
  if (viewMonth.value === 0) {
    viewMonth.value = 11
    viewYear.value -= 1
  } else {
    viewMonth.value -= 1
  }
  emitMonthChange()
}

function goNextMonth() {
  if (viewMonth.value === 11) {
    viewMonth.value = 0
    viewYear.value += 1
  } else {
    viewMonth.value += 1
  }
  emitMonthChange()
}

function selectDay(cell: DayCell) {
  if (cell.isPast || !cell.hasAvailability) return
  emit('update:modelValue', cell.dateStr)
}

onMounted(() => emitMonthChange())
</script>

<template>
  <div class="rounded-xl border border-default">
    <div class="flex items-center justify-between border-b border-default px-3 py-2">
      <UButton
        icon="i-lucide-chevron-left"
        size="xs"
        color="neutral"
        variant="ghost"
        @click="goPrevMonth"
      />
      <span class="text-sm font-medium capitalize text-highlighted">{{ monthLabel }}</span>
      <UButton
        icon="i-lucide-chevron-right"
        size="xs"
        color="neutral"
        variant="ghost"
        @click="goNextMonth"
      />
    </div>

    <div class="grid grid-cols-7 gap-1 p-2">
      <div v-for="(h, i) in dayHeaders" :key="i" class="py-1 text-center text-[11px] font-medium text-muted">
        {{ h }}
      </div>

      <template v-for="(week, wi) in grid" :key="wi">
        <button
          v-for="cell in week"
          :key="cell.dateStr"
          type="button"
          class="aspect-square rounded-md text-sm transition-colors"
          :class="[
            !cell.isCurrentMonth ? 'text-dimmed/40' : '',
            cell.isPast || !cell.hasAvailability ? 'cursor-not-allowed text-dimmed/50' : 'cursor-pointer hover:bg-elevated',
            cell.hasAvailability && !cell.isPast ? 'font-medium text-highlighted' : '',
            modelValue === cell.dateStr ? 'bg-primary text-white hover:bg-primary' : ''
          ]"
          :disabled="cell.isPast || !cell.hasAvailability"
          @click="selectDay(cell)"
        >
          {{ cell.day }}
        </button>
      </template>
    </div>

    <div v-if="loading" class="border-t border-default px-3 py-2 text-center text-xs text-muted">
      Carregando disponibilidade...
    </div>
  </div>
</template>
