<script setup lang="ts">
import type { PublicSchedulingPage, AvailabilitySlot, BookingConfirmation } from '~/types/scheduling'
import { LOCATION_TYPE_META } from '~/types/scheduling'

definePageMeta({ layout: false, ssr: true })

const route = useRoute()
const token = route.params.token as string
const toast = useToast()

const { data: page, error } = await useAsyncData<PublicSchedulingPage>(`schedule-${token}`, () =>
  $fetch<PublicSchedulingPage>(`/api/schedule/${token}`)
)

if (error.value || !page.value) {
  throw createError({ statusCode: 404, statusMessage: 'Página de agendamento não encontrada', fatal: true })
}

const publicPage = computed(() => page.value as PublicSchedulingPage)

useSeoMeta({
  title: publicPage.value.title,
  description: publicPage.value.description ?? 'Agende um horário.',
  robots: 'noindex'
})

const locationMeta = computed(() => LOCATION_TYPE_META[publicPage.value.locationType])

// ─── Guest timezone ─────────────────────────────────────────────────────────
const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
const guestTimezone = ref(detectedTimezone)
const timezoneOptions = (typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [detectedTimezone])
  .map(tz => ({ label: tz, value: tz }))

// ─── Availability ────────────────────────────────────────────────────────────
const slotsLoading = ref(false)
const monthSlots = ref<AvailabilitySlot[]>([])
const selectedDate = ref<string | null>(null)
const selectedSlot = ref<AvailabilitySlot | null>(null)

const availableDates = computed(() => {
  const set = new Set<string>()
  for (const slot of monthSlots.value) {
    const zoned = new Date(slot.startAt).toLocaleDateString('en-CA', { timeZone: guestTimezone.value })
    set.add(zoned)
  }
  return set
})

const slotsForSelectedDate = computed(() => {
  if (!selectedDate.value) return []
  return monthSlots.value
    .filter(s => new Date(s.startAt).toLocaleDateString('en-CA', { timeZone: guestTimezone.value }) === selectedDate.value)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())
})

async function onMonthChange(year: number, month: number) {
  slotsLoading.value = true
  selectedDate.value = null
  selectedSlot.value = null
  try {
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`
    const lastDay = new Date(year, month + 1, 0).getDate()
    const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    const data = await $fetch<{ slots: AvailabilitySlot[] }>(`/api/schedule/${token}/availability`, {
      query: { from, to }
    })
    monthSlots.value = data.slots
  } catch {
    toast.add({ title: 'Erro', description: 'Não foi possível carregar a disponibilidade.', color: 'error' })
  } finally {
    slotsLoading.value = false
  }
}

function formatSlotTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: guestTimezone.value })
}

function formatSelectedDate(): string {
  if (!selectedDate.value) return ''
  return new Date(`${selectedDate.value}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
}

// ─── Booking form ────────────────────────────────────────────────────────────
const step = ref<'pick-time' | 'details' | 'confirmed'>('pick-time')
const guestName = ref('')
const guestEmail = ref('')
const answers = reactive<Record<string, string>>({})
const submitting = ref(false)
const confirmation = ref<BookingConfirmation | null>(null)

function onPickSlot(slot: AvailabilitySlot) {
  selectedSlot.value = slot
  step.value = 'details'
}

async function onConfirm() {
  if (!selectedSlot.value || submitting.value) return
  if (!guestName.value.trim() || !guestEmail.value.trim()) {
    toast.add({ title: 'Erro', description: 'Preencha nome e e-mail.', color: 'error' })
    return
  }

  submitting.value = true
  try {
    const data = await $fetch<BookingConfirmation>(`/api/schedule/${token}/book`, {
      method: 'POST',
      body: {
        startAt: selectedSlot.value.startAt,
        guestName: guestName.value.trim(),
        guestEmail: guestEmail.value.trim(),
        guestTimezone: guestTimezone.value,
        answers: { ...answers }
      }
    })
    confirmation.value = data
    step.value = 'confirmed'
  } catch (err: unknown) {
    const message = (err as { data?: { statusMessage?: string } })?.data?.statusMessage
    toast.add({ title: 'Erro', description: message ?? 'Não foi possível confirmar a reserva.', color: 'error' })
    if ((err as { statusCode?: number })?.statusCode === 409 && selectedDate.value) {
      step.value = 'pick-time'
      await onMonthChange(new Date(selectedDate.value).getFullYear(), new Date(selectedDate.value).getMonth())
    }
  } finally {
    submitting.value = false
  }
}

const manageUrl = computed(() => {
  if (!confirmation.value) return ''
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  return `${base}${confirmation.value.manageUrl}`
})

async function copyManageUrl() {
  try {
    await navigator.clipboard.writeText(manageUrl.value)
    toast.add({ title: 'Link copiado!', color: 'success' })
  } catch {
    toast.add({ title: 'Erro', description: 'Não foi possível copiar o link.', color: 'error' })
  }
}
</script>

<template>
  <div class="min-h-screen bg-default">
    <div class="mx-auto max-w-2xl px-4 py-12">
      <header class="mb-6">
        <p class="text-sm text-muted">
          {{ publicPage.hostName }}
        </p>
        <h1 class="text-2xl font-bold text-highlighted">
          {{ publicPage.title }}
        </h1>
        <p v-if="publicPage.description" class="mt-1 text-sm text-muted">
          {{ publicPage.description }}
        </p>
        <div class="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted">
          <span class="flex items-center gap-1.5">
            <UIcon name="i-lucide-clock" class="size-4" />
            {{ publicPage.durationMinutes }} min
          </span>
          <span class="flex items-center gap-1.5">
            <UIcon :name="locationMeta.icon" class="size-4" />
            {{ locationMeta.label }}
          </span>
        </div>
      </header>

      <!-- Step 1: pick a time -->
      <div v-if="step === 'pick-time'" class="space-y-4">
        <UFormField label="Seu fuso horário">
          <USelect
            v-model="guestTimezone"
            :items="timezoneOptions"
            value-key="value"
            searchable
            class="w-full sm:w-72"
          />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <AppointmentsScheduleMonthPicker
            v-model="selectedDate"
            :available-dates="availableDates"
            :loading="slotsLoading"
            @month-change="onMonthChange"
          />

          <div class="space-y-2">
            <p v-if="selectedDate" class="text-sm font-medium capitalize text-highlighted">
              {{ formatSelectedDate() }}
            </p>
            <p v-else class="text-sm text-muted">
              Selecione um dia disponível.
            </p>
            <div v-if="selectedDate" class="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto">
              <UButton
                v-for="slot in slotsForSelectedDate"
                :key="slot.startAt"
                :label="formatSlotTime(slot.startAt)"
                color="neutral"
                variant="outline"
                @click="onPickSlot(slot)"
              />
              <p v-if="slotsForSelectedDate.length === 0" class="col-span-2 text-sm text-muted">
                Sem horários livres neste dia.
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Step 2: guest details -->
      <div v-else-if="step === 'details'" class="space-y-4">
        <UButton
          icon="i-lucide-arrow-left"
          label="Voltar"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="step = 'pick-time'"
        />

        <div class="rounded-xl border border-default p-3 text-sm">
          <p class="font-medium text-highlighted">
            {{ formatSelectedDate() }}
          </p>
          <p class="text-muted">
            {{ selectedSlot ? formatSlotTime(selectedSlot.startAt) : '' }} ({{ guestTimezone }})
          </p>
        </div>

        <UFormField label="Nome" required>
          <UInput v-model="guestName" class="w-full" />
        </UFormField>
        <UFormField label="E-mail" required>
          <UInput v-model="guestEmail" type="email" class="w-full" />
        </UFormField>

        <UFormField
          v-for="q in publicPage.questions"
          :key="q.id"
          :label="q.label"
          :required="q.isRequired"
        >
          <UTextarea v-if="q.type === 'textarea'" v-model="answers[q.id]" class="w-full" />
          <USelect
            v-else-if="q.type === 'select'"
            v-model="answers[q.id]"
            :items="(q.options ?? []).map(o => ({ label: o, value: o }))"
            value-key="value"
            class="w-full"
          />
          <UInput v-else v-model="answers[q.id]" class="w-full" />
        </UFormField>

        <UButton
          label="Confirmar"
          block
          :loading="submitting"
          :disabled="submitting"
          @click="onConfirm"
        />
      </div>

      <!-- Step 3: confirmation -->
      <div v-else class="space-y-4 text-center">
        <UIcon name="i-lucide-check-circle-2" class="mx-auto size-14 text-success" />
        <h2 class="text-xl font-semibold text-highlighted">
          Reserva confirmada!
        </h2>
        <p class="text-sm text-muted">
          {{ formatSelectedDate() }} às {{ selectedSlot ? formatSlotTime(selectedSlot.startAt) : '' }} ({{ guestTimezone }})
        </p>
        <div class="mx-auto flex max-w-md items-center gap-2">
          <UInput
            :model-value="manageUrl"
            readonly
            size="sm"
            class="flex-1"
          />
          <UButton
            icon="i-lucide-copy"
            size="sm"
            color="neutral"
            variant="subtle"
            @click="copyManageUrl"
          />
        </div>
        <p class="text-xs text-dimmed">
          Guarde este link para reagendar ou cancelar depois.
        </p>
      </div>
    </div>
  </div>
</template>
