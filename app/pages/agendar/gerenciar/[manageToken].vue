<script setup lang="ts">
import type { PublicBookingDetail, AvailabilitySlot } from '~/types/scheduling'
import { BookingStatus, LOCATION_TYPE_META } from '~/types/scheduling'

definePageMeta({ layout: false, ssr: true })

const route = useRoute()
const manageToken = route.params.manageToken as string
const toast = useToast()

const { data: booking, refresh: refreshBooking } = await useAsyncData<PublicBookingDetail>(`booking-manage-${manageToken}`, () =>
  $fetch<PublicBookingDetail>(`/api/schedule/manage/${manageToken}`)
)

if (!booking.value) {
  throw createError({ statusCode: 404, statusMessage: 'Reserva não encontrada', fatal: true })
}

useSeoMeta({ title: 'Gerenciar reserva', robots: 'noindex' })

const locationMeta = computed(() => booking.value ? LOCATION_TYPE_META[booking.value.locationType] : null)
const guestTimezone = computed(() => booking.value?.guestTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone)

function formatDateTime(iso: string | null): string {
  if (!iso) return ''
  const raw = new Date(iso).toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: guestTimezone.value
  })
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

// ─── Cancel ──────────────────────────────────────────────────────────────────
const cancelling = ref(false)
const cancelConfirmOpen = ref(false)
const cancelReason = ref('')

async function onCancel() {
  cancelling.value = true
  try {
    await $fetch(`/api/schedule/manage/${manageToken}/cancel`, {
      method: 'POST',
      body: { reason: cancelReason.value.trim() || undefined }
    })
    toast.add({ title: 'Reserva cancelada', color: 'success' })
    await refreshBooking()
    cancelConfirmOpen.value = false
  } catch (err: unknown) {
    const message = (err as { data?: { statusMessage?: string } })?.data?.statusMessage
    toast.add({ title: 'Erro', description: message ?? 'Não foi possível cancelar.', color: 'error' })
  } finally {
    cancelling.value = false
  }
}

// ─── Reschedule ──────────────────────────────────────────────────────────────
const rescheduleMode = ref(false)
const rescheduling = ref(false)
const slotsLoading = ref(false)
const monthSlots = ref<AvailabilitySlot[]>([])
const selectedDate = ref<string | null>(null)
const selectedSlot = ref<AvailabilitySlot | null>(null)

const availableDates = computed(() => {
  const set = new Set<string>()
  for (const slot of monthSlots.value) {
    set.add(new Date(slot.startAt).toLocaleDateString('en-CA', { timeZone: guestTimezone.value }))
  }
  return set
})

const slotsForSelectedDate = computed(() => {
  if (!selectedDate.value) return []
  return monthSlots.value
    .filter(s => new Date(s.startAt).toLocaleDateString('en-CA', { timeZone: guestTimezone.value }) === selectedDate.value)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
})

function formatSlotTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: guestTimezone.value })
}

async function onMonthChange(year: number, month: number) {
  if (!booking.value) return
  slotsLoading.value = true
  selectedDate.value = null
  selectedSlot.value = null
  try {
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    const data = await $fetch<{ slots: AvailabilitySlot[] }>(`/api/schedule/${booking.value.schedulingPageToken}/availability`, {
      query: { from, to }
    })
    monthSlots.value = data.slots
  } catch {
    toast.add({ title: 'Erro', description: 'Não foi possível carregar a disponibilidade.', color: 'error' })
  } finally {
    slotsLoading.value = false
  }
}

function startReschedule() {
  rescheduleMode.value = true
  selectedDate.value = null
  selectedSlot.value = null
}

async function confirmReschedule() {
  if (!selectedSlot.value || rescheduling.value) return
  rescheduling.value = true
  try {
    await $fetch(`/api/schedule/manage/${manageToken}/reschedule`, {
      method: 'POST',
      body: { newStartAt: selectedSlot.value.startAt }
    })
    toast.add({ title: 'Reserva reagendada', color: 'success' })
    await refreshBooking()
    rescheduleMode.value = false
  } catch (err: unknown) {
    const message = (err as { data?: { statusMessage?: string } })?.data?.statusMessage
    toast.add({ title: 'Erro', description: message ?? 'Não foi possível reagendar.', color: 'error' })
  } finally {
    rescheduling.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-default">
    <div class="mx-auto max-w-xl px-4 py-12">
      <template v-if="booking">
        <header class="mb-6">
          <p class="text-sm text-muted">
            {{ booking.hostName }}
          </p>
          <h1 class="text-xl font-bold text-highlighted">
            {{ booking.pageTitle }}
          </h1>
        </header>

        <UCard>
          <div class="space-y-3">
            <UBadge
              :color="booking.status === BookingStatus.Cancelled ? 'error' : 'success'"
              variant="subtle"
            >
              {{ booking.status === BookingStatus.Cancelled ? 'Cancelada' : 'Confirmada' }}
            </UBadge>

            <div class="flex items-start gap-3 text-sm">
              <UIcon name="i-lucide-clock" class="mt-0.5 size-4 shrink-0 text-muted" />
              <span>{{ formatDateTime(booking.startAt) }}</span>
            </div>

            <div v-if="locationMeta" class="flex items-center gap-3 text-sm">
              <UIcon :name="locationMeta.icon" class="size-4 shrink-0 text-muted" />
              <span>{{ locationMeta.label }}</span>
            </div>

            <div class="flex items-center gap-3 text-sm text-muted">
              <UIcon name="i-lucide-user" class="size-4 shrink-0" />
              <span>{{ booking.guestName }} · {{ booking.guestEmail }}</span>
            </div>
          </div>
        </UCard>

        <div v-if="booking.status !== BookingStatus.Cancelled && !rescheduleMode" class="mt-4 flex flex-wrap justify-end gap-2">
          <UButton
            v-if="booking.rescheduleEnabled"
            label="Reagendar"
            icon="i-lucide-calendar-clock"
            color="neutral"
            variant="outline"
            @click="startReschedule"
          />
          <UButton
            v-if="booking.cancellationEnabled"
            label="Cancelar reserva"
            icon="i-lucide-x"
            color="error"
            variant="outline"
            @click="cancelReason = ''; cancelConfirmOpen = true"
          />
        </div>

        <!-- Reschedule flow -->
        <div v-if="rescheduleMode" class="mt-4 space-y-4">
          <UButton
            icon="i-lucide-arrow-left"
            label="Voltar"
            color="neutral"
            variant="ghost"
            size="sm"
            @click="rescheduleMode = false"
          />

          <div class="grid gap-4 sm:grid-cols-2">
            <AppointmentsScheduleMonthPicker
              v-model="selectedDate"
              :available-dates="availableDates"
              :loading="slotsLoading"
              @month-change="onMonthChange"
            />

            <div class="space-y-2">
              <p v-if="!selectedDate" class="text-sm text-muted">
                Selecione um novo dia disponível.
              </p>
              <div v-if="selectedDate" class="grid max-h-60 grid-cols-2 gap-2 overflow-y-auto">
                <UButton
                  v-for="slot in slotsForSelectedDate"
                  :key="slot.startAt"
                  :label="formatSlotTime(slot.startAt)"
                  :color="selectedSlot?.startAt === slot.startAt ? 'primary' : 'neutral'"
                  :variant="selectedSlot?.startAt === slot.startAt ? 'solid' : 'outline'"
                  @click="selectedSlot = slot"
                />
                <p v-if="slotsForSelectedDate.length === 0" class="col-span-2 text-sm text-muted">
                  Sem horários livres neste dia.
                </p>
              </div>
              <UButton
                v-if="selectedSlot"
                label="Confirmar novo horário"
                block
                class="mt-2"
                :loading="rescheduling"
                @click="confirmReschedule"
              />
            </div>
          </div>
        </div>

        <UModal v-model:open="cancelConfirmOpen" title="Cancelar reserva?">
          <template #body>
            <div class="space-y-3">
              <p class="text-sm text-muted">
                Isso libera o horário e avisa que o compromisso não vai mais acontecer. Não pode ser desfeito.
              </p>
              <UFormField v-if="booking?.cancellationReasonRequired" label="Motivo do cancelamento" required>
                <UTextarea v-model="cancelReason" :rows="2" class="w-full" />
              </UFormField>
            </div>
          </template>
          <template #footer>
            <div class="flex w-full justify-end gap-2">
              <UButton
                label="Voltar"
                color="neutral"
                variant="outline"
                @click="cancelConfirmOpen = false"
              />
              <UButton
                label="Cancelar reserva"
                color="error"
                :loading="cancelling"
                :disabled="Boolean(booking?.cancellationReasonRequired) && !cancelReason.trim()"
                @click="onCancel"
              />
            </div>
          </template>
        </UModal>
      </template>
    </div>
  </div>
</template>
