<script setup lang="ts">
import type { Booking } from '~/types/scheduling'
import { BookingStatus } from '~/types/scheduling'

definePageMeta({ layout: 'app' })

const route = useRoute()
const pageId = route.params.id as string

const { fetchSchedulingPage, fetchBookings } = useSchedulingPages()

const { data: page } = await useAsyncData(`scheduling-page-${pageId}`, () => fetchSchedulingPage(pageId))
const { data: bookingsData } = await useAsyncData<Booking[]>(`scheduling-page-bookings-${pageId}`, () => fetchBookings(pageId), { default: () => [] })
const bookings = computed(() => bookingsData.value ?? [])

useSeoMeta({ title: page.value ? `Reservas — ${page.value.title}` : 'Reservas' })

const STATUS_META: Record<BookingStatus, { label: string, color: 'success' | 'error' | 'warning' }> = {
  [BookingStatus.Confirmed]: { label: 'Confirmada', color: 'success' },
  [BookingStatus.Cancelled]: { label: 'Cancelada', color: 'error' },
  [BookingStatus.Rescheduled]: { label: 'Reagendada', color: 'warning' }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <UDashboardPanel id="scheduling-bookings">
    <template #header>
      <UDashboardNavbar :title="page ? `Reservas — ${page.title}` : 'Reservas'">
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            to="/app/scheduling"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto max-w-3xl space-y-3 p-4">
        <div v-if="bookings.length === 0" class="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-default py-16">
          <UIcon name="i-lucide-calendar-x" class="size-10 text-dimmed" />
          <p class="text-sm text-muted">
            Nenhuma reserva ainda.
          </p>
        </div>

        <template v-else>
          <UCard v-for="booking in bookings" :key="booking.id">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <p class="font-medium text-highlighted">
                  {{ booking.guestName }}
                </p>
                <p class="text-sm text-muted">
                  {{ booking.guestEmail }}
                </p>
                <p class="mt-1 text-xs text-muted">
                  Criada em {{ formatDate(booking.createdAt) }}
                </p>
              </div>
              <UBadge :color="STATUS_META[booking.status].color" variant="subtle" size="sm">
                {{ STATUS_META[booking.status].label }}
              </UBadge>
            </div>
          </UCard>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
