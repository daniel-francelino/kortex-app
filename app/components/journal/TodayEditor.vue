<script setup lang="ts">
import type { JournalEntry, MetricValueWithDefinition } from '~/types/journal'
import { isEditorContentEmpty } from '~/utils/editor/content'

const props = defineProps<{
  todayEntry: JournalEntry | null
  metrics?: MetricValueWithDefinition[]
  loading: boolean
  streak?: number
  onUpsertEntry: (payload: {
    entryDate: string
    title?: string | null
    content: string
    mood?: string | null
    tags?: string[]
  }, options?: { silent?: boolean }) => Promise<JournalEntry | null>
}>()

const {
  tags: availableTags,
  refreshTags,
  metricDefinitions,
  refreshMetricDefinitions,
  createMetricDefinition,
  upsertMetricValues,
  metricTypeOptions
} = useJournal()

const isMobile = useIsMobile()

onMounted(() => {
  refreshTags()
  refreshMetricDefinitions()
})

const today = new Date().toISOString().split('T')[0] ?? ''
const content = ref('')
const mood = ref<string | null>(null)
const entryTags = ref<string[]>([])
const metricCreateOpen = ref(false)

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
watch(
  [() => props.todayEntry, () => props.loading],
  ([entry]) => {
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
      entryTags.value = (entry.tags ?? []).map(t => t.name)
      initialized.value = true
    } else if (!props.loading) {
      // Only reset when truly no entry and not mid-fetch
      content.value = ''
      savedContent.value = ''
      mood.value = null
      savedMood.value = null
      entryTags.value = []
      lastChangeAt.value = 0
      saveStatus.value = 'idle'
      initialized.value = true
    }
  },
  { immediate: true }
)

// ── Empty content check ────────────────────────────────────────────────────────
const isContentEmpty = computed(() => isEditorContentEmpty(content.value))

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
      mood: mood.value,
      tags: entryTags.value
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

// ── Tags ───────────────────────────────────────────────────────────────────────
// Tag edits are an explicit action, so they save immediately (content must
// already exist — the entry schema requires non-empty content).
const savingTags = ref(false)

async function onTagsUpdate(newTags: string[]) {
  entryTags.value = newTags
  if (isContentEmpty.value) return
  savingTags.value = true
  try {
    const result = await props.onUpsertEntry({
      entryDate: today,
      title: null,
      content: content.value,
      mood: mood.value,
      tags: newTags
    })
    if (result) {
      savedContent.value = content.value
      savedMood.value = mood.value
      lastChangeAt.value = 0
      saveStatus.value = 'saved'
      savedAt.value = new Date()
    }
  } finally {
    savingTags.value = false
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
      <!-- Header: date + mood selector na mesma linha -->
      <div class="flex items-center justify-between gap-4">
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h3 class="text-lg font-semibold text-highlighted capitalize">
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

      <!-- Tags -->
      <div class="rounded-lg border border-default p-3">
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-sm font-medium text-highlighted">
            Tags
          </h4>
          <UIcon
            v-if="savingTags"
            name="i-lucide-loader-2"
            class="size-3.5 animate-spin text-muted"
          />
        </div>
        <p
          v-if="isContentEmpty"
          class="text-xs text-dimmed"
        >
          Escreva algo antes de adicionar tags.
        </p>
        <!-- JournalTagEditor picks its button/input sizes from the viewport
             width (bigger on mobile, compact on desktop) — client-only info
             that doesn't exist during SSR. Rendering it there would bake in
             the desktop size, and Vue's hydration intentionally never
             corrects a mismatched class afterwards, so it'd stay wrong on
             mobile until the user resizes the window. ClientOnly sidesteps
             that entirely by skipping the SSR pass for it. -->
        <ClientOnly v-else>
          <JournalTagEditor
            :model-value="entryTags"
            :available-tags="availableTags ?? []"
            @update:model-value="onTagsUpdate"
          />
          <template #fallback>
            <USkeleton class="h-8 w-40" />
          </template>
        </ClientOnly>
      </div>

      <!-- Metrics -->
      <UCollapsible>
        <UButton
          label="Métricas do dia"
          icon="i-lucide-gauge"
          color="neutral"
          variant="outline"
          trailing-icon="i-lucide-chevron-down"
          block
        />

        <template #content>
          <div class="mt-3 space-y-3 rounded-lg border border-default p-3">
            <div class="flex justify-end">
              <UButton
                label="Nova métrica"
                icon="i-lucide-plus"
                :size="isMobile ? 'md' : 'xs'"
                color="neutral"
                variant="ghost"
                @click="metricCreateOpen = true"
              />
            </div>
            <JournalMetricsPanel
              :definitions="metricDefinitions ?? []"
              :existing-values="metrics ?? []"
              :entry-date="today"
              :on-upsert-metric-values="upsertMetricValues"
            />
          </div>
        </template>
      </UCollapsible>
    </template>
  </div>

  <JournalMetricCreateModal
    :open="metricCreateOpen"
    :metric-type-options="metricTypeOptions"
    :on-create-metric-definition="createMetricDefinition"
    @update:open="metricCreateOpen = $event"
  />
</template>
