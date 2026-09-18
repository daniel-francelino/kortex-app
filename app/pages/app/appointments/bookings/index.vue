<script setup lang="ts">
import type { Booking, SchedulingPage } from "~/types/scheduling";
import { BookingStatus } from "~/types/scheduling";
import { formatDisplay } from "#shared/utils/dateTime";

definePageMeta({ layout: "app" });

const {
  pages,
  pagesStatus,
  refreshPages,
  fetchAllBookings,
  approveBooking,
  cancelBookingAsHost,
} = useSchedulingPages();

onMounted(() => {
  // Same resilience fix as scheduling/index.vue: the "scheduling-pages" fetch
  // key is shared across several pages, so a plain idle-only check can end up
  // skipping the refetch. Retry whenever there's no data and nothing in flight.
  if (pagesStatus.value !== "pending" && pages.value.length === 0) {
    refreshPages();
  }
});

const { data: bookingsData, status: bookingsStatus } = useAsyncData<
  Booking[]
>("all-bookings", () => fetchAllBookings(), { lazy: true, default: () => [] });
const bookings = computed(() => bookingsData.value ?? []);

useSeoMeta({
  title: "Reservas",
});

// Todas as reservas vêm de páginas diferentes, cada uma com seu próprio
// fuso e conjunto de perguntas — ao contrário de bookings/[id].vue (que tem
// uma única `page`), aqui é preciso resolver a página de cada reserva
// individualmente para exibir data/local certos e alimentar o slideover.
const pageById = computed(() => new Map(pages.value.map((p) => [p.id, p])));
function pageFor(booking: Booking): SchedulingPage | null {
  return pageById.value.get(booking.schedulingPageId) ?? null;
}

const STATUS_META: Record<
  BookingStatus,
  { label: string; color: "success" | "error" | "warning" | "neutral" }
> = {
  [BookingStatus.Confirmed]: { label: "Confirmada", color: "success" },
  [BookingStatus.Pending]: { label: "Pendente", color: "warning" },
  [BookingStatus.Cancelled]: { label: "Cancelada", color: "error" },
  [BookingStatus.Rescheduled]: { label: "Reagendada", color: "neutral" },
};

function formatDate(booking: Booking): string {
  if (!booking.startAt) return "Horário não disponível";
  return formatDisplay(booking.startAt, "dd 'de' MMM'.' 'de' yyyy, HH:mm", {
    timeZone: pageFor(booking)?.timezone,
  });
}

// ─── Filtro por aba + busca ──────────────────────────────────────────────────
const hasPendingTab = computed(
  () =>
    pages.value.some((p) => p.requiresConfirmation) ||
    bookings.value.some((b) => b.status === BookingStatus.Pending),
);

const tabs = computed(() => {
  const base: { label: string; value: string; icon: string }[] = [];
  if (hasPendingTab.value) base.push({ label: "Pendentes", value: "pending", icon: "i-lucide-hourglass" });
  base.push(
    { label: "Próximas", value: "upcoming", icon: "i-lucide-calendar-clock" },
    { label: "Passadas", value: "past", icon: "i-lucide-history" },
    { label: "Canceladas", value: "cancelled", icon: "i-lucide-calendar-x" },
  );
  return base;
});

const activeFilter = ref<"pending" | "upcoming" | "past" | "cancelled">(
  hasPendingTab.value ? "pending" : "upcoming",
);
watch(hasPendingTab, () => {
  if (!tabs.value.some((t) => t.value === activeFilter.value))
    activeFilter.value = "upcoming";
});

const searchQuery = ref("");
useMobileContextNav().registerMobileContextNav("all-bookings", tabs, activeFilter);

const filteredBookings = computed(() => {
  const now = Date.now();
  const q = searchQuery.value.trim().toLowerCase();

  let list = bookings.value.filter((b) => {
    if (activeFilter.value === "cancelled")
      return b.status === BookingStatus.Cancelled;
    if (activeFilter.value === "pending")
      return b.status === BookingStatus.Pending;
    if (
      b.status === BookingStatus.Cancelled ||
      b.status === BookingStatus.Pending
    )
      return false;
    const startMs = b.startAt ? new Date(b.startAt).getTime() : null;
    if (activeFilter.value === "upcoming")
      return startMs === null || startMs >= now;
    return startMs !== null && startMs < now;
  });

  if (q) {
    list = list.filter(
      (b) =>
        b.guestName.toLowerCase().includes(q) ||
        b.guestEmail.toLowerCase().includes(q) ||
        (pageFor(b)?.title.toLowerCase().includes(q) ?? false),
    );
  }

  return list.slice().sort((a, b) => {
    const aMs = a.startAt ? new Date(a.startAt).getTime() : 0;
    const bMs = b.startAt ? new Date(b.startAt).getTime() : 0;
    return activeFilter.value === "past" ? bMs - aMs : aMs - bMs;
  });
});

// ─── Detalhe / ações ─────────────────────────────────────────────────────────
const detailOpen = ref(false);
const selectedBookingId = ref<string | null>(null);
const selectedBooking = computed(
  () => bookings.value.find((b) => b.id === selectedBookingId.value) ?? null,
);
const selectedPage = computed(() =>
  selectedBooking.value ? pageFor(selectedBooking.value) : null,
);
const approving = ref(false);
const cancelling = ref(false);

function openDetail(booking: Booking) {
  selectedBookingId.value = booking.id;
  detailOpen.value = true;
}

function patchBookingInList(updated: Booking) {
  if (!bookingsData.value) return;
  bookingsData.value = bookingsData.value.map((b) =>
    b.id === updated.id ? updated : b,
  );
}

async function onApprove(bookingId: string) {
  if (approving.value || !selectedBooking.value) return;
  approving.value = true;
  const updated = await approveBooking(
    selectedBooking.value.schedulingPageId,
    bookingId,
  );
  approving.value = false;
  if (updated) patchBookingInList(updated);
}

async function onCancel(bookingId: string, reason: string | undefined) {
  if (cancelling.value || !selectedBooking.value) return;
  cancelling.value = true;
  const updated = await cancelBookingAsHost(
    selectedBooking.value.schedulingPageId,
    bookingId,
    reason,
  );
  cancelling.value = false;
  if (updated) {
    patchBookingInList(updated);
    detailOpen.value = false;
  }
}
</script>

<template>
  <UDashboardPanel id="all-bookings">
    <template #header>
      <UDashboardNavbar title="Reservas">
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            aria-label="Voltar às páginas de agendamento"
            color="neutral"
            variant="ghost"
            to="/app/appointments/scheduling"
          />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-6 px-1 py-3 sm:px-4 sm:py-6">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight text-highlighted">
            Todas as reservas
          </h1>
          <p class="mt-2 text-sm text-muted">
            Reservas de todas as suas páginas de agendamento, num só lugar.
          </p>
        </div>
        <div
          class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <UTabs
            :items="tabs"
            :content="false"
            class="hidden min-w-0 lg:block"
            :model-value="activeFilter"
            @update:model-value="
              activeFilter = $event as
                | 'pending'
                | 'upcoming'
                | 'past'
                | 'cancelled'
            "
          />
          <UInput
            v-model="searchQuery"
            icon="i-lucide-search"
            placeholder="Buscar por nome, e-mail ou página…"
            aria-label="Buscar reservas por nome, e-mail ou página"
            size="sm"
            class="sm:w-72"
          />
        </div>
        <div v-if="bookingsStatus === 'pending'" class="space-y-3">
          <USkeleton v-for="i in 3" :key="i" class="h-20 w-full rounded-xl" />
        </div>
        <UEmpty
          v-else-if="filteredBookings.length === 0"
          icon="i-lucide-calendar-x"
          :title="
            bookings.length === 0 ? 'Nenhuma reserva ainda' : 'Nada por aqui'
          "
          :description="
            bookings.length === 0
              ? 'Assim que alguém marcar um horário em alguma das suas páginas, as reservas aparecem aqui.'
              : 'Nenhuma reserva nesse filtro.'
          "
          class="flex min-h-[40vh] flex-col items-center justify-center"
        />
        <template v-else>
          <UCard
            v-for="booking in filteredBookings"
            :key="booking.id"
            class="cursor-pointer transition-colors hover:bg-elevated/40 focus-visible:outline-2 focus-visible:outline-primary"
            role="button"
            tabindex="0"
            @click="openDetail(booking)"
            @keydown.enter="openDetail(booking)"
            @keydown.space.prevent="openDetail(booking)"
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
                  {{ formatDate(booking) }}
                </p>
                <p
                  v-if="booking.cancellationReason"
                  class="mt-1 text-xs text-muted"
                >
                  Motivo do cancelamento: {{ booking.cancellationReason }}
                </p>
              </div>
              <div class="flex shrink-0 flex-col items-end gap-1.5">
                <UBadge
                  :color="STATUS_META[booking.status].color"
                  variant="subtle"
                  size="sm"
                >
                  {{ STATUS_META[booking.status].label }}
                </UBadge>
                <span
                  v-if="pageFor(booking)"
                  class="max-w-40 truncate text-xs text-dimmed"
                >
                  {{ pageFor(booking)?.title }}
                </span>
              </div>
            </div>
          </UCard>
        </template>
      </div>
    </template>
  </UDashboardPanel>
  <AppointmentsSchedulingBookingDetailSlideover
    :open="detailOpen"
    :booking="selectedBooking"
    :page="selectedPage"
    :approving="approving"
    :cancelling="cancelling"
    @update:open="detailOpen = $event"
    @approve="onApprove"
    @cancel="onCancel"
  />
</template>
