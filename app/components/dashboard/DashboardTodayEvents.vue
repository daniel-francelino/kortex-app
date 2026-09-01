<script setup lang="ts">
import type { DashboardEvent } from '~/types/life-os'
import { detectBrowserTimeZone, formatDisplay } from '#shared/utils/dateTime'

defineProps<{
  events: DashboardEvent[]
  totalCount: number
}>()

// Regra 1 (docs/timezone/ANALISE_TIMEZONE.md): the browser's own detected
// zone, read only once mounted — this card is SSR-rendered, and
// `Intl.DateTimeFormat().resolvedOptions().timeZone` would give the
// *server's* zone during SSR (a real value, not a placeholder), which then
// wouldn't match the *browser's* zone at hydration time. `clientTimezone`
// stays `null` through SSR and the initial client render (so both agree —
// no mismatch), then flips to the real value in the same tick the component
// mounts. `useUserPreferences`'s `state.timezone` was the other candidate,
// but it only ever populates from `onMounted` too (see app/layouts/app.vue),
// so during SSR it's just sitting at its hardcoded 'UTC' default — no more
// SSR-safe than reading `Intl` directly, and not what Regra 1 actually asks
// for (browser first, not the stored fallback, whenever a browser exists).
const clientTimezone = ref<string | null>(null)
onMounted(() => {
  clientTimezone.value = detectBrowserTimeZone() ?? null
})

function formatTime(isoDate: string, allDay: boolean): string {
  if (allDay) return 'Dia inteiro'
  if (!clientTimezone.value) return '--:--'
  return formatDisplay(isoDate, 'HH:mm', { timeZone: clientTimezone.value })
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
