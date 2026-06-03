<script setup lang="ts">
import type { JournalEntry, MetricDefinition, MetricValueWithDefinition } from '~/types/journal'

const props = defineProps<{
  todayEntry: JournalEntry | null
  todayMetrics: MetricValueWithDefinition[]
  metricDefinitions: MetricDefinition[]
  loading: boolean
  onUpsertEntry: (payload: {
    entryDate: string
    title?: string | null
    content: string
    mood?: string | null
    tags?: string[]
  }, options?: { silent?: boolean }) => Promise<JournalEntry | null>
  onUpsertMetricValues: (payload: {
    entryDate: string
    values: Array<{
      metricKey: string
      numberValue: number | null
      booleanValue: boolean | null
      textValue: string | null
      selectValue: string | null
    }>
  }) => Promise<boolean>
}>()

const emit = defineEmits<{
  saved: []
  metricsSaved: []
}>()

const today = new Date().toISOString().split('T')[0] ?? ''
const content = ref('')
const mood = ref<string | null>(null)
const tagInput = ref('')
const entryTags = ref<string[]>([])

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
    entryTags.value = (entry.tags ?? []).map(t => t.name)
  } else {
    content.value = ''
    savedContent.value = ''
    mood.value = null
    savedMood.value = null
    entryTags.value = []
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
      mood: mood.value,
      tags: entryTags.value.length > 0 ? entryTags.value : undefined
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

// Schedule a save 60 s after the last change — resets on every new change
function scheduleAutoSave() {
  clearTimer()
  autoSaveTimer = setTimeout(doSave, 60_000)
}

function markUnsaved() {
  if (!hasChanges.value || isContentEmpty.value) {
    saveStatus.value = isContentEmpty.value ? 'idle' : saveStatus.value
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

watch(entryTags, () => {
  if (isContentEmpty.value) return
  markUnsaved()
}, { deep: true })

// Save immediately on unmount if there are pending unsaved changes
onBeforeUnmount(() => {
  clearTimer()
  if (saveStatus.value === 'unsaved') doSave()
})

// ── Tags ───────────────────────────────────────────────────────────────────────
function addTag() {
  const tag = tagInput.value.trim()
  if (tag && !entryTags.value.includes(tag)) entryTags.value.push(tag)
  tagInput.value = ''
}

function removeTag(tag: string) {
  entryTags.value = entryTags.value.filter(t => t !== tag)
}

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
      <USkeleton class="h-64 w-full" />
      <USkeleton class="h-32 w-full" />
    </template>

    <template v-else>
      <!-- Header: date on left, auto-save indicator on right -->
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

      <!-- Mood selector — right-aligned, no label -->
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
          <USkeleton class="h-56 w-full" />
        </template>
      </ClientOnly>

      <!-- Tags -->
      <div class="space-y-2">
        <label class="text-sm font-medium text-highlighted">Tags</label>
        <div
          v-if="entryTags.length"
          class="flex flex-wrap gap-1.5 mb-2"
        >
          <UBadge
            v-for="tag in entryTags"
            :key="tag"
            :label="tag"
            variant="subtle"
            color="neutral"
          >
            <template #trailing>
              <UButton
                icon="i-lucide-x"
                size="xs"
                color="neutral"
                variant="ghost"
                class="ml-1 -mr-1"
                @click="removeTag(tag)"
              />
            </template>
          </UBadge>
        </div>
        <div class="flex items-center gap-2">
          <UInput
            v-model="tagInput"
            placeholder="Adicionar tag..."
            size="sm"
            class="flex-1"
            @keydown.enter.prevent="addTag"
          />
          <UButton
            icon="i-lucide-plus"
            size="sm"
            :disabled="!tagInput.trim()"
            @click="addTag"
          />
        </div>
      </div>

      <!-- Metrics panel -->
      <JournalMetricsPanel
        :definitions="metricDefinitions"
        :existing-values="todayMetrics"
        :entry-date="today"
        :on-upsert-metric-values="props.onUpsertMetricValues"
        @saved="emit('metricsSaved')"
      />
    </template>
  </div>
</template>
