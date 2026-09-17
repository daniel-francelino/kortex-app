<script setup lang="ts">
import type {
  PublicSchedulingPage,
  AvailabilitySlot,
  BookingConfirmation,
} from "~/types/scheduling";
import { BookingStatus, LOCATION_TYPE_META } from "~/types/scheduling";
import {
  detectBrowserTimeZone,
  formatDisplay,
  addCalendarDays,
  parseCalendarDate,
  todayInZone,
} from "#shared/utils/dateTime";

definePageMeta({ layout: false, ssr: true });

const route = useRoute();
const token = route.params.token as string;
const toast = useToast();

const { data: page, error } = await useAsyncData<PublicSchedulingPage>(
  `schedule-${token}`,
  () => $fetch<PublicSchedulingPage>(`/api/schedule/${token}`),
);

if (error.value || !page.value) {
  throw createError({
    statusCode: 404,
    statusMessage: "Página de agendamento não encontrada",
    fatal: true,
  });
}

const publicPage = computed(() => page.value as PublicSchedulingPage);

useSeoMeta({
  title: publicPage.value.title,
  description: publicPage.value.description ?? "Agende um horário.",
  robots: "noindex",
});

const locationMeta = computed(
  () => LOCATION_TYPE_META[publicPage.value.locationType],
);

// ─── Guest timezone ─────────────────────────────────────────────────────────
const detectedTimezone = detectBrowserTimeZone() ?? "UTC";
const guestTimezone = ref(detectedTimezone);
const timezoneOptions = (
  typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("timeZone")
    : [detectedTimezone]
).map((tz) => ({ label: tz, value: tz }));

// ─── Availability ────────────────────────────────────────────────────────────
const slotsLoading = ref(false);
const monthSlots = ref<AvailabilitySlot[]>([]);
const selectedDate = ref<string | null>(null);
const selectedSlot = ref<AvailabilitySlot | null>(null);

const availableDates = computed(() => {
  const set = new Set<string>();
  for (const slot of monthSlots.value) {
    const zoned = new Date(slot.startAt).toLocaleDateString("en-CA", {
      timeZone: guestTimezone.value,
    });
    set.add(zoned);
  }
  return set;
});

const slotsForSelectedDate = computed(() => {
  if (!selectedDate.value) return [];
  return monthSlots.value
    .filter(
      (s) =>
        new Date(s.startAt).toLocaleDateString("en-CA", {
          timeZone: guestTimezone.value,
        }) === selectedDate.value,
    )
    .sort(
      (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
    );
});

const monthLoaded = ref(false);
const slotsError = ref(false);
let availabilityRequest = 0;
const displayedMonth = ref({
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
});
const monthPickerRef = useTemplateRef("monthPickerRef");

async function onMonthChange(year: number, month: number) {
  const request = ++availabilityRequest;
  displayedMonth.value = { year, month };
  slotsLoading.value = true;
  slotsError.value = false;
  monthSlots.value = [];
  monthLoaded.value = false;
  selectedDate.value = null;
  selectedSlot.value = null;
  try {
    const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const data = await $fetch<{ slots: AvailabilitySlot[] }>(
      `/api/schedule/${token}/availability`,
      {
        query: { from, to },
      },
    );
    if (request === availabilityRequest) monthSlots.value = data.slots;
  } catch {
    if (request === availabilityRequest) slotsError.value = true;
  } finally {
    if (request === availabilityRequest) {
      slotsLoading.value = false;
      monthLoaded.value = true;
    }
  }
}

function goToNextAvailableMonth() {
  monthPickerRef.value?.goNextMonth();
}

// "Horários disponíveis até {data}" — deriva de maxAdvanceDays, um campo de
// dias-calendário (não um instante), por isso usa as funções de data pura
// (addCalendarDays/parseCalendarDate), não fromZonedTime/toZonedTime.
const availableUntilLabel = computed(() => {
  const todayStr = todayInZone(guestTimezone.value);
  const untilStr = addCalendarDays(todayStr, publicPage.value.maxAdvanceDays);
  const raw = formatDisplay(parseCalendarDate(untilStr), "dd 'de' MMMM");
  return raw;
});

function formatSlotTime(iso: string): string {
  return formatDisplay(iso, "HH:mm", { timeZone: guestTimezone.value });
}

function formatSelectedDate(): string {
  if (!selectedDate.value) return "";
  const raw = formatDisplay(
    new Date(`${selectedDate.value}T12:00:00Z`),
    "EEEE, dd 'de' MMMM",
  );
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// ─── Booking form ────────────────────────────────────────────────────────────
const step = ref<"pick-time" | "details" | "confirmed">("pick-time");
const guestName = ref("");
const guestEmail = ref("");
const answers = reactive<Record<string, string>>({});
const submitting = ref(false);
const confirmation = ref<BookingConfirmation | null>(null);

function onPickSlot(slot: AvailabilitySlot) {
  selectedSlot.value = slot;
  step.value = "details";
}

async function onConfirm() {
  if (!selectedSlot.value || submitting.value) return;
  if (!guestName.value.trim() || !guestEmail.value.trim()) {
    toast.add({
      title: "Erro",
      description: "Preencha nome e e-mail.",
      color: "error",
    });
    return;
  }

  submitting.value = true;
  try {
    const data = await $fetch<BookingConfirmation>(
      `/api/schedule/${token}/book`,
      {
        method: "POST",
        body: {
          startAt: selectedSlot.value.startAt,
          guestName: guestName.value.trim(),
          guestEmail: guestEmail.value.trim(),
          guestTimezone: guestTimezone.value,
          answers: { ...answers },
        },
      },
    );
    confirmation.value = data;
    step.value = "confirmed";
  } catch (err: unknown) {
    const message = (err as { data?: { statusMessage?: string } })?.data
      ?.statusMessage;
    toast.add({
      title: "Erro",
      description: message ?? "Não foi possível confirmar a reserva.",
      color: "error",
    });
    if (
      (err as { statusCode?: number })?.statusCode === 409 &&
      selectedDate.value
    ) {
      step.value = "pick-time";
      await onMonthChange(
        new Date(selectedDate.value).getFullYear(),
        new Date(selectedDate.value).getMonth(),
      );
    }
  } finally {
    submitting.value = false;
  }
}

const manageUrl = computed(() => {
  if (!confirmation.value) return "";
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}${confirmation.value.manageUrl}`;
});

const isPendingConfirmation = computed(
  () => confirmation.value?.booking.status === BookingStatus.Pending,
);

async function copyManageUrl() {
  try {
    await navigator.clipboard.writeText(manageUrl.value);
    toast.add({ title: "Link copiado!", color: "success" });
  } catch {
    toast.add({
      title: "Erro",
      description: "Não foi possível copiar o link.",
      color: "error",
    });
  }
}

// ─── Adicionar ao calendário ─────────────────────────────────────────────────
// Todos os três derivam só do que já está em memória (a reserva acabou de ser
// confirmada) — zero chamada de rede adicional, zero endpoint novo.
function toUtcCompact(iso: string): string {
  return iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

const calendarEventTitle = computed(
  () => `${publicPage.value.title} — ${publicPage.value.hostName}`,
);

const googleCalendarUrl = computed(() => {
  if (!confirmation.value || !selectedSlot.value) return "";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: calendarEventTitle.value,
    dates: `${toUtcCompact(selectedSlot.value.startAt)}/${toUtcCompact(selectedSlot.value.endAt)}`,
    details: publicPage.value.description ?? "",
    location: publicPage.value.locationDetails ?? "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
});

const outlookCalendarUrl = computed(() => {
  if (!confirmation.value || !selectedSlot.value) return "";
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: calendarEventTitle.value,
    startdt: selectedSlot.value.startAt,
    enddt: selectedSlot.value.endAt,
    body: publicPage.value.description ?? "",
    location: publicPage.value.locationDetails ?? "",
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
});

const icsDataUrl = computed(() => {
  if (!confirmation.value || !selectedSlot.value) return "";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kortex//Agendamento//PT",
    "BEGIN:VEVENT",
    `UID:${confirmation.value.booking.id}@kortex`,
    `DTSTAMP:${toUtcCompact(new Date().toISOString())}`,
    `DTSTART:${toUtcCompact(selectedSlot.value.startAt)}`,
    `DTEND:${toUtcCompact(selectedSlot.value.endAt)}`,
    `SUMMARY:${calendarEventTitle.value}`,
    publicPage.value.locationDetails
      ? `LOCATION:${publicPage.value.locationDetails}`
      : "",
    publicPage.value.description
      ? `DESCRIPTION:${publicPage.value.description}`
      : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join("\r\n"))}`;
});
</script>

<template>
  <div
    class="min-h-screen bg-elevated/40 px-4 py-6 sm:px-6 sm:py-12 lg:flex lg:items-center lg:py-16"
  >
    <div
      class="mx-auto grid w-full max-w-5xl overflow-hidden rounded-2xl border border-default bg-default shadow-sm lg:grid-cols-[280px_minmax(0,1fr)]"
    >
      <header
        class="border-b border-default p-6 sm:p-8 lg:border-r lg:border-b-0"
      >
        <div class="flex items-center gap-2">
          <UAvatar
            :src="publicPage.hostAvatarUrl ?? undefined"
            :alt="publicPage.hostName"
            size="sm"
          />
          <p class="text-sm text-muted">
            {{ publicPage.hostName }}
          </p>
        </div>
        <h1
          class="mt-5 break-words text-2xl font-semibold tracking-tight text-highlighted"
        >
          {{ publicPage.title }}
        </h1>
        <p
          v-if="publicPage.description"
          class="mt-3 whitespace-pre-line text-sm leading-relaxed text-muted"
        >
          {{ publicPage.description }}
        </p>
        <div class="mt-6 flex flex-wrap gap-4 text-sm text-muted lg:flex-col">
          <span class="flex items-center gap-1.5">
            <UIcon name="i-lucide-clock" class="size-4" />
            {{ publicPage.durationMinutes }} min
          </span>
          <span class="flex items-center gap-1.5">
            <UIcon :name="locationMeta.icon" class="size-4" />
            {{ locationMeta.label }}
          </span>
        </div>
        <p class="mt-6 flex items-center gap-2 text-xs text-dimmed">
          <UIcon name="i-lucide-globe" class="size-4 shrink-0" />Horários no seu
          fuso horário
        </p>
      </header>

      <main class="min-w-0 p-5 sm:p-8">
        <!-- Indicador de passo -->
        <ol
          v-if="step !== 'confirmed'"
          aria-label="Etapas do agendamento"
          class="mb-7 flex items-center gap-3 text-xs"
        >
          <li
            class="flex items-center gap-2"
            :class="
              step === 'pick-time'
                ? 'font-medium text-highlighted'
                : 'text-muted'
            "
            :aria-current="step === 'pick-time' ? 'step' : undefined"
          >
            <span
              class="flex size-6 items-center justify-center rounded-full bg-elevated ring-1 ring-default"
              >1</span
            >Data e horário
          </li>
          <li aria-hidden="true" class="h-px flex-1 bg-accented" />
          <li
            class="flex items-center gap-2"
            :class="
              step === 'details' ? 'font-medium text-highlighted' : 'text-muted'
            "
            :aria-current="step === 'details' ? 'step' : undefined"
          >
            <span
              class="flex size-6 items-center justify-center rounded-full bg-elevated ring-1 ring-default"
              >2</span
            >Seus dados
          </li>
        </ol>

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

          <p class="text-xs text-muted">
            Horários disponíveis até {{ availableUntilLabel }}.
          </p>

          <div class="grid gap-4 sm:grid-cols-2">
            <AppointmentsScheduleMonthPicker
              ref="monthPickerRef"
              v-model="selectedDate"
              :available-dates="availableDates"
              :loading="slotsLoading"
              @month-change="onMonthChange"
            />

            <div
              class="space-y-3 rounded-xl border border-default bg-elevated/20 p-4"
              aria-live="polite"
            >
              <template v-if="slotsError">
                <UIcon name="i-lucide-cloud-alert" class="size-6 text-muted" />
                <p class="text-sm text-muted">
                  Não foi possível carregar os horários.
                </p>
                <UButton
                  label="Tentar novamente"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  @click="
                    onMonthChange(displayedMonth.year, displayedMonth.month)
                  "
                />
              </template>
              <div v-else-if="slotsLoading" class="space-y-2">
                <p class="text-sm text-muted">Buscando horários...</p>
                <USkeleton
                  v-for="i in 5"
                  :key="i"
                  class="h-10 w-full rounded-lg"
                />
              </div>
              <template v-else-if="monthLoaded && availableDates.size === 0">
                <p class="text-sm text-muted">
                  Nenhum horário disponível neste mês.
                </p>
                <UButton
                  label="Ver próximo mês"
                  icon="i-lucide-arrow-right"
                  trailing
                  size="sm"
                  color="neutral"
                  variant="subtle"
                  @click="goToNextAvailableMonth"
                />
              </template>
              <template v-else>
                <p
                  v-if="selectedDate"
                  class="text-sm font-medium text-highlighted"
                >
                  {{ formatSelectedDate() }}
                </p>
                <p v-else class="text-sm text-muted">
                  Selecione um dia disponível.
                </p>
                <div
                  v-if="selectedDate"
                  class="grid max-h-80 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-1"
                >
                  <UButton
                    v-for="slot in slotsForSelectedDate"
                    :key="slot.startAt"
                    :label="formatSlotTime(slot.startAt)"
                    color="neutral"
                    variant="outline"
                    class="min-h-10 justify-center"
                    @click="onPickSlot(slot)"
                  />
                  <p
                    v-if="slotsForSelectedDate.length === 0"
                    class="col-span-2 text-sm text-muted"
                  >
                    Sem horários livres neste dia.
                  </p>
                </div>
              </template>
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

          <div
            class="sticky top-0 z-10 -mx-4 border-b border-default bg-default px-4 py-3 text-sm sm:static sm:mx-0 sm:rounded-xl sm:border sm:p-3"
          >
            <p class="font-medium text-highlighted">
              {{ formatSelectedDate() }}
            </p>
            <p class="text-muted">
              {{ selectedSlot ? formatSlotTime(selectedSlot.startAt) : "" }} ({{
                guestTimezone
              }})
            </p>
          </div>

          <UFormField label="Nome" required>
            <UInput
              v-model="guestName"
              autocomplete="name"
              placeholder="Seu nome completo"
              size="lg"
              class="w-full"
            />
          </UFormField>
          <UFormField label="E-mail" required>
            <UInput
              v-model="guestEmail"
              type="email"
              autocomplete="email"
              placeholder="voce@exemplo.com"
              size="lg"
              class="w-full"
            />
          </UFormField>

          <UFormField
            v-for="q in publicPage.questions"
            :key="q.id"
            :label="q.label"
            :required="q.isRequired"
          >
            <UTextarea
              v-if="q.type === 'textarea'"
              v-model="answers[q.id]"
              class="w-full"
            />
            <USelect
              v-else-if="q.type === 'select'"
              v-model="answers[q.id]"
              :items="(q.options ?? []).map((o) => ({ label: o, value: o }))"
              value-key="value"
              class="w-full"
            />
            <UInput v-else v-model="answers[q.id]" class="w-full" />
          </UFormField>

          <UButton
            label="Confirmar agendamento"
            size="lg"
            block
            :loading="submitting"
            :disabled="submitting"
            @click="onConfirm"
          />
        </div>

        <!-- Step 3: confirmation -->
        <div v-else class="space-y-5 py-6 text-center" role="status">
          <UIcon
            :name="
              isPendingConfirmation
                ? 'i-lucide-clock'
                : 'i-lucide-check-circle-2'
            "
            class="mx-auto size-14"
            :class="isPendingConfirmation ? 'text-warning' : 'text-success'"
          />
          <h2 class="text-xl font-semibold text-highlighted">
            {{
              isPendingConfirmation
                ? `Pedido enviado — aguardando confirmação de ${publicPage.hostName}`
                : "Reserva confirmada!"
            }}
          </h2>
          <p class="text-sm text-muted">
            {{ formatSelectedDate() }} às
            {{ selectedSlot ? formatSlotTime(selectedSlot.startAt) : "" }} ({{
              guestTimezone
            }})
          </p>

          <div
            v-if="!isPendingConfirmation"
            class="flex flex-wrap items-center justify-center gap-2"
          >
            <UButton
              label="Google Calendar"
              icon="i-lucide-calendar-plus"
              size="sm"
              color="neutral"
              variant="outline"
              :to="googleCalendarUrl"
              target="_blank"
            />
            <UButton
              label="Outlook"
              icon="i-lucide-calendar-plus"
              size="sm"
              color="neutral"
              variant="outline"
              :to="outlookCalendarUrl"
              target="_blank"
            />
            <UButton
              label="Apple / .ics"
              icon="i-lucide-download"
              size="sm"
              color="neutral"
              variant="outline"
              :to="icsDataUrl"
              download="reserva.ics"
            />
          </div>

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
      </main>
    </div>
  </div>
</template>
