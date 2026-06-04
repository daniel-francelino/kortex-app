<script setup lang="ts">
import type { JournalEntry } from '~/types/journal'

const props = defineProps<{
  todayEntry: JournalEntry | null
  loading: boolean
  onUpsertEntry: (payload: {
    entryDate: string
    title?: string | null
    content: string
    mood?: string | null
  }, options?: { silent?: boolean }) => Promise<JournalEntry | null>
}>()

const today = new Date().toISOString().split('T')[0] ?? ''
const content = ref('')
const mood = ref<string | null>(null)

// Last saved snapshot — what the server currently has
const savedContent = ref('')
const savedMood = ref<string | null>(null)

// Timestamp of the last user-initiated change (0 = no pending change)
const lastChangeAt = ref(0)

// ── Auto-save state ────────────────────────────────────────────────────────────
type SaveStatus = 'idle' | 'unsaved' | 'saved' | 'error'
const saveStatus = ref<SaveStatus>('idle')
const savedAt = ref<Date | null>(null)

// Once the entry has loaded at least once, never show the skeleton again —
// background saves must not interrupt the editor.
const initialized = ref(false)

const savedAtText = computed(() =>
  savedAt.value?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) ?? ''
)

// ── Sync entry from props ──────────────────────────────────────────────────────
watch(() => props.todayEntry, (entry) => {
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
    initialized.value = true
  } else if (!props.loading) {
    // Only reset when truly no entry and not mid-fetch
    content.value = ''
    savedContent.value = ''
    mood.value = null
    savedMood.value = null
    lastChangeAt.value = 0
    saveStatus.value = 'idle'
    initialized.value = true
  }
}, { immediate: true })

// ── Empty content check ────────────────────────────────────────────────────────
const isContentEmpty = computed(() => {
  const val = content.value
  if (!val) return true
  try {
    const doc = JSON.parse(val)
    function hasText(n: { type: string; text?: string; content?: unknown[] }): boolean {
      if (n.type === 'text' && n.text?.trim()) return true
      return (n.content ?? []).some(c => hasText(c as typeof n))
    }
    return !(doc.content ?? []).some((n: { type: string; text?: string; content?: unknown[] }) => hasText(n))
  } catch {
    return !val.trim()
  }
})

// True when editor has unsaved changes
const hasChanges = computed(() =>
  content.value !== savedContent.value || mood.value !== savedMood.value
)

// ── Save logic ─────────────────────────────────────────────────────────────────
async function doSave() {
  if (isContentEmpty.value || !hasChanges.value) return
  try {
    const result = await props.onUpsertEntry({
      entryDate: today,
      title: null,
      content: content.value,
      mood: mood.value
    }, { silent: true })
    if (result) {
      savedContent.value = content.value
      savedMood.value = mood.value
      lastChangeAt.value = 0
      saveStatus.value = 'saved'
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
  // Best-effort immediate save on unmount
  if (saveStatus.value === 'unsaved') doSave()
})

// ── Watch for user changes ─────────────────────────────────────────────────────
watch(content, (val) => {
  if (val === savedContent.value) return
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
function formatToday(): string {
  return new Date(today + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })
}
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
      <!-- Header: date + auto-save indicator -->
      <div class="flex items-start justify-between gap-4">
        <div>
          <h3 class="text-lg font-semibold text-highlighted capitalize">
            {{ formatToday() }}
          </h3>
          <p class="text-sm text-muted">
            Seu diário de bordo de hoje.
          </p>
        </div>

        <!-- Auto-save status — no spinner, save is invisible to user -->
        <div class="flex items-center gap-1.5 text-xs shrink-0 pt-0.5">
          <template v-if="saveStatus === 'unsaved'">
            <span class="size-1.5 rounded-full bg-amber-400 dark:bg-amber-500 animate-pulse" />
            <span class="text-muted">Não salvo</span>
          </template>
          <template v-else-if="saveStatus === 'saved'">
            <UIcon name="i-lucide-check-circle" class="size-3 text-success" />
            <span class="text-muted">Salvo às {{ savedAtText }}</span>
          </template>
          <template v-else-if="saveStatus === 'error'">
            <UIcon name="i-lucide-alert-circle" class="size-3 text-error" />
            <span class="text-error">Erro —</span>
            <button
              class="text-primary underline underline-offset-2 cursor-pointer"
              @click="doSave"
            >
              Tentar novamente
            </button>
          </template>
        </div>
      </div>

      <!-- Mood selector — right-aligned -->
      <div class="flex justify-end">
        <JournalMoodSelector v-model="mood" />
      </div>

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
