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

// The entire booking flow (steps 1–3) for a scheduling page, shared between
// the opaque-token entry point (agendar/[token].vue) and the username+slug
// entry point ([username]/[slug].vue) — they only differ in how the page was
// resolved server-side and which base path the availability/book requests
// hit, everything else (this whole component) is identical. See
// docs/appointments/PLANO_USERNAME_PERFIL_PUBLICO.md §7.1/§7.2.
const props = defineProps<{
  publicPage: PublicSchedulingPage;
  /** e.g. `/api/schedule/{token}` or `/api/profile/{username}/{slug}` — this
   * component appends `/availability` and `/book` to it. */
  apiBase: string;
}>();

const toast = useToast();
const publicPage = computed(() => props.publicPage);

const locationMeta = computed(
  () => LOCATION_TYPE_META[publicPage.value.locationType],
);

// ─── Guest timezone ─────────────────────────────────────────────────────────
const detectedTimezone = detectBrowserTimeZone() ?? "UTC";
const guestTimezone = ref(detectedTimezone);
const hourFormat = ref<"12" | "24">("24");
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
      `${props.apiBase}/availability`,
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
  return formatDisplay(iso, hourFormat.value === "12" ? "h:mma" : "HH:mm", {
    timeZone: guestTimezone.value,
  });
}

function formatSelectedDate(): string {
  if (!selectedDate.value) return "";
  const raw = formatDisplay(
    new Date(`${selectedDate.value}T12:00:00Z`),
    "EEEE, dd 'de' MMMM",
    { timeZone: "UTC" },
  );
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// ─── Booking form ────────────────────────────────────────────────────────────
const step = ref<"pick-time" | "details" | "confirmed">("pick-time");
watch(availableDates, (dates) => {
  if (step.value !== "pick-time") return;
  if (!selectedDate.value || !dates.has(selectedDate.value)) {
    selectedDate.value = [...dates].sort()[0] ?? null;
  }
});
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
    const data = await $fetch<BookingConfirmation>(`${props.apiBase}/book`, {
      method: "POST",
      body: {
        startAt: selectedSlot.value.startAt,
        guestName: guestName.value.trim(),
        guestEmail: guestEmail.value.trim(),
        guestTimezone: guestTimezone.value,
        answers: { ...answers },
      },
    });
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
      const conflictDate = parseCalendarDate(selectedDate.value);
      await onMonthChange(conflictDate.getFullYear(), conflictDate.getMonth());
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
  <div class="booking-page">
    <div
      class="booking-shell"
      :class="{ 'booking-shell--compact': step !== 'pick-time' }"
    >
      <div class="booking-card">
        <img
          v-if="publicPage.coverImageUrl"
          :src="publicPage.coverImageUrl"
          alt=""
          class="booking-cover"
        />
        <div class="booking-layout">
          <header class="booking-summary">
            <UAvatar
              :src="publicPage.hostAvatarUrl ?? undefined"
              :alt="publicPage.hostName"
              size="xs"
            />
            <p class="mt-2 text-sm font-medium text-muted">
              {{ publicPage.hostName }}
            </p>
            <h1
              class="mt-2 break-words text-xl font-semibold tracking-tight text-highlighted"
            >
              {{ publicPage.title }}
            </h1>
            <p
              v-if="publicPage.description"
              class="mt-2 whitespace-pre-line text-sm leading-5 text-toned"
            >
              {{ publicPage.description }}
            </p>

            <div class="mt-8 space-y-5 text-sm text-toned">
              <div
                v-if="selectedSlot && step !== 'pick-time'"
                class="flex items-start gap-2.5"
              >
                <UIcon
                  name="i-lucide-calendar"
                  class="mt-0.5 size-4 shrink-0"
                />
                <div>
                  <p>{{ formatSelectedDate() }}</p>
                  <p class="mt-1">
                    {{ formatSlotTime(selectedSlot.startAt) }} –
                    {{ formatSlotTime(selectedSlot.endAt) }}
                  </p>
                </div>
              </div>
              <p
                v-if="publicPage.requiresConfirmation"
                class="flex items-center gap-2.5"
              >
                <UIcon
                  name="i-lucide-calendar-check"
                  class="size-4 shrink-0"
                />Requer confirmação
              </p>
              <p class="flex items-center gap-2.5">
                <UIcon name="i-lucide-clock" class="size-4 shrink-0" />{{
                  publicPage.durationMinutes
                }}
                min
              </p>
              <p class="flex items-center gap-2.5">
                <UIcon :name="locationMeta.icon" class="size-4 shrink-0" />{{
                  locationMeta.label
                }}
              </p>
              <div class="flex min-w-0 items-center gap-2">
                <UIcon name="i-lucide-globe" class="size-4 shrink-0" />
                <USelectMenu
                  v-if="step === 'pick-time'"
                  v-model="guestTimezone"
                  :items="timezoneOptions"
                  value-key="value"
                  variant="none"
                  color="neutral"
                  aria-label="Seu fuso horário"
                  :search-input="{ placeholder: 'Buscar fuso horário' }"
                  class="min-w-0 flex-1"
                  :ui="{ base: 'px-0 py-0 text-sm', content: 'min-w-64' }"
                />
                <span v-else class="break-all">{{ guestTimezone }}</span>
              </div>
            </div>
          </header>

          <div v-show="step === 'pick-time'" class="booking-selection">
            <section class="booking-calendar" aria-label="Escolha uma data">
              <AppointmentsScheduleMonthPicker
                ref="monthPickerRef"
                v-model="selectedDate"
                :available-dates="availableDates"
                :loading="slotsLoading"
                :time-zone="guestTimezone"
                embedded
                @month-change="onMonthChange"
              />
            </section>

            <section
              class="booking-times"
              aria-label="Escolha um horário"
              :aria-busy="slotsLoading"
            >
              <div class="mb-4 flex min-h-8 items-center justify-between gap-2">
                <h2 class="text-sm font-medium text-highlighted">
                  {{
                    selectedDate
                      ? formatDisplay(
                          new Date(selectedDate + "T12:00:00Z"),
                          "EEE, dd",
                          { timeZone: "UTC" },
                        )
                      : "Horários"
                  }}
                </h2>
                <div
                  class="booking-hour-format"
                  role="group"
                  aria-label="Formato de hora"
                >
                  <button
                    v-for="format in ['12', '24'] as const"
                    :key="format"
                    type="button"
                    :aria-pressed="hourFormat === format"
                    :class="{ 'is-selected': hourFormat === format }"
                    @click="hourFormat = format"
                  >
                    {{ format }}h
                  </button>
                </div>
              </div>
              <div class="booking-time-list" aria-live="polite">
                <div v-if="slotsError" class="booking-placeholder">
                  <UIcon name="i-lucide-cloud-alert" class="size-6" />
                  <p>Não foi possível carregar os horários.</p>
                  <UButton
                    label="Tentar novamente"
                    color="neutral"
                    variant="outline"
                    size="sm"
                    @click="
                      onMonthChange(displayedMonth.year, displayedMonth.month)
                    "
                  />
                </div>
                <div v-else-if="slotsLoading" class="space-y-2">
                  <USkeleton
                    v-for="i in 8"
                    :key="i"
                    class="h-10 w-full rounded-lg"
                  />
                  <span class="sr-only">Buscando horários disponíveis</span>
                </div>
                <div
                  v-else-if="monthLoaded && availableDates.size === 0"
                  class="booking-placeholder"
                >
                  <UIcon name="i-lucide-calendar-x" class="size-6" />
                  <p>Nenhum horário disponível neste mês.</p>
                  <UButton
                    label="Ver próximo mês"
                    color="neutral"
                    variant="outline"
                    size="sm"
                    @click="goToNextAvailableMonth"
                  />
                </div>
                <div v-else-if="!selectedDate" class="booking-placeholder">
                  <UIcon name="i-lucide-calendar-days" class="size-6" />
                  <p>Selecione um dia para ver os horários disponíveis.</p>
                </div>
                <template v-else>
                  <button
                    v-for="slot in slotsForSelectedDate"
                    :key="slot.startAt"
                    type="button"
                    class="booking-time"
                    @click="onPickSlot(slot)"
                  >
                    <span
                      class="size-2 rounded-full bg-emerald-500"
                      aria-hidden="true"
                    />{{ formatSlotTime(slot.startAt) }}
                  </button>
                  <p
                    v-if="!slotsForSelectedDate.length"
                    class="booking-placeholder"
                  >
                    Sem horários livres neste dia.
                  </p>
                </template>
              </div>
            </section>
          </div>

          <form
            v-if="step === 'details'"
            class="booking-form"
            @submit.prevent="onConfirm"
          >
            <h2 class="sr-only">Seus dados para o agendamento</h2>
            <UFormField label="Seu nome" required>
              <UInput
                v-model="guestName"
                autocomplete="name"
                placeholder="Seu nome completo"
                required
                class="w-full"
              />
            </UFormField>
            <UFormField label="Endereço de e-mail" required>
              <UInput
                v-model="guestEmail"
                type="email"
                autocomplete="email"
                placeholder="voce@exemplo.com"
                required
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
                :required="q.isRequired"
                :rows="3"
                class="w-full"
              />
              <USelect
                v-else-if="q.type === 'select'"
                v-model="answers[q.id]"
                :items="(q.options ?? []).map((o) => ({ label: o, value: o }))"
                value-key="value"
                :required="q.isRequired"
                placeholder="Selecione uma opção"
                class="w-full"
              />
              <UInput
                v-else
                v-model="answers[q.id]"
                :required="q.isRequired"
                class="w-full"
              />
            </UFormField>
            <div class="booking-form-actions">
              <p
                v-if="publicPage.requiresConfirmation"
                class="mb-5 text-xs leading-relaxed text-muted"
              >
                Sua reserva será enviada para confirmação de
                {{ publicPage.hostName }}.
              </p>
              <div class="flex justify-end gap-2">
                <UButton
                  type="button"
                  label="Voltar"
                  color="neutral"
                  variant="ghost"
                  :disabled="submitting"
                  @click="step = 'pick-time'"
                />
                <UButton
                  type="submit"
                  :label="
                    publicPage.requiresConfirmation
                      ? 'Solicitar reserva'
                      : 'Confirmar'
                  "
                  color="neutral"
                  :loading="submitting"
                  :disabled="submitting"
                />
              </div>
            </div>
          </form>
          <!-- Step 3: confirmation -->
          <div
            v-if="step === 'confirmed'"
            class="booking-confirmation space-y-5 text-center"
            role="status"
          >
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
        </div>
      </div>
      <footer class="booking-brand">
        <NuxtLink
          to="/"
          aria-label="Kortex — página inicial"
          class="inline-flex rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          <AppLogo size="sm" />
        </NuxtLink>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.booking-page {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  padding: 64px 24px;
}

.booking-shell {
  width: 100%;
  max-width: 1040px;
  margin: 0 auto;
}
.booking-shell--compact {
  max-width: 760px;
}
.booking-card {
  overflow: hidden;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg);
}
.booking-cover {
  display: block;
  width: 100%;
  height: 160px;
  object-fit: cover;
}
.booking-layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
}
.booking-shell--compact .booking-layout {
  grid-template-columns: 340px minmax(0, 1fr);
}
.booking-summary {
  min-width: 0;
  padding: 24px;
  border-right: 1px solid var(--ui-border);
}
.booking-selection {
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
}
.booking-calendar {
  min-width: 0;
  padding: 20px;
}
.booking-times {
  min-width: 0;
  height: 488px;
  display: flex;
  flex-direction: column;
  padding: 12px 20px 20px;
  border-left: 1px solid var(--ui-border);
}
.booking-time-list {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  padding: 1px 2px 2px;
}
.booking-time {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 38px;
  margin-bottom: 8px;
  border: 1px solid var(--ui-border-accented);
  border-radius: 9px;
  background: var(--ui-bg);
  color: var(--ui-text-highlighted);
  font-size: 14px;
  box-shadow: 0 1px 2px #00000008;
  cursor: pointer;
  transition:
    border-color 150ms,
    background 150ms;
}
.booking-time:hover {
  border-color: var(--ui-text-highlighted);
  background: var(--ui-bg-elevated);
}
.booking-time:focus-visible,
.booking-hour-format button:focus-visible {
  outline: 2px solid var(--ui-text-highlighted);
  outline-offset: 2px;
}
.booking-hour-format {
  display: flex;
  padding: 3px;
  border-radius: 9px;
  background: var(--ui-bg-elevated);
}
.booking-hour-format button {
  padding: 3px 6px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--ui-text-toned);
  cursor: pointer;
}
.booking-hour-format .is-selected {
  background: var(--ui-bg);
  color: var(--ui-text-highlighted);
  box-shadow: 0 1px 3px #00000020;
}
.booking-placeholder {
  display: flex;
  min-height: 180px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 16px 4px;
  text-align: center;
  color: var(--ui-text-muted);
  font-size: 13px;
  line-height: 1.6;
}
.booking-form {
  display: flex;
  min-width: 0;
  min-height: 488px;
  flex-direction: column;
  gap: 20px;
  padding: 24px;
}
.booking-form-actions {
  margin-top: auto;
  padding-top: 24px;
}
.booking-confirmation {
  min-width: 0;
  align-self: center;
  padding: 32px 24px;
}
.booking-brand {
  display: flex;
  justify-content: center;
  padding-top: 28px;
}
@media (min-width: 768px) and (max-width: 1099px) {
  .booking-layout {
    grid-template-columns: 240px minmax(0, 1fr);
  }
  .booking-selection {
    grid-template-columns: minmax(0, 1fr) 200px;
  }
  .booking-summary {
    padding: 20px;
  }
  .booking-calendar {
    padding: 16px;
  }
  .booking-times {
    padding-left: 12px;
    padding-right: 12px;
  }
  .booking-shell--compact .booking-layout {
    grid-template-columns: 300px minmax(0, 1fr);
  }
}
@media (max-width: 767px) {
  .booking-page {
    align-items: flex-start;
    padding: 24px 16px;
  }
  .booking-layout,
  .booking-shell--compact .booking-layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .booking-summary {
    border-right: 0;
    border-bottom: 1px solid var(--ui-border);
  }
  .booking-selection {
    grid-template-columns: minmax(0, 1fr);
  }
  .booking-calendar {
    padding: 24px;
  }
  .booking-times {
    height: auto;
    max-height: 400px;
    border-left: 0;
    border-top: 1px solid var(--ui-border);
    padding: 20px 24px;
  }
  .booking-form {
    min-height: 0;
  }
  .booking-brand {
    padding-top: 24px;
  }
}
</style>
