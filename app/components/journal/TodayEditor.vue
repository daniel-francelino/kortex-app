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

const emit = defineEmits<{
  saved: []
}>()

const today = new Date().toISOString().split('T')[0] ?? ''
const content = ref('')
const mood = ref<string | null>(null)

// Last successfully saved snapshot — used to detect real changes
const savedContent = ref('')
const savedMood = ref<string | null>(null)

// ── Auto-save state ────────────────────────────────────────────────────────────
// 'saving' is intentionally absent — save happens silently, user keeps editing
type SaveStatus = 'idle' | 'unsaved' | 'saved' | 'error'
const saveStatus = ref<SaveStatus>('idle')
const savedAt = ref<Date | null>(null)
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

const savedAtText = computed(() =>
  savedAt.value?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) ?? ''
)

// Sync entry on load — mark it as already saved so watchers don't trigger
watch(() => props.todayEntry, (entry) => {
  if (entry) {
    const c = entry.content ?? ''
    content.value = c
    savedContent.value = c
    mood.value = entry.mood ?? null
    savedMood.value = entry.mood ?? null
  } else {
    content.value = ''
    savedContent.value = ''
    mood.value = null
    savedMood.value = null
    saveStatus.value = 'idle'
  }
}, { immediate: true })

// ── Empty content check ────────────────────────────────────────────────────────
const isContentEmpty = computed(() => {
  const val = content.value
  if (!val) return true
  try {
    const doc = JSON.parse(val)
    function nodeHasText(n: { type: string; text?: string; content?: unknown[] }): boolean {
      if (n.type === 'text' && n.text?.trim()) return true
      return (n.content ?? []).some(c => nodeHasText(c as typeof n))
    }
    return !(doc.content ?? []).some((n: { type: string; text?: string; content?: unknown[] }) => nodeHasText(n))
  } catch {
    return !val.trim()
  }
})

// True when current state differs from last save
const hasChanges = computed(() =>
  content.value !== savedContent.value || mood.value !== savedMood.value
)

// ── Save logic — runs silently, user is never blocked ──────────────────────────
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
      saveStatus.value = 'saved'
      savedAt.value = new Date()
      emit('saved')
    } else {
      saveStatus.value = 'error'
    }
  } catch {
    saveStatus.value = 'error'
  }
}

function clearTimer() {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = null
}

function scheduleAutoSave() {
  clearTimer()
  autoSaveTimer = setTimeout(doSave, 60_000)
}

function markUnsaved() {
  if (!hasChanges.value || isContentEmpty.value) {
    if (isContentEmpty.value) saveStatus.value = 'idle'
    clearTimer()
    return
  }
  saveStatus.value = 'unsaved'
  scheduleAutoSave()
}

watch(content, (val) => {
  if (val === savedContent.value) return
  if (isContentEmpty.value) {
    saveStatus.value = 'idle'
    clearTimer()
    return
  }
  markUnsaved()
})

watch(mood, (val) => {
  if (val === savedMood.value) return
  markUnsaved()
})

onBeforeUnmount(() => {
  clearTimer()
  if (saveStatus.value === 'unsaved') doSave()
})

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
    <!-- Loading skeleton -->
    <template v-if="props.loading">
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

        <!-- Auto-save status — minimal, no spinner -->
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
