<script setup lang="ts">
import type { Booking, SchedulingPage } from '~/types/scheduling'
import { BookingStatus, LOCATION_TYPE_META } from '~/types/scheduling'
import { formatDisplay } from '#shared/utils/dateTime'

const props = defineProps<{
  open: boolean
  booking: Booking | null
  page: SchedulingPage | null
  approving?: boolean
  cancelling?: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  approve: [bookingId: string]
  cancel: [bookingId: string, reason: string | undefined]
}>()

const STATUS_META: Record<BookingStatus, { label: string, color: 'success' | 'error' | 'warning' | 'neutral' }> = {
  [BookingStatus.Confirmed]: { label: 'Confirmada', color: 'success' },
  [BookingStatus.Pending]: { label: 'Pendente', color: 'warning' },
  [BookingStatus.Cancelled]: { label: 'Cancelada', color: 'error' },
  [BookingStatus.Rescheduled]: { label: 'Reagendada', color: 'neutral' }
}

const cancelConfirmOpen = ref(false)
const cancelReason = ref('')

// Perguntas ocultas continuam existindo na página (podem ter sido respondidas
// antes de o anfitrião escondê-las depois) — mostrar mesmo assim, a resposta
// já foi dada pelo convidado.
const answersList = computed(() => {
  if (!props.booking || !props.page?.questions) return []
  return props.page.questions
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(q => ({
      id: q.id,
      label: q.label,
      value: props.booking!.answers[q.id]?.trim() || '—'
    }))
})

const locationMeta = computed(() => props.page ? LOCATION_TYPE_META[props.page.locationType] : null)

function formatDateTime(iso: string | null): string {
  if (!iso) return 'Horário não disponível'
  const raw = formatDisplay(iso, "EEEE, dd 'de' MMMM 'às' HH:mm")
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

function onOpenCancelConfirm() {
  cancelReason.value = ''
  cancelConfirmOpen.value = true
}

function onConfirmCancel() {
  if (!props.booking) return
  emit('cancel', props.booking.id, cancelReason.value.trim() || undefined)
  cancelConfirmOpen.value = false
}

function onApprove() {
  if (!props.booking) return
  emit('approve', props.booking.id)
}
</script>

<template>
  <USlideover :open="open" title="Detalhes da reserva" @update:open="emit('update:open', $event)">
    <template #body>
      <div v-if="booking" class="space-y-5">
        <div class="flex items-start justify-between gap-3">
          <div>
            <p class="font-medium text-highlighted">
              {{ booking.guestName }}
            </p>
            <p class="text-sm text-muted">
              {{ booking.guestEmail }}
            </p>
          </div>
          <UBadge :color="STATUS_META[booking.status].color" variant="subtle">
            {{ STATUS_META[booking.status].label }}
          </UBadge>
        </div>

        <div class="space-y-2 rounded-xl border border-default p-3 text-sm">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-clock" class="size-4 shrink-0 text-muted" />
            <span>{{ formatDateTime(booking.startAt) }}</span>
          </div>
          <div v-if="locationMeta" class="flex items-center gap-2">
            <UIcon :name="locationMeta.icon" class="size-4 shrink-0 text-muted" />
            <span>{{ locationMeta.label }}<template v-if="page?.locationDetails"> — {{ page.locationDetails }}</template></span>
          </div>
        </div>

        <div v-if="answersList.length > 0" class="space-y-3">
          <p class="text-sm font-medium text-highlighted">
            Respostas do formulário
          </p>
          <div v-for="a in answersList" :key="a.id" class="space-y-0.5">
            <p class="text-xs text-muted">
              {{ a.label }}
            </p>
            <p class="text-sm text-highlighted">
              {{ a.value }}
            </p>
          </div>
        </div>

        <p v-if="booking.cancellationReason" class="text-sm text-muted">
          <span class="font-medium text-highlighted">Motivo do cancelamento:</span> {{ booking.cancellationReason }}
        </p>

        <UButton
          v-if="page"
          label="Abrir Agenda"
          icon="i-lucide-external-link"
          color="neutral"
          variant="subtle"
          size="sm"
          to="/app/appointments"
        />
      </div>
    </template>

    <template v-if="booking && booking.status !== BookingStatus.Cancelled" #footer>
      <div class="flex w-full justify-end gap-2">
        <template v-if="booking.status === BookingStatus.Pending">
          <UButton
            label="Recusar"
            color="error"
            variant="outline"
            :loading="cancelling"
            @click="onOpenCancelConfirm"
          />
          <UButton
            label="Aprovar"
            :loading="approving"
            @click="onApprove"
          />
        </template>
        <UButton
          v-else
          label="Cancelar reserva"
          color="error"
          variant="outline"
          :loading="cancelling"
          @click="onOpenCancelConfirm"
        />
      </div>
    </template>
  </USlideover>

  <UModal v-model:open="cancelConfirmOpen" :title="booking?.status === BookingStatus.Pending ? 'Recusar reserva?' : 'Cancelar reserva?'">
    <template #body>
      <div class="space-y-3">
        <p class="text-sm text-muted">
          {{ booking?.status === BookingStatus.Pending
            ? 'O convidado será avisado que o pedido foi recusado e o horário volta a ficar livre.'
            : 'Isso libera o horário e avisa que o compromisso não vai mais acontecer.' }}
        </p>
        <UFormField label="Motivo (opcional)">
          <UTextarea v-model="cancelReason" :rows="2" class="w-full" />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Voltar" color="neutral" variant="outline" @click="cancelConfirmOpen = false" />
        <UButton
          :label="booking?.status === BookingStatus.Pending ? 'Recusar' : 'Cancelar reserva'"
          color="error"
          :loading="cancelling"
          @click="onConfirmCancel"
        />
      </div>
    </template>
  </UModal>
</template>
