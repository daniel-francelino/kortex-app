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
    mood?: number | null
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

// Last successfully saved content — prevents triggering auto-save on initial load
const savedContent = ref('')

// ── Auto-save state ────────────────────────────────────────────────────────────
type SaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error'
const saveStatus = ref<SaveStatus>('idle')
const savedAt = ref<Date | null>(null)
let autoSaveTimer: ReturnType<typeof setTimeout> | null = null

const savedAtText = computed(() =>
  savedAt.value?.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) ?? ''
)

// Sync entry data when it loads; mark it as already saved
watch(() => props.todayEntry, (entry) => {
  if (entry) {
    const c = entry.content ?? ''
    content.value = c
    savedContent.value = c
    mood.value = entry.mood ?? null
    entryTags.value = (entry.tags ?? []).map(t => t.name)
  } else {
    content.value = ''
    savedContent.value = ''
    mood.value = null
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

// ── Save logic ─────────────────────────────────────────────────────────────────
async function doSave() {
  if (isContentEmpty.value) {
    saveStatus.value = 'idle'
    return
  }
  saveStatus.value = 'saving'
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
  autoSaveTimer = setTimeout(doSave, 1500)
}

// Watch content — only trigger auto-save when content actually changed from last save
watch(content, (val) => {
  if (val === savedContent.value) return
  if (isContentEmpty.value) {
    saveStatus.value = 'idle'
    clearTimer()
    return
  }
  saveStatus.value = 'unsaved'
  scheduleAutoSave()
})

// Mood or tag changes also trigger auto-save (when there's content)
watch(mood, () => {
  if (isContentEmpty.value) return
  saveStatus.value = 'unsaved'
  scheduleAutoSave()
})

watch(entryTags, () => {
  if (isContentEmpty.value) return
  saveStatus.value = 'unsaved'
  scheduleAutoSave()
}, { deep: true })

onBeforeUnmount(() => clearTimer())

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
  <div class="space-y-6">
    <!-- Loading skeleton -->
    <template v-if="props.loading">
      <USkeleton class="h-6 w-48" />
      <USkeleton class="h-64 w-full" />
      <USkeleton class="h-32 w-full" />
    </template>

    <template v-else>
      <!-- Header: date + auto-save indicator -->
      <div class="flex items-center justify-between gap-4">
        <div>
          <h3 class="text-lg font-semibold text-highlighted capitalize">
            {{ formatToday() }}
          </h3>
          <p class="text-sm text-muted">
            Seu diário de bordo de hoje.
          </p>
        </div>

        <!-- Auto-save status indicator -->
        <div class="flex items-center gap-1.5 text-xs shrink-0">
          <template v-if="saveStatus === 'unsaved'">
            <span class="size-1.5 rounded-full bg-amber-400 dark:bg-amber-500 animate-pulse" />
            <span class="text-muted">Não salvo</span>
          </template>
          <template v-else-if="saveStatus === 'saving'">
            <UIcon name="i-lucide-loader" class="size-3 text-muted animate-spin" />
            <span class="text-muted">Salvando...</span>
          </template>
          <template v-else-if="saveStatus === 'saved'">
            <UIcon name="i-lucide-check-circle" class="size-3 text-success" />
            <span class="text-muted">Salvo às {{ savedAtText }}</span>
          </template>
          <template v-else-if="saveStatus === 'error'">
            <UIcon name="i-lucide-alert-circle" class="size-3 text-error" />
            <span class="text-error">Erro ao salvar —</span>
            <button
              class="text-primary underline underline-offset-2 cursor-pointer"
              @click="doSave"
            >
              Tentar novamente
            </button>
          </template>
        </div>
      </div>

      <!-- Mood selector -->
      <JournalMoodSelector v-model="mood" />

      <!-- Notion-like editor — key is stable per day so editor is NOT recreated on save -->
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
      </div>
    </template>
  </div>
</template>
