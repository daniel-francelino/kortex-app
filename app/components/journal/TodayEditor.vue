<script setup lang="ts">
import { AnimatePresence, motion } from 'motion-v'
import type { JournalEntry, UpsertEntryPayload } from '~/types/journal'
import { isEditorContentEmpty, serializeEditorContent } from '~/utils/editor/content'
import { tiptapJsonToMarkdown } from '~/utils/tiptap-markdown'
import { downloadTextFile, printHtmlAsPdf } from '~/utils/export-download'
import { captureWeatherSnapshot } from '~/utils/journal-weather'
import { getWeatherInfo } from '~/utils/weather-codes'
import { formatDisplay } from '#shared/utils/dateTime'

const props = defineProps<{
  todayEntry: JournalEntry | null
  loading: boolean
  streak?: number
  isOnline?: boolean
  onUpsertEntry: (payload: UpsertEntryPayload, options?: { silent?: boolean }) => Promise<JournalEntry | null>
}>()

const isMobile = useIsMobile()

const { mode: pinMode, isEntryLocked, toggleEntryLock } = useJournalLock()
const {
  enabled: encryptionEnabled,
  isUnlocked: encryptionUnlocked,
  encryptEntryFields,
  decryptEntryFields
} = useJournalEncryption()

// Precisa de senha/código antes de mostrar QUALQUER coisa (não só a
// entrada de hoje se ela já existir e estiver cifrada) — se a criptografia
// está ligada, uma entrada nova também deve ser cifrada, então escrever
// sem desbloquear primeiro criaria uma entrada em texto claro no meio de
// um diário supostamente cifrado.
const needsEncryptionUnlock = computed(() => encryptionEnabled.value && !encryptionUnlocked.value)

const today = new Date().toISOString().split('T')[0] ?? ''
const content = ref('')
const mood = ref<string | null>(null)
// Mirrors `todayEntry.locked` locally so toggling the lock reflects
// immediately — useJournal()'s store isn't refetched by toggleEntryLock().
const entryLocked = ref(false)
const togglingLock = ref(false)

const isLockedForViewing = computed(() =>
  isEntryLocked({ entryDate: today, locked: entryLocked.value })
)

async function onToggleLock() {
  if (!props.todayEntry || togglingLock.value) return
  togglingLock.value = true
  try {
    const updated = await toggleEntryLock(today, !entryLocked.value)
    if (updated) entryLocked.value = updated.locked
  } finally {
    togglingLock.value = false
  }
}

// ─── Clima/localização (item 17 — automático) ────────────────────────────────
// Tenta sozinho, uma vez por carregamento da página (`weatherAttempted`
// evita repetir o pedido de permissão a cada re-render/save). Se a pessoa
// negar a permissão, ou o clima não estiver disponível por qualquer razão,
// falha em silêncio de propósito — sem toast, sem botão de "tentar de
// novo", sem indício nenhum na tela de que isso foi tentado.
const weatherTempC = ref<number | null>(null)
const weatherCode = ref<number | null>(null)
const weatherAttempted = ref(false)
// A entrada de hoje pode ainda não existir no momento em que a permissão é
// concedida (dia em branco) — não dá pra gravar clima sem conteúdo (a API
// exige `content` não-vazio), então o snapshot fica em memória até o
// primeiro `doSave()` real anexar ele no mesmo payload.
let pendingWeatherSnapshot: { latitude: number, longitude: number, weatherTempC: number, weatherCode: number } | null = null

async function tryAutoCaptureWeather() {
  if (weatherAttempted.value || weatherCode.value !== null || needsEncryptionUnlock.value) return
  weatherAttempted.value = true
  try {
    const snapshot = await captureWeatherSnapshot()
    if (props.todayEntry) {
      const payload: UpsertEntryPayload = encryptionEnabled.value
        ? { entryDate: today, mood: savedMood.value, ...(await encryptEntryFields(null, savedContent.value)), ...snapshot }
        : { entryDate: today, title: null, content: savedContent.value, mood: savedMood.value, ...snapshot }
      const result = await props.onUpsertEntry(payload, { silent: true })
      if (result) {
        weatherTempC.value = result.weatherTempC
        weatherCode.value = result.weatherCode
      }
    } else {
      pendingWeatherSnapshot = snapshot
    }
  } catch {
    // Silencioso de propósito — ver comentário acima.
  }
}

// Last saved snapshot — what the server currently has
const savedContent = ref('')
const savedMood = ref<string | null>(null)

// Timestamp of the last user-initiated change (0 = no pending change)
const lastChangeAt = ref(0)

// The editor assigns a stable blockId to any node that doesn't have one yet
// (BlockIdExtension, useNotionEditor.ts) — needed for older entries saved
// before that existed. That assignment fires through the same
// `update:modelValue` channel as real typing, right after the editor mounts
// with freshly-loaded content, before the user could have touched anything.
// Left unhandled, `content` would diverge from `savedContent` immediately on
// load, permanently showing "Não salvo" and the unsaved-changes prompt on
// every visit until the next autosave happened to fix it. This absorbs that
// one automatic correction into the saved baseline instead of flagging it.
//
// Armed right after a fresh load, consumed by the first content change that
// follows (whether that's the editor's own correction or, less commonly, a
// genuinely very fast user edit). If nothing changes the content at all —
// the common case once every entry has stable ids — there's no event to
// consume it, so a short timeout disarms it on its own; otherwise a real
// edit made minutes later could get silently absorbed as "already saved"
// without ever reaching the server.
const suppressNextContentChange = ref(false)
let suppressTimer: ReturnType<typeof setTimeout> | null = null

function armContentSuppression() {
  suppressNextContentChange.value = true
  if (suppressTimer) clearTimeout(suppressTimer)
  suppressTimer = setTimeout(() => {
    suppressNextContentChange.value = false
    suppressTimer = null
  }, 500)
}

function disarmContentSuppression() {
  suppressNextContentChange.value = false
  if (suppressTimer) {
    clearTimeout(suppressTimer)
    suppressTimer = null
  }
}

// ── Auto-save state ────────────────────────────────────────────────────────────
type SaveStatus = 'idle' | 'unsaved' | 'saved' | 'offline-pending' | 'error'
const saveStatus = ref<SaveStatus>('idle')
const savedAt = ref<Date | null>(null)

// Once the entry has loaded at least once, never show the skeleton again —
// background saves must not interrupt the editor.
const initialized = ref(false)

const savedAtText = computed(() =>
  savedAt.value ? formatDisplay(savedAt.value, 'HH:mm') : ''
)

// ── Empty content check ────────────────────────────────────────────────────────
const isContentEmpty = computed(() => isEditorContentEmpty(content.value))

// True when editor has unsaved changes
const hasChanges = computed(() =>
  content.value !== savedContent.value || mood.value !== savedMood.value
)

// ── Sync entry from props ──────────────────────────────────────────────────────
// `todayEntry` also changes right after OUR OWN save resolves — upsertEntry()
// refetches /api/journal/today, and that echo can land here while the user
// kept typing during the round trip. Re-syncing at that point would blow
// away those newer keystrokes with what the server had a moment ago. Only
// pull from props when there's nothing unsaved locally (initial load, or a
// genuinely external change made elsewhere, e.g. via EntryDetailModal).
watch(
  [() => props.todayEntry, () => props.loading, needsEncryptionUnlock],
  async ([entry]) => {
    if (hasChanges.value) return
    // Ainda esperando a frase-secreta — não tenta popular nada com
    // ciphertext; assim que `needsEncryptionUnlock` virar `false` (evento
    // `@unlocked` da tela de desbloqueio), este watcher roda de novo.
    if (needsEncryptionUnlock.value) return

    if (entry) {
      let c = entry.content ?? ''
      if (entry.isEncrypted) {
        try {
          c = (await decryptEntryFields(entry)).content
        } catch {
          // Chave errada ou corrompida — não tem como popular o editor com
          // segurança; deixa como estava (skeleton) em vez de mostrar lixo.
          return
        }
      }
      if (c !== content.value) {
        content.value = c
      }
      savedContent.value = c

      const m = entry.mood ?? null
      if (m !== mood.value) {
        mood.value = m
      }
      savedMood.value = m
      entryLocked.value = entry.locked
      weatherTempC.value = entry.weatherTempC
      weatherCode.value = entry.weatherCode
      armContentSuppression()
      initialized.value = true
      void tryAutoCaptureWeather()
    } else if (!props.loading) {
      // Only reset when truly no entry and not mid-fetch
      content.value = ''
      savedContent.value = ''
      mood.value = null
      savedMood.value = null
      entryLocked.value = false
      weatherTempC.value = null
      weatherCode.value = null
      lastChangeAt.value = 0
      saveStatus.value = 'idle'
      armContentSuppression()
      initialized.value = true
      void tryAutoCaptureWeather()
    }
  },
  { immediate: true }
)

// A truthy save result while offline means the composable just queued the
// mutation for later (useOptimisticAction's offline path) — worth telling
// the user apart from an actual round trip, same distinction NoteEditor
// already makes for notes.
function resolveSavedStatus(): SaveStatus {
  if (hasChanges.value) return 'unsaved'
  return props.isOnline === false ? 'offline-pending' : 'saved'
}

// ── Save logic ─────────────────────────────────────────────────────────────────
async function doSave() {
  if (isContentEmpty.value || !hasChanges.value || needsEncryptionUnlock.value) return

  // Snapshot what's actually being sent — the save is asynchronous (the
  // composable's optimistic apply happens immediately, but doSave only
  // resolves once the real request settles), during which the user can keep
  // typing. If we marked "saved" using the *live* content/mood after the
  // await, those newer keystrokes would be flagged as already-saved even
  // though the server never got them — the next poll would see no diff and
  // never retry, silently losing that text. Comparing against this snapshot
  // on completion keeps them correctly marked unsaved so the next poll
  // cycle picks them up.
  const savingContent = content.value
  const savingMood = mood.value

  try {
    // Anexa o clima capturado enquanto a entrada de hoje ainda não existia
    // (ver tryAutoCaptureWeather) neste primeiro save real.
    const weatherFields = pendingWeatherSnapshot ?? {}

    const payload: UpsertEntryPayload = encryptionEnabled.value
      ? { entryDate: today, mood: savingMood, ...(await encryptEntryFields(null, savingContent)), ...weatherFields }
      : { entryDate: today, title: null, content: savingContent, mood: savingMood, ...weatherFields }

    const result = await props.onUpsertEntry(payload, { silent: true })
    if (result) {
      if (savedContent.value !== savingContent) savedContent.value = savingContent
      if (savedMood.value !== savingMood) savedMood.value = savingMood
      if (content.value === savingContent && mood.value === savingMood) lastChangeAt.value = 0
      if (pendingWeatherSnapshot) {
        weatherTempC.value = result.weatherTempC
        weatherCode.value = result.weatherCode
        pendingWeatherSnapshot = null
      }
      saveStatus.value = resolveSavedStatus()
      savedAt.value = new Date()
    } else {
      saveStatus.value = 'error'
    }
  } catch {
    saveStatus.value = 'error'
  }
}

// ── Polling-based auto-save ────────────────────────────────────────────────────
// Polling avoids the "debounce resets on every keystroke" problem.
// Checks every 10s — saves when there are changes older than 60s.
const SAVE_AFTER_MS = 60_000
const POLL_INTERVAL_MS = 10_000

let pollTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  pollTimer = setInterval(() => {
    if (!hasChanges.value || isContentEmpty.value || lastChangeAt.value === 0) return
    if (Date.now() - lastChangeAt.value < SAVE_AFTER_MS) return
    doSave()
  }, POLL_INTERVAL_MS)
})

onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  if (suppressTimer) {
    clearTimeout(suppressTimer)
    suppressTimer = null
  }
  // Best-effort immediate save on unmount
  if (saveStatus.value === 'unsaved') doSave()
})

// ── Watch for user changes ─────────────────────────────────────────────────────
watch(content, (val) => {
  if (val === savedContent.value) return
  if (suppressNextContentChange.value) {
    disarmContentSuppression()
    savedContent.value = val
    return
  }
  if (isContentEmpty.value) {
    saveStatus.value = 'idle'
    lastChangeAt.value = 0
    return
  }
  lastChangeAt.value = Date.now()
  saveStatus.value = 'unsaved'
})

watch(mood, (val) => {
  if (val === savedMood.value) return
  if (!isContentEmpty.value) {
    lastChangeAt.value = Date.now()
    saveStatus.value = 'unsaved'
  }
})

// ── Helpers ────────────────────────────────────────────────────────────────────
// pt-BR gives this back fully lowercase ("sábado, 22 de agosto de 2026") — a
// CSS `capitalize` class would title-case every word ("De Agosto De 2026"),
// so this only uppercases the leading letter instead.
function formatToday(): string {
  const raw = formatDisplay(new Date(today + 'T12:00:00'), "EEEE, dd 'de' MMMM 'de' yyyy")
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

// ── Entry prompts ──────────────────────────────────────────────────────────────
// A blank page is the #1 thing that keeps people from journaling — these are
// just a starting nudge, shown only while there's nothing written yet.
// A pool larger than what's shown at once (see PROMPTS_VISIBLE below) keeps
// the row from feeling repetitive across days.
const ENTRY_PROMPT_POOL = [
  { label: 'Gratidão', icon: 'i-lucide-heart', prompt: 'Três coisas pelas quais eu sou grato hoje...' },
  { label: 'Reflexão do dia', icon: 'i-lucide-sparkles', prompt: 'Como foi o meu dia? O que mais me marcou?' },
  { label: 'Revisão da semana', icon: 'i-lucide-calendar-range', prompt: 'O que funcionou bem essa semana? O que eu quero mudar?' },
  { label: 'Foco de amanhã', icon: 'i-lucide-target', prompt: 'O que eu quero priorizar amanhã?' },
  { label: 'Desabafo', icon: 'i-lucide-cloud-rain', prompt: 'O que está pesando na minha cabeça agora?' },
  { label: 'Conquista', icon: 'i-lucide-trophy', prompt: 'Do que eu me orgulho de ter feito hoje?' },
  { label: 'Aprendizado', icon: 'i-lucide-lightbulb', prompt: 'O que eu aprendi hoje, sobre mim ou sobre o mundo?' },
  { label: 'Pessoas', icon: 'i-lucide-users', prompt: 'Quem fez diferença no meu dia, e por quê?' },
  { label: 'Energia', icon: 'i-lucide-battery', prompt: 'O que me deu energia hoje? O que me esgotou?' },
  { label: 'Carta ao futuro', icon: 'i-lucide-mail', prompt: 'O que eu quero lembrar desse momento daqui a um ano?' }
]
const PROMPTS_VISIBLE = 4

// Deterministic PRNG (mulberry32) seeded from a string — same seed always
// produces the same shuffle order, so reloading the page mid-day keeps
// showing the same 4 prompts instead of reshuffling on every render, while
// a new seed (new day, or the "Outras ideias" button) picks a new set.
function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0
  }
  let state = h >>> 0
  function rand() {
    state = (state + 0x6D2B79F5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

// Seeded by the date, so the visible set changes daily but stays stable
// across reloads on the same day; "Outras ideias" reseeds on demand.
const promptSeed = ref(today)
const visiblePrompts = computed(() => seededShuffle(ENTRY_PROMPT_POOL, promptSeed.value).slice(0, PROMPTS_VISIBLE))

function reshufflePrompts() {
  promptSeed.value = `${today}-${Date.now()}`
}

function applyPrompt(prompt: string) {
  content.value = serializeEditorContent({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: prompt }] },
      { type: 'paragraph' }
    ]
  })
}

// ─── Exportar ────────────────────────────────────────────────────────────────
const editorRef = ref<{ $el: HTMLElement } | null>(null)

function exportMarkdown() {
  const md = tiptapJsonToMarkdown(content.value)
  downloadTextFile(`diario-${today}.md`, `# ${formatToday()}\n\n${md}\n`)
}

function exportPdf() {
  const html = editorRef.value?.$el?.querySelector('.ProseMirror')?.innerHTML ?? ''
  printHtmlAsPdf(formatToday(), html)
}

const exportMenuItems = computed(() => [
  { label: 'Markdown (.md)', icon: 'i-lucide-file-text', onSelect: exportMarkdown },
  { label: 'PDF (imprimir)', icon: 'i-lucide-printer', onSelect: exportPdf }
])

defineExpose({ isUnsaved: () => hasChanges.value, doSave })
</script>

<template>
  <div class="space-y-5">
    <!-- Loading skeleton — only on initial load, not on background saves -->
    <motion.div
      v-if="!initialized"
      class="space-y-5"
      :initial="{ opacity: 0 }"
      :animate="{ opacity: 1 }"
      :exit="{ opacity: 0 }"
      :transition="{ duration: 0.18 }"
    >
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <div class="space-y-2">
          <USkeleton class="h-6 w-56" />
          <USkeleton class="h-4 w-72 max-w-full" />
        </div>
        <div class="flex items-center gap-2">
          <USkeleton class="size-9 rounded-full" />
          <USkeleton class="size-9 rounded-full" />
          <USkeleton class="size-9 rounded-full" />
          <USkeleton class="size-9 rounded-full" />
          <USkeleton class="size-9 rounded-full" />
        </div>
      </div>
      <USkeleton class="h-[max(16rem,calc(100dvh-14rem))] w-full rounded-lg" />
    </motion.div>

    <template v-else>
      <!-- Header: date + mood selector — stacked on mobile (the mood
           selector's five 48px touch targets squeeze the date column down
           to almost nothing side-by-side on a phone, wrapping the date
           across 2-3 lines), side-by-side from lg up. -->
      <motion.div
        class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
        :initial="{ opacity: 0, y: 8 }"
        :animate="{ opacity: 1, y: 0 }"
        :transition="{ duration: 0.18 }"
      >
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-base font-semibold leading-snug text-highlighted sm:text-lg">
              {{ formatToday() }}
            </h3>
            <UBadge
              v-if="streak && streak > 0"
              color="warning"
              variant="subtle"
              size="sm"
              class="shrink-0 gap-1"
            >
              🔥 {{ streak }} {{ streak === 1 ? 'dia' : 'dias' }}
            </UBadge>
          </div>
          <div class="mt-1 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
            <p class="text-sm text-muted">
              Seu diário de bordo de hoje.
            </p>
            <!-- Auto-save status -->
            <div class="flex items-center gap-1 text-xs shrink-0">
              <template v-if="saveStatus === 'unsaved'">
                <span class="size-1.5 rounded-full bg-amber-400 dark:bg-amber-500 animate-pulse" />
                <span class="text-muted">Não salvo</span>
              </template>
              <template v-else-if="saveStatus === 'saved'">
                <UIcon name="i-lucide-check-circle" class="size-3 text-success" />
                <span class="text-muted">Salvo às {{ savedAtText }}</span>
              </template>
              <template v-else-if="saveStatus === 'offline-pending'">
                <UIcon name="i-lucide-cloud-off" class="size-3 text-warning" />
                <span class="text-muted">Salvo localmente — sincroniza ao reconectar</span>
              </template>
              <template v-else-if="saveStatus === 'error'">
                <UIcon name="i-lucide-alert-circle" class="size-3 text-error" />
                <button
                  class="text-primary underline underline-offset-2 cursor-pointer"
                  @click="doSave"
                >
                  Tentar novamente
                </button>
              </template>
            </div>
          </div>
        </div>

        <div class="flex shrink-0 flex-wrap items-center gap-2 max-lg:w-full max-lg:justify-between">
          <!-- Clima/geotag — capturado sozinho ao abrir a página (item 17).
               Sem badge nenhum se a pessoa negar a permissão ou o clima não
               estiver disponível — falha em silêncio de propósito, sem
               botão de "tentar de novo" nem qualquer indício na tela. -->
          <UBadge
            v-if="weatherCode !== null && !isLockedForViewing && !needsEncryptionUnlock"
            color="neutral"
            variant="subtle"
            size="sm"
            class="gap-1"
          >
            <UIcon :name="getWeatherInfo(weatherCode).icon" class="size-3.5" />
            {{ weatherTempC !== null ? `${Math.round(weatherTempC)}°C` : getWeatherInfo(weatherCode).label }}
          </UBadge>
          <UDropdownMenu
            v-if="!isContentEmpty && !isLockedForViewing && !needsEncryptionUnlock"
            :items="exportMenuItems"
            :content="{ align: 'end' }"
          >
            <UButton
              icon="i-lucide-download"
              color="neutral"
              variant="ghost"
              :size="isMobile ? 'md' : 'sm'"
            />
          </UDropdownMenu>
          <!-- Per-entry lock toggle — only shown in "entradas específicas" mode,
               and only once already unlocked: showing it while still locked
               would let anyone turn the lock off without ever entering the PIN. -->
          <UButton
            v-if="pinMode === 'entries' && todayEntry && !isLockedForViewing"
            :icon="entryLocked ? 'i-lucide-lock' : 'i-lucide-lock-open'"
            :color="entryLocked ? 'warning' : 'neutral'"
            variant="ghost"
            :size="isMobile ? 'md' : 'sm'"
            :loading="togglingLock"
            :title="entryLocked ? 'Remover proteção desta entrada' : 'Proteger esta entrada com PIN'"
            @click="onToggleLock"
          />
          <!-- Mood selector — hidden while locked (PIN) or not yet
               decrypted (E2EE), same reasoning as the content below. -->
          <JournalMoodSelector v-if="!isLockedForViewing && !needsEncryptionUnlock" v-model="mood" />
        </div>
      </motion.div>

      <!-- Criptografia ligada e ainda não desbloqueada nesta sessão — tem
           prioridade sobre o cadeado do PIN: sem a Data Key não dá nem pra
           saber se a entrada de hoje existe em texto legível. -->
      <motion.div
        v-if="needsEncryptionUnlock"
        :initial="{ opacity: 0, y: 8, scale: 0.99 }"
        :animate="{ opacity: 1, y: 0, scale: 1 }"
        :transition="{ duration: 0.18 }"
      >
        <JournalEncryptionUnlockScreen compact />
      </motion.div>

      <!-- Locked entry (mode "entradas específicas") — hides mood/prompts/editor until the PIN is entered -->
      <motion.div
        v-else-if="isLockedForViewing"
        :initial="{ opacity: 0, y: 8, scale: 0.99 }"
        :animate="{ opacity: 1, y: 0, scale: 1 }"
        :transition="{ duration: 0.18 }"
      >
        <JournalLockScreen
          compact
          :entry-date="today"
        />
      </motion.div>

      <template v-else>
        <!-- Entry prompts — a nudge to get past the blank page, gone once there's content. -->
        <AnimatePresence>
          <ClientOnly v-if="isContentEmpty">
            <motion.div
              class="space-y-1.5"
              :initial="{ opacity: 0, y: 8, scale: 0.99 }"
              :animate="{ opacity: 1, y: 0, scale: 1 }"
              :exit="{ opacity: 0, y: -6, scale: 0.99 }"
              :transition="{ duration: 0.18 }"
            >
              <div class="flex items-center justify-between gap-2">
                <span class="text-xs text-dimmed">Não sabe por onde começar?</span>
                <UButton
                  label="Outras ideias"
                  icon="i-lucide-shuffle"
                  :size="isMobile ? 'sm' : 'xs'"
                  color="neutral"
                  variant="ghost"
                  class="shrink-0 -my-1"
                  @click="reshufflePrompts"
                />
              </div>
              <!-- Ragged flex-wrap left each row a different length on a phone
               (one button alone, then two, then one) — a single horizontally
               scrollable row reads cleaner there. From lg up there's enough
               width that wrapping looks fine, so it switches back. -->
              <div class="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 lg:flex-wrap lg:overflow-visible lg:pb-0 lg:mx-0 lg:px-0">
                <UButton
                  v-for="p in visiblePrompts"
                  :key="p.label"
                  :label="p.label"
                  :icon="p.icon"
                  :size="isMobile ? 'md' : 'xs'"
                  color="neutral"
                  variant="outline"
                  class="shrink-0 rounded-full"
                  @click="applyPrompt(p.prompt)"
                />
              </div>
            </motion.div>
            <template #fallback>
              <USkeleton class="h-7 w-full max-w-sm" />
            </template>
          </ClientOnly>
        </AnimatePresence>

        <!-- Notion editor -->
        <motion.div
          :initial="{ opacity: 0, y: 10 }"
          :animate="{ opacity: 1, y: 0 }"
          :transition="{ duration: 0.2, delay: 0.04 }"
        >
          <ClientOnly>
            <NotionEditor
              ref="editorRef"
              :key="today"
              v-model="content"
              placeholder="Escreva livremente sobre o seu dia... use '/' para inserir blocos."
              min-height="max(14rem, calc(100dvh - 14rem))"
            />
            <template #fallback>
              <USkeleton class="h-56 w-full rounded-lg" />
            </template>
          </ClientOnly>
        </motion.div>
      </template>
    </template>
  </div>
</template>
