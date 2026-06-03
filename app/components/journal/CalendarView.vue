<script setup lang="ts">
import { getMoodOption } from '~/types/journal'

interface EntryDay {
  date: string
  mood: string | null
}

const props = defineProps<{
  entryDates: EntryDay[]
  loading: boolean
}>()

const emit = defineEmits<{
  selectDate: [date: string]
  monthChange: [from: string, to: string]
}>()

const currentYear = ref(new Date().getFullYear())
const currentMonth = ref(new Date().getMonth())
const today = new Date().toISOString().split('T')[0] ?? ''

const monthNames = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]
const dayHeaders = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// Map date → mood for O(1) lookup
const entryMoodMap = computed(() => {
  const map = new Map<string, number | null>()
  props.entryDates.forEach(e => map.set(e.date, e.mood))
  return map
})

interface CalendarDay {
  date: string
  day: number
  isCurrentMonth: boolean
  hasEntry: boolean
  mood: string | null
  isToday: boolean
}

const calendarDays = computed<CalendarDay[]>(() => {
  const year = currentYear.value
  const month = currentMonth.value
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startWeekday = firstDay.getDay()

  const days: CalendarDay[] = []

  // Previous month padding
  const prevLastDay = new Date(year, month, 0).getDate()
  for (let i = startWeekday - 1; i >= 0; i--) {
    const d = prevLastDay - i
    const date = fmt(year, month - 1, d)
    days.push({ date, day: d, isCurrentMonth: false, hasEntry: entryMoodMap.value.has(date), mood: entryMoodMap.value.get(date) ?? null, isToday: date === today })
  }

  // Current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = fmt(year, month, d)
    days.push({ date, day: d, isCurrentMonth: true, hasEntry: entryMoodMap.value.has(date), mood: entryMoodMap.value.get(date) ?? null, isToday: date === today })
  }

  // Next month padding
  const remaining = 42 - days.length
  for (let d = 1; d <= remaining; d++) {
    const date = fmt(year, month + 1, d)
    days.push({ date, day: d, isCurrentMonth: false, hasEntry: entryMoodMap.value.has(date), mood: entryMoodMap.value.get(date) ?? null, isToday: date === today })
  }

  return days
})

function fmt(year: number, month: number, day: number): string {
  const d = new Date(year, month, day)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function prevMonth() {
  if (currentMonth.value === 0) { currentMonth.value = 11; currentYear.value-- }
  else currentMonth.value--
  emitRange()
}

function nextMonth() {
  if (currentMonth.value === 11) { currentMonth.value = 0; currentYear.value++ }
  else currentMonth.value++
  emitRange()
}

function goToToday() {
  const now = new Date()
  currentYear.value = now.getFullYear()
  currentMonth.value = now.getMonth()
  emitRange()
}

function emitRange() {
  const first = fmt(currentYear.value, currentMonth.value, 1)
  const last = new Date(currentYear.value, currentMonth.value + 1, 0)
  emit('monthChange', first, fmt(currentYear.value, currentMonth.value, last.getDate()))
}

onMounted(() => emitRange())
</script>

<template>
  <div class="space-y-4">
    <!-- Navigation header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" size="sm" @click="prevMonth" />
        <h4 class="text-sm font-semibold text-highlighted min-w-36 text-center">
          {{ monthNames[currentMonth] }} {{ currentYear }}
        </h4>
        <UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" size="sm" @click="nextMonth" />
      </div>
      <UButton label="Hoje" size="xs" variant="outline" @click="goToToday" />
    </div>

    <!-- Loading -->
    <div v-if="props.loading" class="grid grid-cols-7 gap-1">
      <USkeleton v-for="i in 42" :key="i" class="h-12 w-full" />
    </div>

    <!-- Calendar grid -->
    <div v-else class="grid grid-cols-7 gap-1">
      <!-- Day headers -->
      <div
        v-for="header in dayHeaders"
        :key="header"
        class="text-center text-xs font-medium text-muted py-1"
      >
        {{ header }}
      </div>

      <!-- Day cells -->
      <button
        v-for="(day, idx) in calendarDays"
        :key="idx"
        :class="[
          'relative flex flex-col items-center justify-center h-12 rounded-xl text-sm transition-colors gap-0.5',
          day.isCurrentMonth ? 'text-highlighted' : 'text-dimmed',
          day.isToday ? 'ring-2 ring-primary font-bold' : '',
          day.hasEntry
            ? 'bg-primary/8 hover:bg-primary/15'
            : 'hover:bg-elevated',
        ]"
        @click="emit('selectDate', day.date)"
      >
        <span class="text-sm leading-none">{{ day.day }}</span>

        <!-- Mood emoji — shown when entry has mood -->
        <span
          v-if="day.hasEntry && day.mood"
          class="text-sm leading-none"
          :title="getMoodOption(day.mood)?.label"
        >{{ getMoodOption(day.mood)?.emoji }}</span>

        <!-- Fallback dot — shown when entry exists but no mood set -->
        <span
          v-else-if="day.hasEntry"
          class="size-1 rounded-full bg-primary"
        />
      </button>
    </div>
  </div>
</template>
