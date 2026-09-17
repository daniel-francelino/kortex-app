<script setup lang="ts">
import type { Calendar } from "~/types/appointments";
import { SchedulingLocationType } from "~/types/scheduling";
import { detectBrowserTimeZone } from "#shared/utils/dateTime";

const props = defineProps<{
  open: boolean;
  calendars: Calendar[] | null | undefined;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  created: [pageId: string];
}>();

const { createSchedulingPage } = useSchedulingPages();

const title = ref("");
const durationMinutes = ref(30);
const calendarId = ref("");
const loading = ref(false);

const durationChips = [15, 30, 45, 60];

const calendarOptions = computed(() =>
  (props.calendars ?? []).map((c) => ({ label: c.name, value: c.id })),
);
const showCalendarField = computed(() => (props.calendars ?? []).length > 1);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    title.value = "";
    durationMinutes.value = 30;
    calendarId.value = props.calendars?.[0]?.id ?? "";
  },
);

watch(calendarOptions, (options) => {
  if (props.open && !calendarId.value)
    calendarId.value = options[0]?.value ?? "";
});

const canSubmit = computed(
  () =>
    title.value.trim().length > 0 &&
    Boolean(calendarId.value) &&
    Number.isInteger(durationMinutes.value) &&
    durationMinutes.value >= 5 &&
    durationMinutes.value <= 480,
);

async function onSubmit() {
  if (!canSubmit.value || loading.value) return;
  loading.value = true;
  try {
    const page = await createSchedulingPage({
      calendarId: calendarId.value,
      title: title.value.trim(),
      durationMinutes: durationMinutes.value,
      locationType: SchedulingLocationType.VideoLink,
      timezone: detectBrowserTimeZone() ?? "UTC",
      // Incremento = duração por padrão (docs/appointments/AUDITORIA_LINK_AGENDAMENTO_UX.md
      // §1.2) — sem isso o padrão anterior (15 min fixo) oferecia horários
      // sobrepostos para reuniões de 30/45/60 min sem motivo aparente.
      slotIncrementMinutes: durationMinutes.value,
      availabilityRules: [1, 2, 3, 4, 5].map((day) => ({
        dayOfWeek: day,
        startTime: "09:00",
        endTime: "18:00",
      })),
    });

    if (page) {
      emit("update:open", false);
      emit("created", page.id);
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <UModal
    :open="open"
    title="Crie seu link de agendamento"
    description="Comece pelo essencial. Na próxima etapa, personalize sua disponibilidade e as regras da reserva."
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="space-y-6">
        <div
          class="flex items-center gap-3 rounded-xl border border-default bg-elevated/40 p-4"
        >
          <div
            class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-default ring-1 ring-default"
          >
            <UIcon name="i-lucide-calendar-plus" class="size-5 text-primary" />
          </div>
          <div>
            <p class="text-sm font-medium text-highlighted">
              Um convite, sem troca de mensagens
            </p>
            <p class="mt-1 text-xs leading-relaxed text-muted">
              Seus convidados escolhem um horário livre pelo link.
            </p>
          </div>
        </div>
        <UFormField
          label="Nome do evento"
          description="Use um nome que seus convidados reconheçam."
          required
        >
          <UInput
            v-model="title"
            placeholder="Ex.: Reunião de 30 minutos"
            class="w-full"
            autofocus
            @keyup.enter="onSubmit"
          />
        </UFormField>
        <UFormField label="Duração">
          <div class="space-y-3">
            <div class="grid grid-cols-4 gap-2">
              <UButton
                v-for="d in durationChips"
                :key="d"
                :label="`${d} min`"
                color="neutral"
                :variant="durationMinutes === d ? 'solid' : 'outline'"
                :aria-pressed="durationMinutes === d"
                class="justify-center"
                @click="durationMinutes = d"
              />
            </div>
            <div class="flex items-center gap-3">
              <span class="text-sm text-muted"> Personalizar </span>
              <UInputNumber
                v-model="durationMinutes"
                :min="5"
                :max="480"
                class="w-32"
                aria-label="Duração em minutos"
              />
              <span class="text-sm text-muted"> min </span>
            </div>
          </div>
        </UFormField>
        <p
          v-if="!calendarOptions.length"
          class="rounded-lg bg-warning/10 p-3 text-sm text-warning"
        >
          É necessário ter um calendário disponível para criar sua página.
        </p>
        <div class="flex items-start gap-2 text-xs leading-relaxed text-muted">
          <UIcon name="i-lucide-clock" class="mt-0.5 size-4 shrink-0" />
          <p>
            Disponibilidade inicial: segunda a sexta, das 09:00 às 18:00. Você
            pode ajustar os horários na próxima etapa.
          </p>
        </div>
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
          label="Criar e personalizar"
          icon="i-lucide-arrow-right"
          trailing
          :loading="loading"
          :disabled="!canSubmit || loading"
          @click="onSubmit"
        />
      </div>
    </template>
  </UModal>
</template>
