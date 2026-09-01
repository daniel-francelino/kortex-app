<script setup lang="ts">
import type { Calendar } from '~/types/appointments'
import { SchedulingLocationType } from '~/types/scheduling'
import { detectBrowserTimeZone } from '#shared/utils/dateTime'

const props = defineProps<{
  open: boolean
  calendars: Calendar[] | null | undefined
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'created': [pageId: string]
}>()

const { createSchedulingPage } = useSchedulingPages()

const title = ref('')
const durationMinutes = ref(30)
const calendarId = ref('')
const loading = ref(false)

const durationChips = [15, 30, 45, 60]

const calendarOptions = computed(() => (props.calendars ?? []).map(c => ({ label: c.name, value: c.id })))
const showCalendarField = computed(() => (props.calendars ?? []).length > 1)

watch(() => props.open, (open) => {
  if (!open) return
  title.value = ''
  durationMinutes.value = 30
  calendarId.value = props.calendars?.[0]?.id ?? ''
})

const canSubmit = computed(() => title.value.trim().length > 0 && Boolean(calendarId.value) && durationMinutes.value >= 5)

async function onSubmit() {
  if (!canSubmit.value || loading.value) return
  loading.value = true
  try {
    const page = await createSchedulingPage({
      calendarId: calendarId.value,
      title: title.value.trim(),
      durationMinutes: durationMinutes.value,
      locationType: SchedulingLocationType.VideoLink,
      timezone: detectBrowserTimeZone() ?? 'UTC',
      availabilityRules: [1, 2, 3, 4, 5].map(day => ({ dayOfWeek: day, startTime: '09:00', endTime: '18:00' }))
    })

    if (page) {
      emit('update:open', false)
      emit('created', page.id)
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal :open="open" title="Nova página de agendamento" @update:open="emit('update:open', $event)">
    <template #body>
      <div class="space-y-4">
        <UFormField label="Título">
          <UInput
            v-model="title"
            placeholder="Ex.: Reunião de 30 minutos"
            class="w-full"
            autofocus
            @keyup.enter="onSubmit"
          />
        </UFormField>

        <UFormField label="Duração">
          <div class="flex items-center gap-2">
            <UInputNumber
              v-model="durationMinutes"
              :min="5"
              :max="480"
              class="w-32"
            />
            <span class="text-sm text-muted">min</span>
            <div class="ml-2 flex gap-1">
              <UButton
                v-for="d in durationChips"
                :key="d"
                :label="String(d)"
                size="xs"
                :color="durationMinutes === d ? 'primary' : 'neutral'"
                :variant="durationMinutes === d ? 'soft' : 'ghost'"
                @click="durationMinutes = d"
              />
            </div>
          </div>
        </UFormField>

        <UFormField v-if="showCalendarField" label="Calendário">
          <USelect
            v-model="calendarId"
            :items="calendarOptions"
            value-key="value"
            class="w-full"
          />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancelar"
          color="neutral"
          variant="subtle"
          @click="emit('update:open', false)"
        />
        <UButton
          label="Continuar"
          :loading="loading"
          :disabled="!canSubmit || loading"
          @click="onSubmit"
        />
      </div>
    </template>
  </UModal>
</template>
