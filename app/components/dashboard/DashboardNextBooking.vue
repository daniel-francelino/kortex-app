<script setup lang="ts">
import { formatDisplay } from '#shared/utils/dateTime'

interface NextBooking {
  bookingId: string
  schedulingPageId: string
  pageTitle: string
  guestName: string
  status: string
  startAt: string
  endAt: string
}

const props = defineProps<{
  booking: NextBooking
}>()

function formatDateTime(iso: string): string {
  const raw = formatDisplay(iso, "EEEE, dd 'de' MMMM 'às' HH:mm")
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}
</script>

<template>
  <UCard :to="`/app/scheduling-bookings/${props.booking.schedulingPageId}`">
    <template #header>
      <div class="flex items-center justify-between">
        <p class="text-sm font-medium text-highlighted">
          Próxima reserva
        </p>
        <UBadge v-if="props.booking.status === 'pending'" color="warning" variant="subtle" size="sm">
          Pendente
        </UBadge>
      </div>
    </template>
    <div class="flex items-center gap-3">
      <UIcon name="i-lucide-calendar-clock" class="size-8 shrink-0 text-primary" />
      <div class="min-w-0">
        <p class="truncate font-medium text-highlighted">
          {{ props.booking.guestName }} — {{ props.booking.pageTitle }}
        </p>
        <p class="text-sm text-muted">
          {{ formatDateTime(props.booking.startAt) }}
        </p>
      </div>
    </div>
  </UCard>
</template>
