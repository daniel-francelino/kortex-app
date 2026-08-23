<script setup lang="ts">
import type { JournalEntry } from '~/types/journal'
import { isEditorContentEmpty, serializeEditorContent } from '~/utils/editor/content'

const props = defineProps<{
  todayEntry: JournalEntry | null
  loading: boolean
  streak?: number
  isOnline?: boolean
  onUpsertEntry: (payload: {
    entryDate: string
    title?: string | null
    content: string
    mood?: string | null
  }, options?: { silent?: boolean }) => Promise<JournalEntry | null>
}>()

const isMobile = useIsMobile()

const today = new Date().toISOString().split('T')[0] ?? ''
const content = ref('')
const mood = ref<string | null>(null)

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
  savedAt.value?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) ?? ''
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
  [() => props.todayEntry, () => props.loading],
  ([entry]) => {
    if (hasChanges.value) return

    if (entry) {
      const c = entry.content ?? ''
      if (c !== content.value) {
        content.value = c
      }
      savedContent.value = c

      const m = entry.mood ?? null
      if (m !== mood.value) {
        mood.value = m
      }
      savedMood.value = m
      armContentSuppression()
      initialized.value = true
    } else if (!props.loading) {
      // Only reset when truly no entry and not mid-fetch
      content.value = ''
      savedContent.value = ''
      mood.value = null
      savedMood.value = null
      lastChangeAt.value = 0
      saveStatus.value = 'idle'
      armContentSuppression()
      initialized.value = true
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
  if (isContentEmpty.value || !hasChanges.value) return

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
    const result = await props.onUpsertEntry({
      entryDate: today,
      title: null,
      content: savingContent,
      mood: savingMood
    }, { silent: true })
    if (result) {
      if (savedContent.value !== savingContent) savedContent.value = savingContent
      if (savedMood.value !== savingMood) savedMood.value = savingMood
      if (content.value === savingContent && mood.value === savingMood) lastChangeAt.value = 0
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
  const raw = new Date(today + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

// ── Entry prompts ──────────────────────────────────────────────────────────────
// A blank page is the #1 thing that keeps people from journaling — these are
// just a starting nudge, shown only while there's nothing written yet.
const ENTRY_PROMPTS = [
  { label: 'Gratidão', icon: 'i-lucide-heart', prompt: 'Três coisas pelas quais eu sou grato hoje...' },
  { label: 'Reflexão do dia', icon: 'i-lucide-sparkles', prompt: 'Como foi o meu dia? O que mais me marcou?' },
  { label: 'Revisão da semana', icon: 'i-lucide-calendar-range', prompt: 'O que funcionou bem essa semana? O que eu quero mudar?' },
  { label: 'Foco de amanhã', icon: 'i-lucide-target', prompt: 'O que eu quero priorizar amanhã?' }
]

function applyPrompt(prompt: string) {
  content.value = serializeEditorContent({
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: prompt }] },
      { type: 'paragraph' }
    ]
  })
}

defineExpose({ isUnsaved: () => hasChanges.value, doSave })
</script>

<template>
  <div class="space-y-5">
    <!-- Loading skeleton — only on initial load, not on background saves -->
    <template v-if="!initialized">
      <USkeleton class="h-6 w-48" />
      <USkeleton class="h-8 w-40" />
      <USkeleton class="h-64 w-full rounded-lg" />
    </template>

    <template v-else>
      <!-- Header: date + mood selector — stacked on mobile (the mood
           selector's five 48px touch targets squeeze the date column down
           to almost nothing side-by-side on a phone, wrapping the date
           across 2-3 lines), side-by-side from lg up. -->
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h3 class="text-lg font-semibold text-highlighted">
              {{ formatToday() }}
            </h3>
            <UBadge
              v-if="streak && streak > 0"
              color="warning"
              variant="subtle"
              size="sm"
              class="gap-1"
            >
              🔥 {{ streak }} {{ streak === 1 ? 'dia' : 'dias' }}
            </UBadge>
          </div>
          <div class="flex items-center gap-2 mt-0.5">
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

        <!-- Mood selector -->
        <div class="shrink-0">
          <JournalMoodSelector v-model="mood" />
        </div>
      </div>

      <!-- Entry prompts — a nudge to get past the blank page, gone once there's content. -->
      <ClientOnly v-if="isContentEmpty">
        <!-- Ragged flex-wrap left each row a different length on a phone
             (one button alone, then two, then one) — a single horizontally
             scrollable row reads cleaner there. From lg up there's enough
             width that wrapping looks fine, so it switches back. -->
        <div class="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 lg:flex-wrap lg:overflow-visible lg:pb-0 lg:mx-0 lg:px-0">
          <span class="shrink-0 text-xs text-dimmed">Não sabe por onde começar?</span>
          <UButton
            v-for="p in ENTRY_PROMPTS"
            :key="p.label"
            :label="p.label"
            :icon="p.icon"
            :size="isMobile ? 'md' : 'xs'"
            color="neutral"
            variant="outline"
            class="shrink-0"
            @click="applyPrompt(p.prompt)"
          />
        </div>
        <template #fallback>
          <USkeleton class="h-7 w-full max-w-sm" />
        </template>
      </ClientOnly>

      <!-- Notion editor -->
      <ClientOnly>
        <NotionEditor
          :key="today"
          v-model="content"
          placeholder="Escreva livremente sobre o seu dia... use '/' para inserir blocos."
          :min-height="'14rem'"
        />
        <template #fallback>
          <USkeleton class="h-56 w-full rounded-lg" />
        </template>
      </ClientOnly>
    </template>
  </div>
</template>
