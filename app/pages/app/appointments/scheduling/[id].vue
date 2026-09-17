<script setup lang="ts">
import type { SchedulingQuestion } from "~/types/scheduling";
import { SchedulingLocationType, LOCATION_TYPE_META } from "~/types/scheduling";
import { detectBrowserTimeZone } from "#shared/utils/dateTime";

definePageMeta({ layout: "app" });

const route = useRoute();
const router = useRouter();
const toast = useToast();
const pageId = route.params.id as string;

const { calendars, calendarsStatus, refreshCalendars } = useAppointments();
const {
  fetchSchedulingPage,
  updateSchedulingPage,
  archiveSchedulingPage,
  regenerateShareToken,
  duplicateSchedulingPage,
} = useSchedulingPages();

onMounted(() => {
  if (calendarsStatus.value === "idle") refreshCalendars();
});

// Só pra montar o preview "kortex.app/{username}/{slug}" no campo URL —
// username mora em user_preferences, não vem de useAuth() (que só carrega
// user_metadata). Ver docs/appointments/PLANO_USERNAME_PERFIL_PUBLICO.md §4.
const { data: authProfile } = await useAsyncData<{ username: string | null }>(
  "settings-username-preview",
  () => $fetch("/api/auth/profile"),
);
const username = computed(() => authProfile.value?.username ?? null);

// ─── Load ────────────────────────────────────────────────────────────────────
const loading = ref(true);
const notFound = ref(false);
const saving = ref(false);
const shareToken = ref("");
const isActive = ref(true);
// Guarda o slug já salvo — usado pro aviso "isso muda o link" só aparecer
// quando o campo de fato mudou, e pra não disparar a checagem de
// disponibilidade contra o próprio valor atual.
const savedSlug = ref("");

interface DayWindow {
  startTime: string;
  endTime: string;
}

const dayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const weekdayIndexes = [1, 2, 3, 4, 5];

const state = reactive({
  title: "",
  description: "",
  calendarId: "",
  durationMinutes: 30,
  locationType: SchedulingLocationType.VideoLink,
  locationDetails: "",
  color: null as string | null,
  coverImageUrl: null as string | null,
  slug: "",
  showOnProfile: true,
  timezone: detectBrowserTimeZone() ?? "UTC",
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  slotIncrementMinutes: 15,
  minNoticeHours: 4,
  maxAdvanceDays: 60,
  maxBookingsPerDayEnabled: false,
  maxBookingsPerDay: 5,
  calendarEventTitleTemplate: "",
  cancellationEnabled: true,
  rescheduleEnabled: true,
  cancellationMinNoticeEnabled: false,
  cancellationMinNoticeHours: 24,
  cancellationReasonRequired: false,
  hideDetailsOnManagePage: false,
  requiresConfirmation: false,
});

const dayWindows = reactive<Record<number, DayWindow[]>>({
  0: [],
  1: [],
  2: [],
  3: [],
  4: [],
  5: [],
  6: [],
});
const questions = ref<Array<Omit<SchedulingQuestion, "id">>>([]);

function applyPageToState(
  page: NonNullable<Awaited<ReturnType<typeof fetchSchedulingPage>>>,
) {
  state.title = page.title;
  state.description = page.description ?? "";
  state.calendarId = page.calendarId;
  state.durationMinutes = page.durationMinutes;
  state.locationType = page.locationType;
  state.locationDetails = page.locationDetails ?? "";
  state.color = page.color;
  state.coverImageUrl = page.coverImageUrl;
  state.slug = page.slug;
  state.showOnProfile = page.showOnProfile;
  savedSlug.value = page.slug;
  state.timezone = page.timezone;
  state.bufferBeforeMinutes = page.bufferBeforeMinutes;
  state.bufferAfterMinutes = page.bufferAfterMinutes;
  state.slotIncrementMinutes = page.slotIncrementMinutes;
  state.minNoticeHours = page.minNoticeHours;
  minNoticeUnit.value = detectMinNoticeUnit(page.minNoticeHours);
  state.maxAdvanceDays = page.maxAdvanceDays;
  state.maxBookingsPerDayEnabled = page.maxBookingsPerDay !== null;
  state.maxBookingsPerDay = page.maxBookingsPerDay ?? 5;
  state.calendarEventTitleTemplate = page.calendarEventTitleTemplate ?? "";
  state.cancellationEnabled = page.cancellationEnabled;
  state.rescheduleEnabled = page.rescheduleEnabled;
  state.cancellationMinNoticeEnabled = page.cancellationMinNoticeHours !== null;
  state.cancellationMinNoticeHours = page.cancellationMinNoticeHours ?? 24;
  state.cancellationReasonRequired = page.cancellationReasonRequired;
  state.hideDetailsOnManagePage = page.hideDetailsOnManagePage;
  state.requiresConfirmation = page.requiresConfirmation;

  shareToken.value = page.shareToken;
  isActive.value = page.isActive;

  for (let d = 0; d <= 6; d++) dayWindows[d] = [];
  for (const rule of page.availabilityRules ?? []) {
    dayWindows[rule.dayOfWeek]!.push({
      startTime: rule.startTime,
      endTime: rule.endTime,
    });
  }

  questions.value = (page.questions ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((q) => ({
      label: q.label,
      type: q.type,
      isRequired: q.isRequired,
      isHidden: q.isHidden,
      options: q.options,
      sortOrder: q.sortOrder,
    }));
}

function serializeState(): string {
  const sortedWindows = Object.keys(dayWindows)
    .map(Number)
    .sort((a, b) => a - b)
    .map((day) => ({ day, windows: dayWindows[day] }));

  return JSON.stringify({ state, sortedWindows, questions: questions.value });
}

const snapshot = ref("");
const isDirty = computed(
  () => snapshot.value !== "" && snapshot.value !== serializeState(),
);

async function load() {
  loading.value = true;
  const page = await fetchSchedulingPage(pageId);
  if (!page) {
    notFound.value = true;
    loading.value = false;
    return;
  }
  applyPageToState(page);
  await nextTick();
  snapshot.value = serializeState();
  loading.value = false;
}

load();

// ─── Tabs ────────────────────────────────────────────────────────────────────
const tabs = [
  { label: "Evento", value: "evento", icon: "i-lucide-calendar" },
  {
    label: "Disponibilidade",
    value: "disponibilidade",
    icon: "i-lucide-clock",
  },
  { label: "Formulário", value: "formulario", icon: "i-lucide-list-checks" },
  { label: "Limites", value: "limites", icon: "i-lucide-shield" },
  { label: "Políticas", value: "politicas", icon: "i-lucide-repeat" },
  { label: "Privacidade", value: "privacidade", icon: "i-lucide-lock" },
];
const activeTab = ref(
  typeof route.query.tab === "string" &&
    tabs.some((t) => t.value === route.query.tab)
    ? route.query.tab
    : "evento",
);
const tabDescriptions: Record<string, string> = {
  evento: "Apresente seu evento e defina como o encontro vai acontecer.",
  disponibilidade:
    "Escolha os dias e horários em que você quer receber reservas.",
  formulario: "Peça as informações necessárias para preparar seu encontro.",
  limites: "Reserve tempo entre encontros e organize o ritmo da sua agenda.",
  politicas: "Defina como confirmar, reagendar e cancelar suas reservas.",
  privacidade: "Controle os detalhes compartilhados e o acesso à sua página.",
};
const currentTab = computed(
  () => tabs.find((tab) => tab.value === activeTab.value) ?? tabs[0]!,
);
const availableDays = computed(
  () =>
    Object.values(dayWindows).filter((windows) => windows.length > 0).length,
);
watch(activeTab, (v) => {
  router.replace({ query: { ...route.query, tab: v } });
});

// ─── Evento ──────────────────────────────────────────────────────────────────
const calendarOptions = computed(() =>
  (calendars.value ?? []).map((c) => ({ label: c.name, value: c.id })),
);
const locationOptions = Object.values(SchedulingLocationType).map((value) => ({
  label: LOCATION_TYPE_META[value].label,
  value,
}));
const locationDetailMeta: Record<
  SchedulingLocationType,
  { label: string; placeholder: string }
> = {
  [SchedulingLocationType.VideoLink]: {
    label: "Link da chamada",
    placeholder: "https://meet.google.com/…",
  },
  [SchedulingLocationType.Phone]: {
    label: "Número de telefone",
    placeholder: "+55 11 90000-0000",
  },
  [SchedulingLocationType.InPerson]: {
    label: "Endereço",
    placeholder: "Rua Exemplo, 123",
  },
  [SchedulingLocationType.Custom]: {
    label: "Instruções para o convidado",
    placeholder: "Ex.: aguarde na recepção",
  },
};
const colorOptions = [
  { label: "Verde", value: "#10b981" },
  { label: "Azul", value: "#3b82f6" },
  { label: "Amarelo", value: "#f59e0b" },
  { label: "Vermelho", value: "#ef4444" },
  { label: "Roxo", value: "#8b5cf6" },
  { label: "Rosa", value: "#ec4899" },
];

// ─── Capa ────────────────────────────────────────────────────────────────────
const coverInputRef = ref<HTMLInputElement | null>(null);
const coverUploading = ref(false);

async function onCoverFileSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;

  coverUploading.value = true;
  try {
    const form = new FormData();
    form.append("file", file);
    form.append("kind", "image");

    const uploaded = await $fetch<{ url: string }>("/api/editor/uploads", {
      method: "POST",
      body: form,
    });

    state.coverImageUrl = uploaded.url;
  } catch {
    toast.add({
      title: "Erro",
      description: "Não foi possível enviar a imagem.",
      color: "error",
    });
  } finally {
    coverUploading.value = false;
    if (coverInputRef.value) coverInputRef.value.value = "";
  }
}

function onRemoveCoverImage() {
  state.coverImageUrl = null;
}

// Shared with the Settings "Regional" picker (docs/timezone/ANALISE_TIMEZONE.md,
// seção 5) — same ordering (browser zone, then current selection, then most
// used, then the rest alphabetically), so both pickers behave consistently.
const { options: timezoneOptions } = useTimezoneOptions(
  computed(() => state.timezone),
);

// ─── Disponibilidade ─────────────────────────────────────────────────────────
function addWindow(day: number) {
  dayWindows[day]!.push({ startTime: "09:00", endTime: "18:00" });
}
function removeWindow(day: number, index: number) {
  dayWindows[day]!.splice(index, 1);
}
function toggleDay(day: number) {
  dayWindows[day] =
    dayWindows[day]!.length > 0
      ? []
      : [{ startTime: "09:00", endTime: "18:00" }];
}
// Popover "copiar horários para…" — substitui o antigo copyToWeekdays (que só
// cobria dias úteis fixos) por uma seleção arbitrária de dias de destino.
const copyTargetsByDay = reactive<Record<number, number[]>>({});

function onCopyPopoverOpen(day: number, open: boolean) {
  if (!open) return;
  // Pré-seleciona os dias úteis (exceto a origem) como ponto de partida útil
  // — o caso mais comum continua sendo 1 clique, sem obrigar a marcar tudo.
  copyTargetsByDay[day] = weekdayIndexes.filter((d) => d !== day);
}

function toggleCopyTarget(day: number, target: number, checked: boolean) {
  const current = copyTargetsByDay[day] ?? [];
  copyTargetsByDay[day] = checked
    ? [...current, target]
    : current.filter((d) => d !== target);
}

function applyCopyToTargets(day: number) {
  const targets = copyTargetsByDay[day] ?? [];
  if (targets.length === 0) return;
  const source = dayWindows[day]!.map((w) => ({ ...w }));
  for (const target of targets) {
    dayWindows[target] = source.map((w) => ({ ...w }));
  }
  toast.add({
    title: `Horários copiados para ${targets.length} dia(s)`,
    color: "success",
  });
}

// "Antecedência mínima" — sempre guardada em horas no banco (state.minNoticeHours),
// a unidade (Horas/Dias) é só apresentação (docs/appointments/AUDITORIA_LINK_AGENDAMENTO_UX.md §1.2).
const minNoticeUnit = ref<"hours" | "days">("hours");
function detectMinNoticeUnit(hours: number): "hours" | "days" {
  return hours > 0 && hours % 24 === 0 ? "days" : "hours";
}
const minNoticeUnitOptions = [
  { label: "Horas", value: "hours" as const },
  { label: "Dias", value: "days" as const },
];
const minNoticeDisplayValue = computed({
  get: () =>
    minNoticeUnit.value === "days"
      ? Math.round(state.minNoticeHours / 24)
      : state.minNoticeHours,
  set: (value: number) => {
    state.minNoticeHours = minNoticeUnit.value === "days" ? value * 24 : value;
  },
});

// ─── Limites — buffers e incremento como valores discretos (padrão Cal.com,
// docs/appointments/AUDITORIA_LINK_AGENDAMENTO_UX.md §1.2) em vez de um
// UInputNumber livre. Cada `buildOptions` inclui o valor atual mesmo que ele
// não esteja na lista fixa (ex.: uma página antiga com buffer de 7 min) — sem
// isso o USelect ficaria em branco em vez de mostrar o valor real salvo.
const BUFFER_MINUTE_OPTIONS = [0, 5, 10, 15, 20, 30, 45, 60];
function buildBufferOptions(current: number) {
  const values = BUFFER_MINUTE_OPTIONS.includes(current)
    ? BUFFER_MINUTE_OPTIONS
    : [...BUFFER_MINUTE_OPTIONS, current].sort((a, b) => a - b);
  return values.map((v) => ({
    label: v === 0 ? "Sem intervalo" : `${v} min`,
    value: v,
  }));
}
const bufferBeforeOptions = computed(() =>
  buildBufferOptions(state.bufferBeforeMinutes),
);
const bufferAfterOptions = computed(() =>
  buildBufferOptions(state.bufferAfterMinutes),
);

// "Usar a duração do evento" não é um valor persistido à parte — selecioná-la
// só copia state.durationMinutes para state.slotIncrementMinutes na hora
// (atalho, não um vínculo permanente: se a duração mudar depois, o incremento
// não re-sincroniza sozinho, evitando um campo derivado "mágico" no schema).
const SLOT_INCREMENT_MINUTE_OPTIONS = [5, 10, 15, 20, 30, 45, 60];
const slotIncrementOptions = computed(() => {
  const useDurationLabel = `Usar a duração do evento (${state.durationMinutes} min)`;
  const opts = [{ label: useDurationLabel, value: state.durationMinutes }];
  for (const v of SLOT_INCREMENT_MINUTE_OPTIONS) {
    if (v === state.durationMinutes) continue;
    opts.push({ label: `${v} min`, value: v });
  }
  if (!opts.some((o) => o.value === state.slotIncrementMinutes)) {
    opts.push({
      label: `${state.slotIncrementMinutes} min`,
      value: state.slotIncrementMinutes,
    });
  }
  return opts;
});

// ─── Formulário ──────────────────────────────────────────────────────────────
const questionSlideoverOpen = ref(false);
const editingQuestionIndex = ref<number | null>(null);
const editingQuestion = computed(() =>
  editingQuestionIndex.value === null
    ? null
    : (questions.value[editingQuestionIndex.value] ?? null),
);

function openNewQuestion() {
  editingQuestionIndex.value = null;
  questionSlideoverOpen.value = true;
}
function openEditQuestion(index: number) {
  editingQuestionIndex.value = index;
  questionSlideoverOpen.value = true;
}
function onSaveQuestion(value: Omit<SchedulingQuestion, "id">) {
  if (editingQuestionIndex.value === null) {
    questions.value.push({ ...value, sortOrder: questions.value.length });
  } else {
    const existing = questions.value[editingQuestionIndex.value]!;
    questions.value[editingQuestionIndex.value] = {
      ...value,
      isHidden: existing.isHidden,
      sortOrder: existing.sortOrder,
    };
  }
  questionSlideoverOpen.value = false;
}
function onRemoveQuestion() {
  if (editingQuestionIndex.value === null) return;
  questions.value.splice(editingQuestionIndex.value, 1);
  questionSlideoverOpen.value = false;
}
function toggleQuestionHidden(index: number) {
  const q = questions.value[index]!;
  questions.value[index] = { ...q, isHidden: !q.isHidden };
}
function moveQuestion(index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= questions.value.length) return;
  const list = questions.value;
  [list[index], list[target]] = [list[target]!, list[index]!];
}
function questionTypeLabel(q: Omit<SchedulingQuestion, "id">): string {
  if (q.type === "select") return `Seleção · ${q.options?.length ?? 0} opções`;
  if (q.type === "textarea") return "Texto longo";
  return "Texto curto";
}

// ─── Header actions ──────────────────────────────────────────────────────────
const shareUrl = computed(() => {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/agendar/${shareToken.value}`;
});

// ─── URL pública (username + slug) ──────────────────────────────────────────
const publicProfileUrl = computed(() => {
  if (!username.value || !state.slug) return "";
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/${username.value}/${state.slug}`;
});

type SlugCheckState = {
  status: "idle" | "checking" | "available" | "unavailable";
  reason?: string;
};
const slugCheck = ref<SlugCheckState>({ status: "idle" });
const SLUG_CHECK_REASONS: Record<string, string> = {
  format: "Use só letras minúsculas, números e hífen (sem hífens repetidos)",
  taken: "Você já tem outra página de agendamento com essa URL",
};

const runSlugCheck = useDebounceFn(async (value: string) => {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === savedSlug.value) {
    slugCheck.value = { status: "idle" };
    return;
  }
  slugCheck.value = { status: "checking" };
  try {
    const result = await $fetch<{ available: boolean; reason?: string }>(
      `/api/appointments/scheduling-pages/${pageId}/slug-check`,
      { query: { value: normalized } },
    );
    slugCheck.value = result.available
      ? { status: "available" }
      : {
          status: "unavailable",
          reason: SLUG_CHECK_REASONS[result.reason ?? "taken"],
        };
  } catch {
    slugCheck.value = { status: "idle" };
  }
}, 400);

watch(
  () => state.slug,
  (value) => {
    void runSlugCheck(value);
  },
);

async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareUrl.value);
    toast.add({ title: "Link copiado!", color: "success" });
  } catch {
    toast.add({
      title: "Erro",
      description: "Não foi possível copiar o link.",
      color: "error",
    });
  }
}

async function onToggleActive(value: boolean) {
  const updated = await updateSchedulingPage(pageId, { isActive: value });
  if (updated) isActive.value = updated.isActive;
}

const duplicating = ref(false);
async function onDuplicate() {
  if (duplicating.value) return;
  duplicating.value = true;
  const created = await duplicateSchedulingPage(pageId);
  duplicating.value = false;
  if (created) router.push(`/app/appointments/scheduling/${created.id}`);
}

const regenerateConfirmOpen = ref(false);
const regenerating = ref(false);
async function onRegenerateToken() {
  regenerating.value = true;
  const updated = await regenerateShareToken(pageId);
  regenerating.value = false;
  if (updated) {
    shareToken.value = updated.shareToken;
    regenerateConfirmOpen.value = false;
  }
}

const archiveConfirmOpen = ref(false);
const archiving = ref(false);
async function onArchive() {
  archiving.value = true;
  const success = await archiveSchedulingPage(pageId);
  archiving.value = false;
  if (success) router.push("/app/appointments/scheduling");
}

function onPreview() {
  window.open(shareUrl.value, "_blank", "noopener,noreferrer");
}

// ─── Save ────────────────────────────────────────────────────────────────────
function buildPayload() {
  const availabilityRules = Object.entries(dayWindows).flatMap(
    ([day, windows]) =>
      windows.map((w) => ({
        dayOfWeek: Number(day),
        startTime: w.startTime,
        endTime: w.endTime,
      })),
  );

  return {
    calendarId: state.calendarId,
    title: state.title,
    description: state.description || undefined,
    durationMinutes: state.durationMinutes,
    locationType: state.locationType,
    locationDetails: state.locationDetails || undefined,
    timezone: state.timezone,
    color: state.color,
    coverImageUrl: state.coverImageUrl,
    slug: state.slug,
    showOnProfile: state.showOnProfile,
    bufferBeforeMinutes: state.bufferBeforeMinutes,
    bufferAfterMinutes: state.bufferAfterMinutes,
    slotIncrementMinutes: state.slotIncrementMinutes,
    minNoticeHours: state.minNoticeHours,
    maxAdvanceDays: state.maxAdvanceDays,
    maxBookingsPerDay: state.maxBookingsPerDayEnabled
      ? state.maxBookingsPerDay
      : null,
    calendarEventTitleTemplate: state.calendarEventTitleTemplate || null,
    cancellationEnabled: state.cancellationEnabled,
    rescheduleEnabled: state.rescheduleEnabled,
    cancellationMinNoticeHours: state.cancellationMinNoticeEnabled
      ? state.cancellationMinNoticeHours
      : null,
    cancellationReasonRequired: state.cancellationReasonRequired,
    hideDetailsOnManagePage: state.hideDetailsOnManagePage,
    requiresConfirmation: state.requiresConfirmation,
    availabilityRules,
    questions: questions.value.map((q, i) => ({
      ...q,
      options: q.options ?? undefined,
      sortOrder: i,
    })),
  };
}

const invalidTab = ref<string | null>(null);

async function onSave() {
  if (saving.value) return;

  const availabilityRules = Object.values(dayWindows).flat();
  if (availabilityRules.length === 0) {
    toast.add({
      title: "Erro",
      description: "Defina ao menos uma janela de disponibilidade.",
      color: "error",
    });
    invalidTab.value = "disponibilidade";
    activeTab.value = "disponibilidade";
    return;
  }
  const badSelect = questions.value.find(
    (q) => q.type === "select" && (q.options?.length ?? 0) < 2,
  );
  if (badSelect) {
    toast.add({
      title: "Erro",
      description: `A pergunta "${badSelect.label}" precisa de ao menos 2 opções.`,
      color: "error",
    });
    invalidTab.value = "formulario";
    activeTab.value = "formulario";
    return;
  }
  if (!state.title.trim() || !state.calendarId) {
    toast.add({
      title: "Erro",
      description: "Preencha título e calendário.",
      color: "error",
    });
    invalidTab.value = "evento";
    activeTab.value = "evento";
    return;
  }
  if (slugCheck.value.status === "unavailable") {
    toast.add({
      title: "Erro",
      description: slugCheck.value.reason ?? "Essa URL não está disponível.",
      color: "error",
    });
    invalidTab.value = "evento";
    activeTab.value = "evento";
    return;
  }

  invalidTab.value = null;
  saving.value = true;
  try {
    const updated = await updateSchedulingPage(pageId, buildPayload());
    if (updated) {
      applyPageToState(updated);
      await nextTick();
      snapshot.value = serializeState();
    }
  } finally {
    saving.value = false;
  }
}

// ─── Leave guard ─────────────────────────────────────────────────────────────
onBeforeRouteLeave(() => {
  if (!isDirty.value) return true;
  return window.confirm("Você tem alterações não salvas. Sair mesmo assim?");
});

if (import.meta.client) {
  useEventListener(window, "beforeunload", (e: BeforeUnloadEvent) => {
    if (!isDirty.value) return;
    e.preventDefault();
  });
}
</script>

<template>
  <UDashboardPanel id="scheduling-editor">
    <template #header>
      <UDashboardNavbar title="Editar Página de agendamento">
        <template #right>
          <UDropdownMenu
            v-if="!loading && !notFound"
            :items="[
              [
                {
                  label: 'Pré-visualizar',
                  icon: 'i-lucide-external-link',
                  onSelect: onPreview,
                },
                {
                  label: 'Copiar link',
                  icon: 'i-lucide-copy',
                  onSelect: copyLink,
                },
                {
                  label: 'Duplicar página',
                  icon: 'i-lucide-copy-plus',
                  onSelect: onDuplicate,
                },
              ],
              [
                {
                  label: 'Regenerar link',
                  icon: 'i-lucide-refresh-cw',
                  onSelect: () => {
                    regenerateConfirmOpen = true;
                  },
                },
              ],
              [
                {
                  label: 'Arquivar',
                  icon: 'i-lucide-archive',
                  color: 'error' as const,
                  onSelect: () => {
                    archiveConfirmOpen = true;
                  },
                },
              ],
            ]"
            :content="{ align: 'end' }"
          >
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              square
              aria-label="Mais opções"
            />
          </UDropdownMenu>
          <UButton
            label="Salvar"
            :loading="saving"
            :disabled="!isDirty || saving || loading || notFound"
            @click="onSave"
          />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div
        v-if="loading"
        class="mx-auto grid w-full max-w-7xl items-start gap-6 px-1 py-3 sm:px-4 sm:py-6 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_260px]"
      >
        <aside class="space-y-5 lg:sticky lg:top-0">
          <USkeleton class="hidden h-9 w-32 lg:block" />
          <div class="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">
            <USkeleton
              v-for="i in 6"
              :key="i"
              class="h-10 w-24 shrink-0 rounded-lg lg:w-full"
            />
          </div>
          <USkeleton class="hidden h-20 w-full rounded-xl lg:block" />
        </aside>
        <div class="min-w-0 space-y-6">
          <div class="space-y-2">
            <USkeleton class="h-8 w-48" />
            <USkeleton class="h-4 w-72" />
          </div>
          <USkeleton v-for="i in 3" :key="i" class="h-40 w-full rounded-xl" />
        </div>
        <aside class="hidden space-y-4 xl:block">
          <USkeleton class="h-80 w-full rounded-xl" />
          <USkeleton class="h-10 w-full rounded-lg" />
        </aside>
      </div>
      <div
        v-else-if="notFound"
        class="flex flex-col items-center gap-3 py-16 text-center"
      >
        <UIcon name="i-lucide-calendar-x" class="size-10 text-dimmed" />
        <p class="text-sm text-muted">Página de agendamento não encontrada.</p>
        <UButton label="Voltar" to="/app/appointments/scheduling" />
      </div>
      <div
        v-else
        class="mx-auto grid w-full max-w-7xl items-start gap-6 px-1 py-3 sm:px-4 sm:py-6 lg:grid-cols-[200px_minmax(0,1fr)] xl:grid-cols-[200px_minmax(0,1fr)_260px]"
      >
        <aside class="space-y-5 lg:sticky lg:top-0">
          <UButton
            label="Todas as páginas"
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="link"
            to="/app/appointments/scheduling"
            class="hidden lg:inline-flex"
          />
          <nav
            aria-label="Configurações do agendamento"
            class="flex gap-1 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible"
          >
            <button
              v-for="tab in tabs"
              :key="tab.value"
              type="button"
              :aria-current="activeTab === tab.value ? 'page' : undefined"
              class="flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-primary"
              :class="
                activeTab === tab.value
                  ? 'bg-elevated font-medium text-highlighted'
                  : 'text-muted hover:bg-elevated/60 hover:text-highlighted'
              "
              @click="activeTab = tab.value"
            >
              <UIcon :name="tab.icon" class="size-4 shrink-0" />
              {{ tab.label }}
              <UIcon
                v-if="invalidTab === tab.value"
                name="i-lucide-circle-alert"
                class="ml-auto size-4 text-error"
              />
            </button>
          </nav>
          <div class="hidden rounded-xl border border-default p-4 lg:block">
            <div class="flex items-center justify-between gap-3">
              <span class="text-sm font-medium text-highlighted">
                {{ isActive ? "Página ativa" : "Página pausada" }}
              </span>
              <USwitch
                :model-value="isActive"
                aria-label="Ativar página de agendamento"
                @update:model-value="onToggleActive"
              />
            </div>
            <p class="mt-2 text-xs leading-relaxed text-muted">
              {{
                isActive
                  ? "Seu link está disponível para receber reservas."
                  : "Seu link não está recebendo novas reservas."
              }}
            </p>
          </div>
        </aside>
        <div class="min-w-0 space-y-6">
          <div>
            <div class="flex items-center justify-between gap-3">
              <h1
                class="text-2xl font-semibold tracking-tight text-highlighted"
              >
                {{ currentTab.label }}
              </h1>
              <USwitch
                :model-value="isActive"
                label="Ativa"
                class="lg:hidden"
                @update:model-value="onToggleActive"
              />
            </div>
            <p class="mt-2 text-sm leading-relaxed text-muted">
              {{ tabDescriptions[activeTab] }}
            </p>
          </div>
          <!-- EVENTO -->
          <div v-if="activeTab === 'evento'" class="space-y-5">
            <UCard v-if="invalidTab === 'evento'" :ui="{ root: 'ring-error' }">
              <p class="text-sm text-error">
                Corrija os campos abaixo antes de salvar.
              </p>
            </UCard>
            <UCard>
              <template #header>
                <p class="text-sm font-medium text-highlighted">Detalhes</p>
              </template>
              <div class="space-y-4">
                <UFormField label="Título">
                  <UInput v-model="state.title" class="w-full" />
                </UFormField>
                <UFormField
                  label="URL"
                  :description="
                    username
                      ? `kortex.app/${username}/…`
                      : 'Defina seu username em Configurações para publicar esta página no seu perfil.'
                  "
                >
                  <UInput v-model="state.slug" class="w-full">
                    <template v-if="username" #leading>
                      <span class="text-xs text-dimmed">{{ username }}/</span>
                    </template>
                    <template #trailing>
                      <UIcon
                        v-if="slugCheck.status === 'checking'"
                        name="i-lucide-loader-2"
                        class="size-4 animate-spin text-dimmed"
                      />
                      <UIcon
                        v-else-if="slugCheck.status === 'available'"
                        name="i-lucide-check"
                        class="size-4 text-success"
                      />
                      <UIcon
                        v-else-if="slugCheck.status === 'unavailable'"
                        name="i-lucide-x"
                        class="size-4 text-error"
                      />
                    </template>
                  </UInput>
                  <p
                    v-if="slugCheck.status === 'unavailable'"
                    class="mt-1 text-xs text-error"
                  >
                    {{ slugCheck.reason }}
                  </p>
                  <p
                    v-else-if="publicProfileUrl"
                    class="mt-1 truncate text-xs text-muted"
                  >
                    {{ publicProfileUrl }}
                  </p>
                </UFormField>
                <UFormField
                  label="Descrição"
                  description="Aparece para o convidado no topo da página."
                >
                  <UTextarea
                    v-model="state.description"
                    :rows="3"
                    class="w-full"
                  />
                </UFormField>
              </div>
            </UCard>
            <UCard>
              <template #header>
                <p class="text-sm font-medium text-highlighted">Agendamento</p>
              </template>
              <div class="grid gap-4 sm:grid-cols-2">
                <UFormField label="Calendário">
                  <USelect
                    v-model="state.calendarId"
                    :items="calendarOptions"
                    value-key="value"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Duração (min)">
                  <UInputNumber
                    v-model="state.durationMinutes"
                    :min="5"
                    :max="480"
                    class="w-full"
                  />
                </UFormField>
              </div>
            </UCard>
            <UCard>
              <template #header>
                <p class="text-sm font-medium text-highlighted">Local</p>
              </template>
              <div class="grid gap-4 sm:grid-cols-2">
                <UFormField label="Tipo">
                  <USelect
                    v-model="state.locationType"
                    :items="locationOptions"
                    value-key="value"
                    class="w-full"
                  />
                </UFormField>
                <UFormField
                  :label="locationDetailMeta[state.locationType].label"
                >
                  <UInput
                    v-model="state.locationDetails"
                    :placeholder="
                      locationDetailMeta[state.locationType].placeholder
                    "
                    class="w-full"
                  />
                </UFormField>
              </div>
            </UCard>
            <UCard>
              <template #header>
                <p class="text-sm font-medium text-highlighted">Cor</p>
              </template>
              <div class="space-y-2">
                <div class="flex gap-2">
                  <button
                    v-for="opt in colorOptions"
                    :key="opt.value"
                    type="button"
                    class="size-8 rounded-full ring-2 ring-offset-2 ring-offset-default transition-all"
                    :class="
                      state.color === opt.value
                        ? 'ring-primary'
                        : 'ring-transparent'
                    "
                    :style="{ backgroundColor: opt.value }"
                    :title="opt.label"
                    @click="
                      state.color = state.color === opt.value ? null : opt.value
                    "
                  />
                </div>
                <p class="text-xs text-muted">
                  Usada só para diferenciar suas páginas na lista. O convidado
                  não vê.
                </p>
              </div>
            </UCard>
            <UCard>
              <template #header>
                <p class="text-sm font-medium text-highlighted">Capa</p>
              </template>
              <div class="space-y-2">
                <div
                  v-if="state.coverImageUrl"
                  class="relative h-32 overflow-hidden rounded-lg"
                >
                  <img
                    :src="state.coverImageUrl"
                    alt=""
                    class="size-full object-cover"
                  />
                  <div
                    class="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/60 to-transparent p-2"
                  >
                    <UButton
                      icon="i-lucide-image"
                      size="xs"
                      color="neutral"
                      variant="solid"
                      :loading="coverUploading"
                      aria-label="Trocar capa"
                      @click="coverInputRef?.click()"
                    />
                    <UButton
                      icon="i-lucide-trash-2"
                      size="xs"
                      color="neutral"
                      variant="solid"
                      aria-label="Remover capa"
                      @click="onRemoveCoverImage"
                    />
                  </div>
                </div>
                <UButton
                  v-else
                  label="Adicionar capa"
                  icon="i-lucide-image-plus"
                  size="sm"
                  color="neutral"
                  variant="subtle"
                  :loading="coverUploading"
                  @click="coverInputRef?.click()"
                />
                <input
                  ref="coverInputRef"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  class="hidden"
                  @change="onCoverFileSelected"
                />
                <p class="text-xs text-muted">
                  Aparece no topo da página pública. Recomendado: 1200×400px.
                </p>
              </div>
            </UCard>
          </div>
          <!-- DISPONIBILIDADE -->
          <div v-if="activeTab === 'disponibilidade'" class="space-y-5">
            <UCard
              v-if="invalidTab === 'disponibilidade'"
              :ui="{ root: 'ring-error' }"
            >
              <p class="text-sm text-error">
                Defina ao menos uma janela de disponibilidade.
              </p>
            </UCard>
            <UCard>
              <template #header>
                <p class="text-sm font-medium text-highlighted">
                  Grade semanal
                </p>
              </template>
              <div class="space-y-3">
                <UFormField label="Fuso horário">
                  <USelect
                    v-model="state.timezone"
                    :items="timezoneOptions"
                    value-key="value"
                    searchable
                    class="w-full sm:w-72"
                  />
                </UFormField>
                <div class="space-y-2">
                  <div
                    v-for="day in 7"
                    :key="day - 1"
                    class="rounded-lg border border-default p-3 sm:p-4"
                    :class="
                      dayWindows[day - 1]!.length
                        ? 'bg-default'
                        : 'bg-elevated/30'
                    "
                  >
                    <div class="flex items-center gap-2">
                      <UCheckbox
                        :model-value="dayWindows[day - 1]!.length > 0"
                        :label="dayLabels[day - 1]"
                        @update:model-value="toggleDay(day - 1)"
                      />
                      <span
                        v-if="!dayWindows[day - 1]!.length"
                        class="ml-auto text-xs text-dimmed"
                      >
                        Indisponível
                      </span>
                      <div
                        v-if="dayWindows[day - 1]!.length > 0"
                        class="ml-auto flex items-center gap-1"
                      >
                        <UPopover
                          :content="{ align: 'end' }"
                          @update:open="
                            (v: boolean) => onCopyPopoverOpen(day - 1, v)
                          "
                        >
                          <UButton
                            icon="i-lucide-copy"
                            size="xs"
                            color="neutral"
                            variant="ghost"
                            aria-label="Copiar horários para outros dias"
                          />
                          <template #content>
                            <div class="w-56 space-y-2 p-3">
                              <p class="text-xs font-medium text-highlighted">
                                Copiar horários de
                                {{ dayLabels[day - 1] }} para:
                              </p>
                              <div class="space-y-1.5">
                                <UCheckbox
                                  v-for="target in 7"
                                  v-show="target - 1 !== day - 1"
                                  :key="target"
                                  :label="dayLabels[target - 1]"
                                  :model-value="
                                    (copyTargetsByDay[day - 1] ?? []).includes(
                                      target - 1,
                                    )
                                  "
                                  @update:model-value="
                                    (v: boolean) =>
                                      toggleCopyTarget(day - 1, target - 1, v)
                                  "
                                />
                              </div>
                              <UButton
                                label="Copiar"
                                size="xs"
                                block
                                class="mt-1"
                                @click="applyCopyToTargets(day - 1)"
                              />
                            </div>
                          </template>
                        </UPopover>
                        <UButton
                          icon="i-lucide-plus"
                          size="xs"
                          color="neutral"
                          variant="ghost"
                          @click="addWindow(day - 1)"
                        />
                      </div>
                    </div>
                    <div
                      v-if="dayWindows[day - 1]!.length > 0"
                      class="mt-3 space-y-2 sm:pl-6"
                    >
                      <div
                        v-for="(w, wi) in dayWindows[day - 1]"
                        :key="wi"
                        class="flex items-center gap-2"
                      >
                        <UInput
                          v-model="w.startTime"
                          type="time"
                          size="sm"
                          :aria-label="`Início do horário de ${dayLabels[day - 1]}`"
                          class="min-w-0 flex-1 sm:max-w-36"
                        />
                        <span class="text-xs text-muted"> até </span>
                        <UInput
                          v-model="w.endTime"
                          type="time"
                          size="sm"
                          :aria-label="`Fim do horário de ${dayLabels[day - 1]}`"
                          class="min-w-0 flex-1 sm:max-w-36"
                        />
                        <UButton
                          icon="i-lucide-x"
                          size="xs"
                          color="neutral"
                          variant="ghost"
                          @click="removeWindow(day - 1, wi)"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </UCard>
            <UCard>
              <template #header>
                <p class="text-sm font-medium text-highlighted">
                  Janela de reserva
                </p>
              </template>
              <div class="space-y-4">
                <UFormField
                  label="Antecedência mínima"
                  description="Impede reservas de última hora."
                >
                  <div class="flex items-center gap-2">
                    <UInputNumber
                      v-model="minNoticeDisplayValue"
                      :min="0"
                      :max="minNoticeUnit === 'days' ? 30 : 720"
                      class="w-32"
                    />
                    <USelect
                      v-model="minNoticeUnit"
                      :items="minNoticeUnitOptions"
                      value-key="value"
                      class="w-28"
                    />
                  </div>
                </UFormField>
                <UFormField label="Reservas até quantos dias no futuro">
                  <UInputNumber
                    v-model="state.maxAdvanceDays"
                    :min="1"
                    :max="365"
                    class="w-full sm:w-40"
                  />
                </UFormField>
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-sm font-medium text-highlighted">
                      Máximo de reservas por dia
                    </p>
                    <p class="text-xs text-muted">
                      Limita quantos horários podem ser preenchidos no mesmo
                      dia.
                    </p>
                  </div>
                  <USwitch v-model="state.maxBookingsPerDayEnabled" />
                </div>
                <UInputNumber
                  v-if="state.maxBookingsPerDayEnabled"
                  v-model="state.maxBookingsPerDay"
                  :min="1"
                  :max="100"
                  class="w-full sm:w-40"
                />
              </div>
            </UCard>
          </div>
          <!-- FORMULÁRIO -->
          <div v-if="activeTab === 'formulario'" class="space-y-5">
            <UCard
              v-if="invalidTab === 'formulario'"
              :ui="{ root: 'ring-error' }"
            >
              <p class="text-sm text-error">
                Alguma pergunta de seleção está sem opções suficientes.
              </p>
            </UCard>
            <UCard>
              <template #header>
                <p class="text-sm font-medium text-highlighted">
                  Perguntas da reserva
                </p>
              </template>
              <div class="divide-y divide-default">
                <div class="flex items-center justify-between py-2.5">
                  <div>
                    <p class="text-sm text-highlighted">Seu nome</p>
                    <p class="text-xs text-muted">Identificação do convidado</p>
                  </div>
                  <UBadge color="neutral" variant="subtle" size="sm">
                    Obrigatório
                  </UBadge>
                </div>
                <div class="flex items-center justify-between py-2.5">
                  <div>
                    <p class="text-sm text-highlighted">Endereço de e-mail</p>
                    <p class="text-xs text-muted">Contato para a reserva</p>
                  </div>
                  <UBadge color="neutral" variant="subtle" size="sm">
                    Obrigatório
                  </UBadge>
                </div>
                <div
                  v-for="(q, i) in questions"
                  :key="i"
                  class="flex items-center gap-2 py-2.5"
                >
                  <div class="flex flex-col">
                    <UButton
                      icon="i-lucide-chevron-up"
                      size="2xs"
                      color="neutral"
                      variant="ghost"
                      :disabled="i === 0"
                      @click="moveQuestion(i, -1)"
                    />
                    <UButton
                      icon="i-lucide-chevron-down"
                      size="2xs"
                      color="neutral"
                      variant="ghost"
                      :disabled="i === questions.length - 1"
                      @click="moveQuestion(i, 1)"
                    />
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm text-highlighted">
                      {{ q.label || "(sem rótulo)" }}
                    </p>
                    <p class="text-xs text-muted">
                      {{ questionTypeLabel(q) }}
                    </p>
                  </div>
                  <UBadge color="neutral" variant="subtle" size="sm">
                    {{ q.isRequired ? "Obrigatória" : "Opcional" }}
                  </UBadge>
                  <USwitch
                    :model-value="!q.isHidden"
                    @update:model-value="toggleQuestionHidden(i)"
                  />
                  <UButton
                    label="Editar"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    @click="openEditQuestion(i)"
                  />
                </div>
              </div>
              <UButton
                label="Adicionar pergunta"
                icon="i-lucide-plus"
                variant="subtle"
                size="sm"
                class="mt-3"
                @click="openNewQuestion"
              />
            </UCard>
          </div>
          <!-- LIMITES -->
          <div v-if="activeTab === 'limites'" class="space-y-5">
            <UCard>
              <template #header>
                <p class="text-sm font-medium text-highlighted">
                  Intervalos entre encontros
                </p>
              </template>
              <div class="grid gap-4 sm:grid-cols-3">
                <UFormField label="Antes do evento">
                  <USelect
                    v-model="state.bufferBeforeMinutes"
                    :items="bufferBeforeOptions"
                    value-key="value"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Após o evento">
                  <USelect
                    v-model="state.bufferAfterMinutes"
                    :items="bufferAfterOptions"
                    value-key="value"
                    class="w-full"
                  />
                </UFormField>
                <UFormField
                  label="Intervalo entre horários"
                  description="Ex.: 30 min = oferece 9:00, 9:30, 10:00…"
                >
                  <USelect
                    v-model="state.slotIncrementMinutes"
                    :items="slotIncrementOptions"
                    value-key="value"
                    class="w-full"
                  />
                </UFormField>
              </div>
            </UCard>
          </div>
          <!-- POLÍTICAS -->
          <div v-if="activeTab === 'politicas'" class="space-y-5">
            <UCard>
              <template #header>
                <p class="text-sm font-medium text-highlighted">Confirmação</p>
              </template>
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium text-highlighted">
                    Confirmação manual
                  </p>
                  <p class="text-xs text-muted">
                    Você aprova cada reserva antes de ela valer — enquanto isso,
                    ela fica como "Pendente" na sua lista de reservas e o
                    horário continua bloqueado na sua agenda.
                  </p>
                </div>
                <USwitch v-model="state.requiresConfirmation" />
              </div>
            </UCard>
            <UCard>
              <template #header>
                <p class="text-sm font-medium text-highlighted">
                  Nome do evento na agenda
                </p>
              </template>
              <UFormField
                description="Como a reserva aparece no seu calendário. Variáveis: {titulo}, {convidado}, {email}."
              >
                <UInput
                  v-model="state.calendarEventTitleTemplate"
                  placeholder="{titulo} com {convidado}"
                  class="w-full"
                />
              </UFormField>
            </UCard>
            <UCard>
              <template #header>
                <p class="text-sm font-medium text-highlighted">
                  Reagendar e cancelar
                </p>
              </template>
              <div class="space-y-4">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-sm font-medium text-highlighted">
                      Permitir cancelamento pelo convidado
                    </p>
                  </div>
                  <USwitch v-model="state.cancellationEnabled" />
                </div>
                <div
                  v-if="state.cancellationEnabled"
                  class="space-y-3 border-l-2 border-default/60 pl-4"
                >
                  <div class="flex items-center justify-between">
                    <p class="text-sm text-highlighted">
                      Exigir antecedência mínima
                    </p>
                    <USwitch v-model="state.cancellationMinNoticeEnabled" />
                  </div>
                  <UInputNumber
                    v-if="state.cancellationMinNoticeEnabled"
                    v-model="state.cancellationMinNoticeHours"
                    :min="1"
                    :max="720"
                    class="w-full sm:w-40"
                  />
                  <div class="flex items-center justify-between">
                    <p class="text-sm text-highlighted">
                      Exigir motivo do cancelamento
                    </p>
                    <USwitch v-model="state.cancellationReasonRequired" />
                  </div>
                </div>
                <div class="flex items-center justify-between">
                  <p class="text-sm font-medium text-highlighted">
                    Permitir reagendamento pelo convidado
                  </p>
                  <USwitch v-model="state.rescheduleEnabled" />
                </div>
              </div>
            </UCard>
          </div>
          <!-- PRIVACIDADE -->
          <div v-if="activeTab === 'privacidade'" class="space-y-5">
            <UCard>
              <template #header>
                <p class="text-sm font-medium text-highlighted">Privacidade</p>
              </template>
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium text-highlighted">
                    Mostrar no meu perfil público
                  </p>
                  <p class="text-xs text-muted">
                    Aparece na lista de eventos de
                    {{
                      username
                        ? `kortex.app/${username}`
                        : "sua página pública"
                    }}. Desativado, a página continua acessível pelo link
                    direto.
                  </p>
                </div>
                <USwitch v-model="state.showOnProfile" />
              </div>
            </UCard>
            <UCard>
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium text-highlighted">
                    Ocultar detalhes na página de gerenciamento
                  </p>
                  <p class="text-xs text-muted">
                    O convidado vê só data, hora e status — sem local — ao abrir
                    o link de gerenciamento.
                  </p>
                </div>
                <USwitch v-model="state.hideDetailsOnManagePage" />
              </div>
            </UCard>
            <UCard>
              <template #header>
                <p class="text-sm font-medium text-error">Zona de perigo</p>
              </template>
              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-sm text-highlighted">
                      Regenerar link público
                    </p>
                    <p class="text-xs text-muted">
                      O link atual deixa de funcionar na hora.
                    </p>
                  </div>
                  <UButton
                    label="Regenerar"
                    color="neutral"
                    variant="outline"
                    size="sm"
                    @click="regenerateConfirmOpen = true"
                  />
                </div>
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-sm text-highlighted">Arquivar página</p>
                    <p class="text-xs text-muted">
                      Remove a página da sua lista e desativa o link.
                    </p>
                  </div>
                  <UButton
                    label="Arquivar"
                    color="error"
                    variant="outline"
                    size="sm"
                    @click="archiveConfirmOpen = true"
                  />
                </div>
              </div>
            </UCard>
          </div>
        </div>
        <aside class="hidden space-y-4 xl:sticky xl:top-0 xl:block">
          <div
            class="overflow-hidden rounded-xl border border-default bg-default"
          >
            <div
              class="border-b border-default bg-elevated/40 px-5 py-3 text-xs font-medium text-muted"
            >
              Resumo do evento
            </div>
            <div class="space-y-5 p-5">
              <div
                class="flex size-10 items-center justify-center rounded-xl bg-elevated"
              >
                <UIcon
                  name="i-lucide-calendar-clock"
                  class="size-5 text-highlighted"
                />
              </div>
              <div>
                <h2 class="break-words text-lg font-semibold text-highlighted">
                  {{ state.title || "Seu evento" }}
                </h2>
                <p
                  v-if="state.description"
                  class="mt-2 line-clamp-4 whitespace-pre-line text-sm leading-relaxed text-muted"
                >
                  {{ state.description }}
                </p>
              </div>
              <div class="space-y-3 text-xs text-muted">
                <p class="flex items-center gap-2">
                  <UIcon name="i-lucide-clock" class="size-4 shrink-0" />
                  {{ state.durationMinutes }}
                  minutos
                </p>
                <p class="flex items-center gap-2">
                  <UIcon
                    :name="LOCATION_TYPE_META[state.locationType].icon"
                    class="size-4 shrink-0"
                  />
                  {{ LOCATION_TYPE_META[state.locationType].label }}
                </p>
                <p class="flex items-center gap-2">
                  <UIcon
                    name="i-lucide-calendar-days"
                    class="size-4 shrink-0"
                  />
                  {{ availableDays }}
                  dias disponíveis por semana
                </p>
                <p class="flex items-start gap-2 break-all">
                  <UIcon name="i-lucide-globe" class="size-4 shrink-0" />
                  {{ state.timezone }}
                </p>
              </div>
              <UButton
                label="Abrir página pública"
                icon="i-lucide-external-link"
                color="neutral"
                variant="outline"
                block
                @click="onPreview"
              />
              <p v-if="isDirty" class="text-xs leading-relaxed text-muted">
                Salve as alterações para vê-las na página pública.
              </p>
            </div>
          </div>
          <UButton
            label="Ver reservas"
            icon="i-lucide-list"
            color="neutral"
            variant="ghost"
            block
            :to="`/app/appointments/bookings/${pageId}`"
          />
        </aside>
      </div>
    </template>
  </UDashboardPanel>
  <AppointmentsSchedulingQuestionEditSlideover
    :open="questionSlideoverOpen"
    :question="editingQuestion"
    @update:open="questionSlideoverOpen = $event"
    @save="onSaveQuestion"
    @remove="onRemoveQuestion"
  />
  <UModal v-model:open="regenerateConfirmOpen" title="Regenerar link?">
    <template #body>
      <p class="text-sm text-muted">
        O link atual ({{ shareUrl }}) deixará de funcionar imediatamente.
        Qualquer pessoa que já tenha esse link não conseguirá mais acessá-lo.
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancelar"
          color="neutral"
          variant="outline"
          @click="regenerateConfirmOpen = false"
        />
        <UButton
          label="Regenerar"
          color="error"
          :loading="regenerating"
          @click="onRegenerateToken"
        />
      </div>
    </template>
  </UModal>
  <UModal v-model:open="archiveConfirmOpen" title="Arquivar página?">
    <template #body>
      <p class="text-sm text-muted">
        A página some da sua lista e o link público deixa de funcionar. Reservas
        já feitas continuam na sua Agenda.
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancelar"
          color="neutral"
          variant="outline"
          @click="archiveConfirmOpen = false"
        />
        <UButton
          label="Arquivar"
          color="error"
          :loading="archiving"
          @click="onArchive"
        />
      </div>
    </template>
  </UModal>
</template>
