<script setup lang="ts">
import { AnimatePresence, motion } from 'motion-v'
import { getMoodOption } from '~/types/journal'

interface EntryDay {
  date: string
  mood: string | null
  locked: boolean
}

const props = defineProps<{
  entryDates: EntryDay[]
  loading: boolean
}>()

const emit = defineEmits<{
  selectDate: [date: string]
  monthChange: [from: string, to: string]
}>()

const { isEntryLocked } = useJournalLock()

const currentYear = ref(new Date().getFullYear())
const currentMonth = ref(new Date().getMonth())
const today = new Date().toISOString().split('T')[0] ?? ''

const monthNames = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]
const dayHeaders = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// Map date → { mood, locked } for O(1) lookup
const entryInfoMap = computed(() => {
  const map = new Map<string, { mood: string | null, locked: boolean }>()
  props.entryDates.forEach(e => map.set(e.date, { mood: e.mood, locked: e.locked }))
  return map
})

interface CalendarDay {
  date: string
  day: number
  isCurrentMonth: boolean
  hasEntry: boolean
  mood: string | null
  locked: boolean
  isToday: boolean
}

function dayInfo(date: string) {
  const info = entryInfoMap.value.get(date)
  return { hasEntry: !!info, mood: info?.mood ?? null, locked: info?.locked ?? false }
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
    days.push({ date, day: d, isCurrentMonth: false, ...dayInfo(date), isToday: date === today })
  }

  // Current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = fmt(year, month, d)
    days.push({ date, day: d, isCurrentMonth: true, ...dayInfo(date), isToday: date === today })
  }

  // Next month padding
  const remaining = 42 - days.length
  for (let d = 1; d <= remaining; d++) {
    const date = fmt(year, month + 1, d)
    days.push({ date, day: d, isCurrentMonth: false, ...dayInfo(date), isToday: date === today })
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
  <div class="overflow-hidden rounded-xl border border-default">
    <!-- Navigation header -->
    <motion.div
      class="flex items-center justify-between border-b border-default bg-elevated/30 px-4 py-3"
      :initial="{ opacity: 0, y: -6 }"
      :animate="{ opacity: 1, y: 0 }"
      :transition="{ duration: 0.18 }"
    >
      <div class="flex items-center gap-1">
        <UButton
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="prevMonth"
        />
        <h4 class="min-w-40 text-center text-sm font-semibold capitalize text-highlighted">
          {{ monthNames[currentMonth] }} {{ currentYear }}
        </h4>
        <UButton
          icon="i-lucide-chevron-right"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="nextMonth"
        />
      </div>
      <UButton
        label="Hoje"
        size="xs"
        variant="outline"
        color="neutral"
        @click="goToToday"
      />
    </motion.div>

    <!-- Day headers -->
    <div class="grid grid-cols-7 border-b border-default/50">
      <div
        v-for="header in dayHeaders"
        :key="header"
        class="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted"
      >
        {{ header }}
      </div>
    </div>

    <!-- Loading -->
    <motion.div
      v-if="props.loading"
      class="grid grid-cols-7"
      :initial="{ opacity: 0 }"
      :animate="{ opacity: 1 }"
      :transition="{ duration: 0.16 }"
    >
      <motion.div
        v-for="i in 42"
        :key="i"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :transition="{ duration: 0.12, delay: Math.min(i * 0.004, 0.12) }"
      >
        <USkeleton class="h-16 rounded-none" />
      </motion.div>
    </motion.div>

    <!-- Calendar grid -->
    <AnimatePresence v-else mode="wait">
      <motion.div
        :key="`${currentYear}-${currentMonth}`"
        class="grid grid-cols-7"
        :initial="{ opacity: 0 }"
        :animate="{ opacity: 1 }"
        :exit="{ opacity: 0 }"
        :transition="{ duration: 0.14 }"
      >
      <motion.button
        v-for="(day, idx) in calendarDays"
        :key="idx"
        class="group relative flex flex-col items-center gap-1 border-b border-r border-default/30 py-2 transition-colors last:border-r-0"
        :initial="{ opacity: 0, y: 8 }"
        :animate="{ opacity: 1, y: 0 }"
        :while-hover="{ y: -1 }"
        :while-tap="{ scale: 0.98 }"
        :transition="{ duration: 0.12, delay: Math.min(idx * 0.004, 0.12) }"
        :class="[
          (idx + 1) % 7 === 0 ? 'border-r-0' : '',
          idx >= 35 ? 'border-b-0' : '',
          day.hasEntry && day.isCurrentMonth
            ? 'bg-primary/8 hover:bg-primary/[0.14]'
            : day.isCurrentMonth
              ? 'hover:bg-elevated/60'
              : 'hover:bg-elevated/30',
        ]"
        @click="emit('selectDate', day.date)"
      >
        <!-- Day number -->
        <span
          class="flex size-7 items-center justify-center rounded-full text-sm font-medium transition-colors"
          :class="[
            day.isToday
              ? 'bg-primary font-bold text-white'
              : day.isCurrentMonth
                ? 'text-highlighted group-hover:bg-elevated'
                : 'text-muted/40',
          ]"
        >
          {{ day.day }}
        </span>

        <!-- Lock icon (protected entry) -->
        <UIcon
          v-if="day.hasEntry && isEntryLocked({ entryDate: day.date, locked: day.locked })"
          name="i-lucide-lock"
          class="size-3 text-warning"
        />

        <!-- Mood emoji (entry with mood) -->
        <span
          v-else-if="day.hasEntry && day.mood"
          class="text-base leading-none"
          :title="getMoodOption(day.mood)?.label"
        >
          {{ getMoodOption(day.mood)?.emoji }}
        </span>

        <!-- Pencil icon (entry without mood) -->
        <UIcon
          v-else-if="day.hasEntry"
          name="i-lucide-pencil-line"
          class="size-3 text-primary/60"
        />

        <!-- Spacer to keep height consistent -->
        <span v-else class="size-3" />
      </motion.button>
      </motion.div>
    </AnimatePresence>
  </div>
</template>
