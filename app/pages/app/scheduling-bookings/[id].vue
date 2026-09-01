<script setup lang="ts">
import type { Booking } from '~/types/scheduling'
import { BookingStatus } from '~/types/scheduling'
import { formatDisplay } from '#shared/utils/dateTime'

definePageMeta({ layout: 'app' })

const route = useRoute()
const pageId = route.params.id as string

const { fetchSchedulingPage, fetchBookings, approveBooking, cancelBookingAsHost } = useSchedulingPages()

const { data: page } = await useAsyncData(`scheduling-page-${pageId}`, () => fetchSchedulingPage(pageId))
const { data: bookingsData, status: bookingsStatus } = useAsyncData<Booking[]>(`scheduling-page-bookings-${pageId}`, () => fetchBookings(pageId), { lazy: true, default: () => [] })
const bookings = computed(() => bookingsData.value ?? [])

useSeoMeta({ title: page.value ? `Reservas — ${page.value.title}` : 'Reservas' })

const STATUS_META: Record<BookingStatus, { label: string, color: 'success' | 'error' | 'warning' | 'neutral' }> = {
  [BookingStatus.Confirmed]: { label: 'Confirmada', color: 'success' },
  [BookingStatus.Pending]: { label: 'Pendente', color: 'warning' },
  [BookingStatus.Cancelled]: { label: 'Cancelada', color: 'error' },
  [BookingStatus.Rescheduled]: { label: 'Reagendada', color: 'neutral' }
}

function formatDate(iso: string): string {
  return formatDisplay(iso, "dd 'de' MMM'.' 'de' yyyy, HH:mm")
}

// ─── Filtro por aba + busca ──────────────────────────────────────────────────
const hasPendingTab = computed(() => Boolean(page.value?.requiresConfirmation) || bookings.value.some(b => b.status === BookingStatus.Pending))

const tabs = computed(() => {
  const base: { label: string, value: string }[] = []
  if (hasPendingTab.value) base.push({ label: 'Pendentes', value: 'pending' })
  base.push(
    { label: 'Próximas', value: 'upcoming' },
    { label: 'Passadas', value: 'past' },
    { label: 'Canceladas', value: 'cancelled' }
  )
  return base
})

const activeFilter = ref<'pending' | 'upcoming' | 'past' | 'cancelled'>(hasPendingTab.value ? 'pending' : 'upcoming')
watch(hasPendingTab, (has) => {
  if (has && !tabs.value.some(t => t.value === activeFilter.value)) activeFilter.value = 'pending'
})

const searchQuery = ref('')

const filteredBookings = computed(() => {
  const now = Date.now()
  const q = searchQuery.value.trim().toLowerCase()

  let list = bookings.value.filter((b) => {
    if (activeFilter.value === 'cancelled') return b.status === BookingStatus.Cancelled
    if (activeFilter.value === 'pending') return b.status === BookingStatus.Pending
    if (b.status === BookingStatus.Cancelled || b.status === BookingStatus.Pending) return false
    const startMs = b.startAt ? new Date(b.startAt).getTime() : null
    if (activeFilter.value === 'upcoming') return startMs === null || startMs >= now
    return startMs !== null && startMs < now
  })

  if (q) {
    list = list.filter(b => b.guestName.toLowerCase().includes(q) || b.guestEmail.toLowerCase().includes(q))
  }

  return list.slice().sort((a, b) => {
    const aMs = a.startAt ? new Date(a.startAt).getTime() : 0
    const bMs = b.startAt ? new Date(b.startAt).getTime() : 0
    return activeFilter.value === 'past' ? bMs - aMs : aMs - bMs
  })
})

// ─── Detalhe / ações ─────────────────────────────────────────────────────────
const detailOpen = ref(false)
const selectedBookingId = ref<string | null>(null)
const selectedBooking = computed(() => bookings.value.find(b => b.id === selectedBookingId.value) ?? null)
const approving = ref(false)
const cancelling = ref(false)

function openDetail(booking: Booking) {
  selectedBookingId.value = booking.id
  detailOpen.value = true
}

function patchBookingInList(updated: Booking) {
  if (!bookingsData.value) return
  bookingsData.value = bookingsData.value.map(b => (b.id === updated.id ? updated : b))
}

async function onApprove(bookingId: string) {
  if (approving.value) return
  approving.value = true
  const updated = await approveBooking(pageId, bookingId)
  approving.value = false
  if (updated) patchBookingInList(updated)
}

async function onCancel(bookingId: string, reason: string | undefined) {
  if (cancelling.value) return
  cancelling.value = true
  const updated = await cancelBookingAsHost(pageId, bookingId, reason)
  cancelling.value = false
  if (updated) {
    patchBookingInList(updated)
    detailOpen.value = false
  }
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
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <UTabs :items="tabs" :model-value="activeFilter" @update:model-value="activeFilter = $event as 'pending' | 'upcoming' | 'past' | 'cancelled'" />
          <UInput
            v-model="searchQuery"
            icon="i-lucide-search"
            placeholder="Buscar por nome ou e-mail…"
            size="sm"
            class="sm:w-64"
          />
        </div>

        <div v-if="bookingsStatus === 'pending'" class="space-y-3">
          <USkeleton v-for="i in 3" :key="i" class="h-20 w-full rounded-xl" />
        </div>

        <UEmpty
          v-else-if="filteredBookings.length === 0"
          icon="i-lucide-calendar-x"
          :title="bookings.length === 0 ? 'Nenhuma reserva ainda' : 'Nada por aqui'"
          :description="bookings.length === 0 ? 'Assim que alguém marcar um horário por essa página, as reservas aparecem aqui.' : 'Nenhuma reserva nesse filtro.'"
          class="py-16"
        />

        <template v-else>
          <UCard
            v-for="booking in filteredBookings"
            :key="booking.id"
            class="cursor-pointer transition-shadow hover:shadow-md"
            @click="openDetail(booking)"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0 flex-1">
                <p class="font-medium text-highlighted">
                  {{ booking.guestName }}
                </p>
                <p class="text-sm text-muted">
                  {{ booking.guestEmail }}
                </p>
                <p class="mt-1 flex items-center gap-1.5 text-xs text-muted">
                  <UIcon name="i-lucide-clock" class="size-3.5 shrink-0" />
                  {{ booking.startAt ? formatDate(booking.startAt) : 'Horário não disponível' }}
                </p>
                <p v-if="booking.cancellationReason" class="mt-1 text-xs text-muted">
                  Motivo do cancelamento: {{ booking.cancellationReason }}
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

  <AppointmentsSchedulingBookingDetailSlideover
    :open="detailOpen"
    :booking="selectedBooking"
    :page="page ?? null"
    :approving="approving"
    :cancelling="cancelling"
    @update:open="detailOpen = $event"
    @approve="onApprove"
    @cancel="onCancel"
  />
</template>
