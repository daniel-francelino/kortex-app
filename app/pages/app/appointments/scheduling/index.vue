<script setup lang="ts">
import type { SchedulingPage } from "~/types/scheduling";
import { LOCATION_TYPE_META } from "~/types/scheduling";

definePageMeta({ layout: "app" });

useSeoMeta({ title: "Agendamento" });

const router = useRouter();
const isMobile = useMediaQuery("(max-width: 1023px)");
const { calendars, calendarsStatus, refreshCalendars } = useAppointments();
const {
  pages,
  pagesStatus,
  refreshPages,
  archiveSchedulingPage,
  regenerateShareToken,
  updateSchedulingPage,
  duplicateSchedulingPage,
  isOnline,
  pendingSyncCount,
  syncingOffline,
} = useSchedulingPages();

onMounted(() => {
  if (calendarsStatus.value === "idle") refreshCalendars();
  // Não confiamos só em pagesStatus === "idle": a key "scheduling-pages" é
  // compartilhada com o editor, o modal de criação rápida e a página de
  // reservas — se o status ficar em outro estado sem dados (ex.: um F5
  // enquanto essa key já tinha sido tocada por outro desses lugares), essa
  // checagem sozinha deixava a lista presa vazia. Refaz o fetch sempre que
  // não há páginas carregadas e não há um fetch em andamento.
  if (pagesStatus.value !== "pending" && pages.value.length === 0) {
    refreshPages();
  }
});

useMobileContextNav().registerMobileContextNav(
  "scheduling",
  [
    {
      label: "Dia",
      value: "day",
      icon: "i-lucide-square",
      to: "/app/appointments?view=day",
    },
    {
      label: "Semana",
      value: "week",
      icon: "i-lucide-columns-3",
      to: "/app/appointments?view=week",
    },
    {
      label: "Mês",
      value: "month",
      icon: "i-lucide-grid-3x3",
      to: "/app/appointments?view=month",
    },
    {
      label: "Link",
      value: "scheduling-link",
      icon: "i-lucide-calendar-clock",
    },
  ],
  ref("scheduling-link")
);

const quickCreateOpen = ref(false);
const toast = useToast();
const duplicatingId = ref<string | null>(null);
const search = ref("");
const statusFilter = ref("all");
const statusOptions = [
  { label: "Todas", value: "all" },
  { label: "Ativas", value: "active" },
  { label: "Pausadas", value: "paused" },
];
const activeCount = computed(
  () => pages.value.filter((page) => page.isActive).length
);
const filteredPages = computed(() =>
  pages.value.filter((page) => {
    const matchesStatus =
      statusFilter.value === "all" ||
      page.isActive === (statusFilter.value === "active");
    return (
      matchesStatus &&
      page.title
        .toLocaleLowerCase()
        .includes(search.value.trim().toLocaleLowerCase())
    );
  })
);
const confirmPage = ref<SchedulingPage | null>(null);
const confirmAction = ref<"archive" | "regenerate">("archive");
const confirming = ref(false);

function requestAction(page: SchedulingPage, action: "archive" | "regenerate") {
  confirmPage.value = page;
  confirmAction.value = action;
}

async function confirmPageAction() {
  if (!confirmPage.value || confirming.value) return;
  confirming.value = true;
  try {
    const result =
      confirmAction.value === "archive"
        ? await archiveSchedulingPage(confirmPage.value.id)
        : await regenerateShareToken(confirmPage.value.id);
    if (result) confirmPage.value = null;
  } finally {
    confirming.value = false;
  }
}

function onCreate() {
  quickCreateOpen.value = true;
}

function onCreated(pageId: string) {
  router.push(`/app/appointments/scheduling/${pageId}`);
}

function onOpenEditor(page: SchedulingPage) {
  router.push(`/app/appointments/scheduling/${page.id}`);
}

async function onToggleActive(page: SchedulingPage, value: boolean) {
  await updateSchedulingPage(page.id, { isActive: value });
}

async function onDuplicate(page: SchedulingPage) {
  duplicatingId.value = page.id;
  const created = await duplicateSchedulingPage(page.id);
  duplicatingId.value = null;
  if (created) router.push(`/app/appointments/scheduling/${created.id}`);
}

function shareUrl(page: SchedulingPage): string {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/agendar/${page.shareToken}`;
}

async function copyLink(page: SchedulingPage) {
  try {
    await navigator.clipboard.writeText(shareUrl(page));
    toast.add({ title: "Link copiado!", color: "success" });
  } catch {
    toast.add({
      title: "Erro",
      description: "Não foi possível copiar o link.",
      color: "error",
    });
  }
}

function openPreview(page: SchedulingPage) {
  window.open(shareUrl(page), "_blank", "noopener,noreferrer");
}
</script>

<template>
  <UDashboardPanel id="scheduling">
    <template #header>
      <UDashboardNavbar title="Agendamento">
        <template #leading>
          <AppSidebarCollapse />
        </template>

        <template #right>
          <!-- Public scheduling pages -->
          <UTooltip text="Agenda" class="hidden lg:flex">
            <UButton
              square
              color="neutral"
              variant="ghost"
              icon="i-lucide-calendar"
              to="/app/appointments/"
            />
          </UTooltip>

          <UTooltip text="Reservas" class="hidden lg:flex">
            <UButton
              square
              color="neutral"
              variant="ghost"
              icon="i-lucide-list-checks"
              to="/app/appointments/bookings"
            />
          </UTooltip>

          <UButton
            v-if="!isMobile"
            icon="i-lucide-plus"
            label="Nova página"
            @click="onCreate"
          />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div
        class="mx-auto w-full max-w-6xl space-y-6 px-1 py-3 pb-24 sm:px-4 sm:py-6"
      >
        <!-- Offline / pending sync indicator -->
        <div
          v-if="!isOnline || pendingSyncCount > 0"
          class="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs"
          :class="
            !isOnline
              ? 'text-warning bg-warning/5'
              : 'text-muted bg-elevated/40'
          "
        >
          <UIcon
            :name="
              !isOnline
                ? 'i-lucide-cloud-off'
                : syncingOffline
                ? 'i-lucide-loader-2'
                : 'i-lucide-cloud-upload'
            "
            class="size-3.5 shrink-0"
            :class="syncingOffline ? 'animate-spin' : ''"
          />
          <span v-if="!isOnline">
            Offline — as alterações serão sincronizadas ao reconectar
          </span>
          <span v-else-if="syncingOffline">
            Sincronizando alterações offline...
          </span>
          <span v-else>
            {{ pendingSyncCount }} alteração(ões) pendente(s) de sincronização
          </span>
        </div>
        <div
          v-if="pages.length"
          class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Buscar..."
            aria-label="Buscar..."
            class="w-full sm:max-w-sm"
          />
          <USelect
            v-model="statusFilter"
            :items="statusOptions"
            aria-label="Filtrar por status"
            class="w-full sm:w-40"
          />
        </div>
        <div
          v-if="pagesStatus === 'pending' || pagesStatus === 'idle'"
          class="space-y-3"
        >
          <USkeleton v-for="i in 3" :key="i" class="h-24 w-full rounded-xl" />
        </div>
        <UEmpty
          v-else-if="pagesStatus === 'error'"
          icon="i-lucide-cloud-alert"
          title="Não foi possível carregar suas páginas"
          description="Tente novamente para acessar seus links de agendamento."
          class="flex min-h-[50vh] flex-col items-center justify-center"
          :actions="[
            { label: 'Tentar novamente', onClick: () => refreshPages() },
          ]"
        />
        <UEmpty
          v-else-if="!pages || pages.length === 0"
          icon="i-lucide-calendar-plus"
          title="Nenhuma página de agendamento ainda"
          description="Crie sua primeira página para compartilhar um link de agendamento."
          class="flex min-h-[50vh] flex-col items-center justify-center"
          :actions="[
            {
              label: 'Criar a primeira',
              icon: 'i-lucide-plus',
              onClick: onCreate,
            },
          ]"
        />
        <UEmpty
          v-else-if="!filteredPages.length"
          icon="i-lucide-search"
          title="Nenhuma página encontrada"
          description="Experimente outro título ou filtro."
          class="flex min-h-[50vh] flex-col items-center justify-center"
          :actions="[
            {
              label: 'Limpar filtros',
              color: 'neutral',
              variant: 'outline',
              onClick: () => {
                search = '';
                statusFilter = 'all';
              },
            },
          ]"
        />
        <div
          v-else
          class="overflow-hidden rounded-xl border border-default bg-default divide-y divide-default"
        >
          <UCard
            v-for="page in filteredPages"
            :key="page.id"
            class="overflow-hidden rounded-none shadow-none ring-0 transition-colors hover:bg-elevated/30"
            :ui="{ body: 'p-0 sm:p-0' }"
          >
            <div class="flex items-stretch">
              <div
                class="my-5 ml-4 w-1 shrink-0 rounded-full"
                :style="{ backgroundColor: page.color || 'var(--ui-primary)' }"
              />
              <div
                class="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-4 p-4 sm:p-5"
              >
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <NuxtLink
                      :to="`/app/appointments/scheduling/${page.id}`"
                      class="break-words font-semibold text-highlighted hover:underline focus-visible:outline-2 focus-visible:outline-primary"
                    >
                      {{ page.title }}
                    </NuxtLink>
                    <UBadge
                      v-if="!page.isActive"
                      color="neutral"
                      variant="subtle"
                      size="sm"
                    >
                      Pausada
                    </UBadge>
                  </div>
                  <p
                    v-if="page.description"
                    class="mt-1 line-clamp-1 text-sm text-muted"
                  >
                    {{ page.description }}
                  </p>
                  <div
                    class="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted"
                  >
                    <span class="flex items-center gap-1">
                      <UIcon name="i-lucide-clock" class="size-3.5" />
                      {{ page.durationMinutes }}
                      min
                    </span>
                    <span class="flex items-center gap-1">
                      <UIcon
                        :name="LOCATION_TYPE_META[page.locationType].icon"
                        class="size-3.5"
                      />
                      {{ LOCATION_TYPE_META[page.locationType].label }}
                    </span>
                    <span
                      v-if="page.bookingsCount"
                      class="flex items-center gap-1"
                    >
                      <UIcon name="i-lucide-users" class="size-3.5" />
                      {{ page.bookingsCount }}
                      {{ page.bookingsCount === 1 ? "reserva" : "reservas" }}
                    </span>
                  </div>
                  <div class="mt-2 flex items-center gap-2" @click.stop>
                    <UTooltip text="Copiar link">
                      <UButton
                        icon="i-lucide-copy"
                        label="Copiar link"
                        size="sm"
                        color="neutral"
                        variant="subtle"
                        @click="copyLink(page)"
                      />
                    </UTooltip>
                    <UTooltip text="Abrir página">
                      <UButton
                        icon="i-lucide-external-link"
                        aria-label="Abrir página pública"
                        size="sm"
                        color="neutral"
                        variant="subtle"
                        @click="openPreview(page)"
                      />
                    </UTooltip>
                  </div>
                </div>
                <div class="flex shrink-0 items-center gap-1" @click.stop>
                  <USwitch
                    :model-value="page.isActive"
                    :aria-label="`Ativar ${page.title}`"
                    @update:model-value="
                    (v: boolean) => onToggleActive(page, v)
                    "
                  />
                  <UDropdownMenu
                    :items="[
                    [
                    {
                    label: 'Editar',
                    icon: 'i-lucide-pencil',
                    onSelect: () => onOpenEditor(page),
                    },
                    {
                    label: 'Duplicar',
                    icon: 'i-lucide-copy-plus',
                    onSelect: () => onDuplicate(page),
                    },
                    {
                    label: 'Ver reservas',
                    icon: 'i-lucide-list',
                    to: `/app/appointments/bookings/${page.id}`,
                    },
                    ],
                    [
                    {
                    label: 'Regenerar link',
                    icon: 'i-lucide-refresh-cw',
                    onSelect: () => requestAction(page, 'regenerate'),
                    },
                    ],
                    [
                    {
                    label: 'Arquivar',
                    icon: 'i-lucide-archive',
                    color: 'error' as const,
                    onSelect: () => requestAction(page, 'archive'),
                    },
                    ],
                    ]"
                    :content="{ align: 'end' }"
                  >
                    <UButton
                      icon="i-lucide-ellipsis-vertical"
                      :aria-label="`Opções de ${page.title}`"
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      :loading="duplicatingId === page.id"
                    />
                  </UDropdownMenu>
                </div>
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
  <!-- Mobile: floating "new page" button, replaces the navbar action -->
  <UButton
    v-if="isMobile"
    icon="i-lucide-plus"
    size="xl"
    square
    class="fixed z-30 size-14 items-center justify-center rounded-full shadow-lg shadow-black/30"
    :style="{
      right: 'calc(1rem + var(--safe-area-right, 0px))',
      bottom: 'calc(var(--mobile-bottom-nav-height, 4.75rem) + 1rem)',
    }"
    aria-label="Nova página"
    @click="onCreate"
  />
  <AppointmentsSchedulingQuickCreateModal
    :open="quickCreateOpen"
    :calendars="calendars"
    @update:open="quickCreateOpen = $event"
    @created="onCreated"
  />
  <UModal
    :open="Boolean(confirmPage)"
    :title="
      confirmAction === 'archive' ? 'Arquivar página?' : 'Regenerar link?'
    "
    @update:open="
    (open: boolean) => {
    if (!open) confirmPage = null;
    }
    "
  >
    <template #body>
      <p class="text-sm leading-relaxed text-muted">
        {{
          confirmAction === "archive"
            ? "A página será removida da lista e o link será desativado. As reservas existentes serão mantidas."
            : "O link atual deixará de funcionar. Você precisará compartilhar o novo link com seus convidados."
        }}
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancelar"
          color="neutral"
          variant="outline"
          :disabled="confirming"
          @click="confirmPage = null"
        />
        <UButton
          :label="
            confirmAction === 'archive' ? 'Arquivar página' : 'Regenerar link'
          "
          color="error"
          :loading="confirming"
          @click="confirmPageAction"
        />
      </div>
    </template>
  </UModal>
</template>
