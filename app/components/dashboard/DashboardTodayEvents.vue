<script setup lang="ts">
import { formatInTimeZone } from 'date-fns-tz'
import type { DashboardEvent } from '~/types/life-os'

defineProps<{
  events: DashboardEvent[]
  totalCount: number
}>()

// Same fixed zone the dashboard's own "today" is computed against
// server-side (see server/api/life/dashboard.get.ts) — a single-tenant app,
// so no per-event timezone plumbing here. Explicit zone (not
// `new Date(iso).toLocaleTimeString()`, which used the *server's* zone
// during SSR and the *browser's* zone on the client — different results,
// a hydration mismatch) keeps this deterministic either way.
const DASHBOARD_TIMEZONE = 'America/Fortaleza'

function formatTime(isoDate: string, allDay: boolean): string {
  if (allDay) return 'Dia inteiro'
  return formatInTimeZone(isoDate, DASHBOARD_TIMEZONE, 'HH:mm')
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-calendar" class="size-5 text-primary" />
          <h3 class="text-sm font-semibold">
            Agenda de hoje
          </h3>
        </div>
        <UBadge color="neutral" variant="subtle" size="sm">
          {{ totalCount }} evento{{ totalCount !== 1 ? 's' : '' }}
        </UBadge>
      </div>
    </template>

    <div v-if="events.length === 0" class="flex flex-col items-center gap-2 py-4 text-center">
      <UIcon name="i-lucide-calendar-off" class="size-8 text-dimmed" />
      <p class="text-sm text-muted">
        Nenhum evento agendado
      </p>
    </div>

    <ul v-else class="divide-y divide-default">
      <li
        v-for="evt in events"
        :key="evt.id"
        class="flex items-center gap-3 py-2.5"
      >
        <div
          class="h-8 w-1 shrink-0 rounded-full"
          :style="{ backgroundColor: evt.calendarColor || '#6366f1' }"
        />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">
            {{ evt.title }}
          </p>
          <div class="flex items-center gap-2 text-xs text-muted">
            <span>{{ formatTime(evt.startAt, evt.allDay) }}</span>
            <span v-if="!evt.allDay">– {{ formatTime(evt.endAt, false) }}</span>
            <span class="truncate">· {{ evt.calendarName }}</span>
          </div>
        </div>
      </li>
    </ul>

    <template v-if="events.length > 0" #footer>
      <NuxtLink
        to="/app/appointments"
        class="text-xs text-primary hover:underline"
      >
        Ver agenda completa →
      </NuxtLink>
    </template>
  </UCard>
</template>
