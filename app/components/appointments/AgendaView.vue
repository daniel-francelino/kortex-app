<script setup lang="ts">
import type { CalendarEvent } from '~/types/appointments'
import { formatEventDate, formatEventTime } from '~/utils/calendarEventTime'

const props = defineProps<{
  events: CalendarEvent[]
  loading: boolean
}>()

const emit = defineEmits<{
  selectEvent: [event: CalendarEvent]
}>()

// ─── Group events by date ─────────────────────────────────────────────────
interface EventGroup {
  dateStr: string
  dateLabel: string
  isToday: boolean
  events: CalendarEvent[]
}

const groupedEvents = computed((): EventGroup[] => {
  if (!props.events || props.events.length === 0) return []

  const today = new Date()
  const todayStr = formatDate(today)
  const groups: Record<string, CalendarEvent[]> = {}

  for (const evt of props.events) {
    const dateStr = formatEventDate(evt)
    if (!groups[dateStr]) {
      groups[dateStr] = []
    }
    groups[dateStr].push(evt)
  }

  const sortedDates = Object.keys(groups).sort()
  return sortedDates.map(dateStr => ({
    dateStr,
    dateLabel: formatDateLabel(parseLocalDate(dateStr)),
    isToday: dateStr === todayStr,
    events: groups[dateStr] ?? []
  }))
})

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1)
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDateLabel(d: Date): string {
  return d.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long'
  })
}

function getTimeRange(evt: CalendarEvent): string {
  if (evt.allDay) return 'Dia inteiro'
  const start = formatEventTime(evt)
  const end = formatEventTime(evt, 'endAt')
  return `${start} — ${end}`
}

function getEventColor(evt: CalendarEvent): string {
  return evt.calendar?.color ?? '#10b981'
}

function getCalendarName(evt: CalendarEvent): string {
  return evt.calendar?.name ?? ''
}
</script>

<template>
  <div class="space-y-6">
    <!-- Loading -->
    <div
      v-if="loading"
      class="space-y-4"
    >
      <div
        v-for="i in 5"
        :key="i"
        class="space-y-2"
      >
        <USkeleton class="h-5 w-40" />
        <USkeleton class="h-16 w-full" />
      </div>
    </div>

    <!-- Empty -->
    <div
      v-else-if="groupedEvents.length === 0"
      class="flex flex-col items-center justify-center gap-3 py-12"
    >
      <UIcon
        name="i-lucide-calendar-x"
        class="size-12 text-dimmed"
      />
      <p class="text-sm text-muted">
        Nenhum evento no período selecionado
      </p>
    </div>

    <!-- Grouped list -->
    <div
      v-else
      class="space-y-6"
    >
      <div
        v-for="group in groupedEvents"
        :key="group.dateStr"
      >
        <!-- Date header -->
        <div class="mb-2 flex items-center gap-2">
          <div
            v-if="group.isToday"
            class="rounded-full bg-primary px-2.5 py-0.5 text-xs font-semibold text-white"
          >
            Hoje
          </div>
          <h4 class="text-sm font-medium capitalize text-highlighted">
            {{ group.dateLabel }}
          </h4>
        </div>

        <!-- Events -->
        <div class="space-y-2">
          <div
            v-for="evt in group.events"
            :key="`${evt.id}-${evt.startAt}`"
            class="flex cursor-pointer items-start gap-3 rounded-lg border border-default p-3 transition-colors hover:bg-elevated/50"
            @click="emit('selectEvent', evt)"
          >
            <!-- Color indicator -->
            <div
              class="mt-1 size-3 shrink-0 rounded-full"
              :style="{ backgroundColor: getEventColor(evt) }"
            />

            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-2">
                <h5 class="font-medium text-highlighted truncate">
                  {{ evt.title }}
                </h5>
                <UBadge
                  v-if="evt.rrule"
                  variant="subtle"
                  size="xs"
                >
                  <UIcon
                    name="i-lucide-repeat"
                    class="size-3"
                  />
                </UBadge>
              </div>

              <div class="mt-0.5 flex items-center gap-3 text-xs text-muted">
                <span class="flex items-center gap-1">
                  <UIcon
                    name="i-lucide-clock"
                    class="size-3"
                  />
                  {{ getTimeRange(evt) }}
                </span>

                <span
                  v-if="evt.location"
                  class="flex items-center gap-1"
                >
                  <UIcon
                    name="i-lucide-map-pin"
                    class="size-3"
                  />
                  {{ evt.location }}
                </span>

                <span
                  v-if="getCalendarName(evt)"
                  class="flex items-center gap-1"
                >
                  <span
                    class="inline-block size-2 rounded-full"
                    :style="{ backgroundColor: getEventColor(evt) }"
                  />
                  {{ getCalendarName(evt) }}
                </span>
              </div>

              <p
                v-if="evt.description"
                class="mt-1 text-xs text-muted line-clamp-1"
              >
                {{ evt.description }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
