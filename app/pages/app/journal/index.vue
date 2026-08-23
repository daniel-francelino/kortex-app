<script setup lang="ts">
import { AnimatePresence, motion } from "motion-v";
import { useDebounceFn } from '@vueuse/core'
import type { JournalEntry, JournalListResponse } from '~/types/journal'
import { tiptapJsonToMarkdown } from '~/utils/tiptap-markdown'
import { downloadTextFile } from '~/utils/export-download'

definePageMeta({
  layout: "app",
  ssr: false,
});

useSeoMeta({
  title: "Diário de Bordo",
});

const {
  todayData,
  todayStatus,
  refreshToday,
  calendarDates,
  calendarStatus,
  calendarFrom,
  calendarTo,
  refreshCalendar,
  upsertEntry,
  listData,
  listFetchStatus,
  listPage,
  listSearch,
  refreshList,
  insights,
  insightsStatus,
  insightsRange,
  refreshInsights,
  isOnline,
  pendingSyncCount,
  syncingOffline,
} = useJournal();

const {
  statusLoaded: lockStatusLoaded,
  refreshStatus: refreshLockStatus,
  isModuleLocked,
} = useJournalLock();

const {
  enabled: encryptionEnabled,
  refreshStatus: refreshEncryptionStatus,
  decryptEntryFields
} = useJournalEncryption()

onMounted(() => {
  refreshLockStatus()
  refreshEncryptionStatus()
})

// ─── Busca sob criptografia (client-side) ──────────────────────────────────────
// O servidor não consegue mais fazer `ilike` em ciphertext — com E2EE ligado,
// a busca por texto passa a rodar aqui: busca todas as entradas sem filtro,
// decifra e compara no navegador. Fica fora de `useJournal.ts` porque só o
// modo de busca sob criptografia precisa disso; a paginação normal (sem
// busca) continua indo pelo fluxo de sempre.
const encryptedSearchResults = ref<JournalEntry[] | null>(null)
const encryptedSearchLoading = ref(false)
const usingEncryptedSearch = computed(() => encryptionEnabled.value && listSearch.value.trim().length > 0)

async function fetchAllEntries(): Promise<JournalEntry[]> {
  const all: JournalEntry[] = []
  let page = 1
  let fetchedTotal = Infinity
  while ((page - 1) * 100 < fetchedTotal) {
    const result = await $fetch<JournalListResponse>('/api/journal/entries', { query: { page, pageSize: 100 } })
    fetchedTotal = result.total
    all.push(...result.data)
    if (result.data.length === 0) break
    page++
  }
  return all
}

async function runEncryptedSearch(query: string) {
  const trimmed = query.trim()
  if (!trimmed) {
    encryptedSearchResults.value = null
    return
  }
  encryptedSearchLoading.value = true
  try {
    const all = await fetchAllEntries()
    const needle = trimmed.toLowerCase()
    const matches: JournalEntry[] = []
    for (const entry of all) {
      const decrypted = entry.isEncrypted
        ? await decryptEntryFields(entry).catch(() => null)
        : { title: entry.title, content: entry.content }
      if (!decrypted) continue
      const haystack = `${decrypted.title ?? ''} ${decrypted.content ?? ''}`.toLowerCase()
      if (haystack.includes(needle)) matches.push(entry)
    }
    encryptedSearchResults.value = matches
  } finally {
    encryptedSearchLoading.value = false
  }
}

const debouncedEncryptedSearch = useDebounceFn(runEncryptedSearch, 300)

watch(listSearch, (val) => {
  if (encryptionEnabled.value) debouncedEncryptedSearch(val)
})

// ─── Exportar tudo (backup) ─────────────────────────────────────────────────
// Decifra tudo no cliente antes de exportar (se E2EE estiver ligado) — o
// arquivo baixado sempre sai em texto legível, nunca com ciphertext dentro.
const exportingAll = ref(false)

async function decryptedFor(entry: JournalEntry): Promise<{ title: string | null, content: string }> {
  if (!entry.isEncrypted) return { title: entry.title, content: entry.content }
  try {
    return await decryptEntryFields(entry)
  } catch {
    return { title: entry.title, content: '[Não foi possível decifrar esta entrada]' }
  }
}

function formatExportDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  })
}

async function exportAllMarkdown() {
  if (exportingAll.value) return
  exportingAll.value = true
  try {
    const all = await fetchAllEntries()
    all.sort((a, b) => a.entryDate.localeCompare(b.entryDate))
    const parts: string[] = []
    for (const entry of all) {
      const { title, content: plain } = await decryptedFor(entry)
      const heading = `## ${formatExportDate(entry.entryDate)}${title ? ` — ${title}` : ''}`
      parts.push(`${heading}\n\n${tiptapJsonToMarkdown(plain)}`)
    }
    downloadTextFile(
      `diario-completo-${new Date().toISOString().split('T')[0]}.md`,
      `# Diário de Bordo\n\n${parts.join('\n\n---\n\n')}\n`
    )
  } finally {
    exportingAll.value = false
  }
}

async function exportAllJson() {
  if (exportingAll.value) return
  exportingAll.value = true
  try {
    const all = await fetchAllEntries()
    all.sort((a, b) => a.entryDate.localeCompare(b.entryDate))
    const backup = []
    for (const entry of all) {
      const { title, content: plain } = await decryptedFor(entry)
      backup.push({ entryDate: entry.entryDate, title, content: plain, mood: entry.mood })
    }
    downloadTextFile(
      `diario-backup-${new Date().toISOString().split('T')[0]}.json`,
      JSON.stringify({ exportedAt: new Date().toISOString(), entries: backup }, null, 2),
      'application/json;charset=utf-8'
    )
  } finally {
    exportingAll.value = false
  }
}

const exportAllMenuItems = computed(() => [
  { label: 'Markdown (um arquivo)', icon: 'i-lucide-file-text', onSelect: exportAllMarkdown },
  { label: 'Backup (JSON)', icon: 'i-lucide-database-backup', onSelect: exportAllJson }
])

const isMobile = useIsMobile();

// ─── View mode ────────────────────────────────────────────────────────────────
type JournalView = "editor" | "calendar" | "list" | "periods" | "insights";
const activeView = ref<JournalView>("editor");

watch(activeView, (view) => {
  if (view === "editor") refreshToday();
  if (view === "calendar") refreshCalendar();
  if (view === "list") {
    refreshList();
  }
  if (view === "insights") refreshInsights();
});

// ─── Editor ref (for unsaved-changes check) ───────────────────────────────────
const editorRef = ref<{
  isUnsaved: () => boolean;
  doSave: () => Promise<void>;
} | null>(null);

// ─── Unsaved-changes confirmation on route leave ──────────────────────────────
const confirmLeaveOpen = ref(false);
let resolvePendingNav: ((allow: boolean) => void) | null = null;

onBeforeRouteLeave(async () => {
  const editor = editorRef.value;
  if (!editor?.isUnsaved()) return; // nothing unsaved, allow navigation

  return new Promise<boolean | undefined>((resolve) => {
    resolvePendingNav = resolve;
    confirmLeaveOpen.value = true;
  }).then((allow) => (allow ? undefined : false));
});

async function onConfirmSaveAndLeave() {
  confirmLeaveOpen.value = false;
  await editorRef.value?.doSave();
  resolvePendingNav?.(true);
  resolvePendingNav = null;
}

function onConfirmDiscardAndLeave() {
  confirmLeaveOpen.value = false;
  resolvePendingNav?.(true);
  resolvePendingNav = null;
}

function onConfirmCancel() {
  confirmLeaveOpen.value = false;
  resolvePendingNav?.(false);
  resolvePendingNav = null;
}

// Calendar entry modal
const detailModalOpen = ref(false);
const selectedDate = ref("");

function onSelectDate(date: string) {
  selectedDate.value = date;
  detailModalOpen.value = true;
}

function onCalendarMonthChange(from: string, to: string) {
  calendarFrom.value = from;
  calendarTo.value = to;
}

// ─── View options ─────────────────────────────────────────────────────────────
const viewOptions: { value: JournalView; icon: string; tooltip: string }[] = [
  { value: "editor", icon: "i-lucide-pen-line", tooltip: "Editor de hoje" },
  { value: "calendar", icon: "i-lucide-calendar-days", tooltip: "Calendário" },
  { value: "list", icon: "i-lucide-list", tooltip: "Lista de entradas" },
  { value: "periods", icon: "i-lucide-calendar-range", tooltip: "Notas semanais/mensais" },
  { value: "insights", icon: "i-lucide-bar-chart-3", tooltip: "Insights" },
];

// ─── Entry list view ────────────────────────────────────────────────────────────
function onListEntrySelect(date: string) {
  onSelectDate(date);
}

// ─── Insights view ────────────────────────────────────────────────────────────
function onInsightsRangeChange(range: "7d" | "30d" | "90d") {
  insightsRange.value = range;
}
</script>

<template>
  <UDashboardPanel id="journal">
    <template #header>
      <UDashboardNavbar title="Diário de Bordo">
        <template #leading>
          <AppSidebarCollapse />
        </template>

        <template #right>
          <div
            class="flex items-center gap-0.5 rounded-lg border border-default p-0.5"
          >
            <UTooltip
              v-for="opt in viewOptions"
              :key="opt.value"
              :text="opt.tooltip"
            >
              <UButton
                square
                :color="activeView === opt.value ? 'primary' : 'neutral'"
                :variant="activeView === opt.value ? 'soft' : 'ghost'"
                @click="activeView = opt.value"
              >
                <UIcon :name="opt.icon" class="size-5 shrink-0" />
              </UButton>
            </UTooltip>
          </div>

          <NotificationsButton />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- PIN lock (module mode) — gates the whole panel until unlocked this session -->
      <template v-if="!lockStatusLoaded">
        <div class="space-y-4">
          <USkeleton class="h-6 w-48" />
          <USkeleton class="h-64 w-full rounded-lg" />
        </div>
      </template>
      <!-- isModuleLocked is a computed driven by useJournalLock's internal
           unlocked-state ref, which LockScreen updates on a valid PIN — no
           local handler needed, it recomputes to false on its own. -->
      <JournalLockScreen v-else-if="isModuleLocked" />
      <div v-else class="space-y-4">
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
          <span v-if="!isOnline"
            >Offline — as alterações serão sincronizadas ao reconectar</span
          >
          <span v-else-if="syncingOffline"
            >Sincronizando alterações offline...</span
          >
          <span v-else
            >{{ pendingSyncCount }} alteração(ões) pendente(s) de
            sincronização</span
          >
        </div>

        <AnimatePresence mode="wait">
          <!-- EDITOR VIEW -->
          <motion.div
            v-if="activeView === 'editor'"
            :initial="{ opacity: 0, y: 10, filter: 'blur(2px)' }"
            :animate="{ opacity: 1, y: 0, filter: 'blur(0px)' }"
            :exit="{ opacity: 0, y: -8, filter: 'blur(2px)' }"
            :transition="{ duration: 0.18, ease: 'easeOut' }"
          >
            <JournalTodayEditor
              ref="editorRef"
              :today-entry="todayData?.entry ?? null"
              :streak="todayData?.streak ?? 0"
              :loading="todayStatus === 'pending'"
              :is-online="isOnline"
              :on-upsert-entry="upsertEntry"
            />
          </motion.div>

          <!-- CALENDAR VIEW -->
          <motion.div
            v-else-if="activeView === 'calendar'"
            :initial="{ opacity: 0, y: 10, filter: 'blur(2px)' }"
            :animate="{ opacity: 1, y: 0, filter: 'blur(0px)' }"
            :exit="{ opacity: 0, y: -8, filter: 'blur(2px)' }"
            :transition="{ duration: 0.18, ease: 'easeOut' }"
          >
            <JournalCalendarView
              :entry-dates="calendarDates ?? []"
              :loading="calendarStatus === 'pending'"
              @select-date="onSelectDate"
              @month-change="onCalendarMonthChange"
            />
          </motion.div>

          <!-- LIST VIEW -->
          <motion.div
            v-else-if="activeView === 'list'"
            class="space-y-4"
            :initial="{ opacity: 0, y: 10, filter: 'blur(2px)' }"
            :animate="{ opacity: 1, y: 0, filter: 'blur(0px)' }"
            :exit="{ opacity: 0, y: -8, filter: 'blur(2px)' }"
            :transition="{ duration: 0.18, ease: 'easeOut' }"
          >
            <div class="flex items-center gap-2">
              <UInput
                v-model="listSearch"
                icon="i-lucide-search"
                placeholder="Buscar no diário..."
                class="flex-1"
              />
              <UDropdownMenu
                :items="exportAllMenuItems"
                :content="{ align: 'end' }"
              >
                <UButton
                  icon="i-lucide-download"
                  label="Exportar tudo"
                  color="neutral"
                  variant="outline"
                  :loading="exportingAll"
                />
              </UDropdownMenu>
            </div>

            <JournalEntryList
              :entries="usingEncryptedSearch ? (encryptedSearchResults ?? []) : (listData?.data ?? [])"
              :total="usingEncryptedSearch ? (encryptedSearchResults?.length ?? 0) : (listData?.total ?? 0)"
              :page="usingEncryptedSearch ? 1 : listPage"
              :page-size="usingEncryptedSearch ? Math.max(encryptedSearchResults?.length ?? 1, 1) : (listData?.pageSize ?? 20)"
              :loading="usingEncryptedSearch ? encryptedSearchLoading : listFetchStatus === 'pending'"
              @update:page="listPage = $event"
              @select="onListEntrySelect"
            />
          </motion.div>

          <!-- PERIODIC NOTES VIEW -->
          <motion.div
            v-else-if="activeView === 'periods'"
            :initial="{ opacity: 0, y: 10, filter: 'blur(2px)' }"
            :animate="{ opacity: 1, y: 0, filter: 'blur(0px)' }"
            :exit="{ opacity: 0, y: -8, filter: 'blur(2px)' }"
            :transition="{ duration: 0.18, ease: 'easeOut' }"
          >
            <JournalPeriodicNotesView @select-date="onSelectDate" />
          </motion.div>

          <!-- INSIGHTS VIEW -->
          <motion.div
            v-else-if="activeView === 'insights'"
            class="space-y-4"
            :initial="{ opacity: 0, y: 10, filter: 'blur(2px)' }"
            :animate="{ opacity: 1, y: 0, filter: 'blur(0px)' }"
            :exit="{ opacity: 0, y: -8, filter: 'blur(2px)' }"
            :transition="{ duration: 0.18, ease: 'easeOut' }"
          >
            <div
              v-if="(todayData?.streak ?? 0) > 0"
              class="flex items-center gap-2 rounded-lg border border-default bg-elevated/30 px-4 py-3"
            >
              <span class="text-xl leading-none">🔥</span>
              <span class="text-sm text-highlighted">
                <strong>{{ todayData?.streak }}</strong>
                {{
                  todayData?.streak === 1 ? "dia seguido" : "dias seguidos"
                }}
                escrevendo no diário
              </span>
            </div>

            <JournalInsightsPanel
              :insights="insights ?? null"
              :loading="insightsStatus === 'pending'"
              @range-change="onInsightsRangeChange"
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Unsaved changes confirmation -->
  <UModal
    :open="confirmLeaveOpen"
    :dismissible="false"
    @update:open="confirmLeaveOpen = $event"
  >
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-pencil-line" class="size-4 text-warning" />
        <span class="text-sm font-semibold text-highlighted"
          >Alterações não salvas</span
        >
      </div>
    </template>

    <template #body>
      <p class="text-sm text-muted">
        Você tem alterações no diário que ainda não foram salvas. O que deseja
        fazer?
      </p>
    </template>

    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-end gap-2">
        <UButton
          label="Cancelar"
          variant="ghost"
          color="neutral"
          :size="isMobile ? 'md' : 'sm'"
          @click="onConfirmCancel"
        />
        <UButton
          label="Descartar"
          variant="outline"
          color="error"
          :size="isMobile ? 'md' : 'sm'"
          @click="onConfirmDiscardAndLeave"
        />
        <UButton
          label="Salvar e sair"
          icon="i-lucide-check"
          :size="isMobile ? 'md' : 'sm'"
          @click="onConfirmSaveAndLeave"
        />
      </div>
    </template>
  </UModal>

  <JournalEntryDetailModal
    v-if="selectedDate"
    :open="detailModalOpen"
    :date="selectedDate"
    @update:open="detailModalOpen = $event"
    @updated="
      refreshToday();
      refreshCalendar();
      refreshList();
    "
  />
</template>
