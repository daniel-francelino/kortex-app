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
    tags?: string[]
  }) => Promise<JournalEntry | null>
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

const title = ref(props.todayEntry?.title ?? '')
const content = ref(props.todayEntry?.content ?? '')
const tagInput = ref('')
const entryTags = ref<string[]>([])

watch(() => props.todayEntry, (entry) => {
  if (entry) {
    title.value = entry.title ?? ''
    content.value = entry.content ?? ''
    entryTags.value = (entry.tags ?? []).map(t => t.name)
  } else {
    title.value = ''
    content.value = ''
    entryTags.value = []
  }
}, { immediate: true })

function addTag() {
  const tag = tagInput.value.trim()
  if (tag && !entryTags.value.includes(tag)) {
    entryTags.value.push(tag)
  }
  tagInput.value = ''
}

function removeTag(tag: string) {
  entryTags.value = entryTags.value.filter(t => t !== tag)
}

const saving = ref(false)

// Check if Tiptap JSON document has actual text content
const isContentEmpty = computed(() => {
  const val = content.value
  if (!val) return true
  try {
    const doc = JSON.parse(val)
    function nodeHasText(node: { type: string; text?: string; content?: unknown[] }): boolean {
      if (node.type === 'text' && node.text?.trim()) return true
      return (node.content ?? []).some(n => nodeHasText(n as typeof node))
    }
    return !(doc.content ?? []).some((n: { type: string; text?: string; content?: unknown[] }) => nodeHasText(n))
  } catch {
    return !val.trim()
  }
})

async function onSave() {
  if (isContentEmpty.value) return
  if (saving.value) return
  saving.value = true
  try {
    const result = await props.onUpsertEntry({
      entryDate: today,
      title: title.value || null,
      content: content.value,
      tags: entryTags.value.length > 0 ? entryTags.value : undefined
    })
    if (result) {
      emit('saved')
    }
  } finally {
    saving.value = false
  }
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
      <USkeleton class="h-10 w-full" />
      <USkeleton class="h-40 w-full" />
      <USkeleton class="h-32 w-full" />
    </template>

    <template v-else>
      <!-- Date header -->
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-lg font-semibold text-highlighted capitalize">
            {{ formatToday() }}
          </h3>
          <p class="text-sm text-muted">
            Seu diário de bordo de hoje.
          </p>
        </div>
        <UButton
          label="Salvar"
          icon="i-lucide-save"
          :loading="saving"
          :disabled="saving || isContentEmpty"
          @click="onSave"
        />
      </div>

      <!-- Title -->
      <UInput
        v-model="title"
        placeholder="Título da entrada (opcional)"
        size="lg"
      />

      <!-- Notion-like editor — key is stable per day so editor is NOT recreated on save -->
      <ClientOnly>
        <NotionEditor
          :key="today"
          v-model="content"
          placeholder="Escreva livremente sobre o seu dia... use '/' para inserir blocos."
        />
        <template #fallback>
          <USkeleton class="h-40 w-full" />
        </template>
      </ClientOnly>

      <!-- Tags -->
      <div class="space-y-2">
        <label class="text-sm font-medium text-highlighted">Tags</label>
        <div class="flex flex-wrap gap-1 mb-2">
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
                class="ml-1"
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
