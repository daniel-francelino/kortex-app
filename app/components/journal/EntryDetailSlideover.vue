<script setup lang="ts">
import type { JournalEntry } from '~/types/journal'

const props = defineProps<{
  open: boolean
  date: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'updated': []
}>()

const { fetchEntryByDate, upsertEntry } = useJournal()

const loading = ref(false)
const entry = ref<JournalEntry | null>(null)
const entryTags = ref<string[]>([])

const content = ref('')
const editing = ref(false)
const saving = ref(false)

watch(() => props.open, async (isOpen) => {
  if (isOpen && props.date) await loadEntry()
}, { immediate: true })

watch(() => props.date, async () => {
  if (props.open && props.date) {
    editing.value = false
    await loadEntry()
  }
})

async function loadEntry() {
  loading.value = true
  try {
    const data = await fetchEntryByDate(props.date)
    if (data) {
      entry.value = data.entry
      entryTags.value = (data.tags ?? []).map((t: unknown) => (t as { name: string }).name)
      content.value = data.entry?.content ?? ''
    }
  } finally {
    loading.value = false
  }
}

function isContentEmpty(val: string): boolean {
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
}

async function onSave() {
  if (isContentEmpty(content.value) || saving.value) return
  saving.value = true
  try {
    const result = await upsertEntry({
      entryDate: props.date,
      title: null,
      content: content.value,
      tags: entryTags.value.length > 0 ? entryTags.value : undefined
    })
    if (result) {
      editing.value = false
      await loadEntry()
      emit('updated')
    }
  } finally {
    saving.value = false
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })
}
</script>

<template>
  <USlideover
    :open="props.open"
    :title="formatDate(props.date)"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <!-- Loading -->
      <div
        v-if="loading"
        class="space-y-4"
      >
        <USkeleton class="h-4 w-full" />
        <USkeleton class="h-4 w-5/6" />
        <USkeleton class="h-4 w-4/5" />
        <USkeleton class="h-40 w-full" />
      </div>

      <div
        v-else
        class="space-y-5"
      >
        <!-- No entry yet -->
        <div
          v-if="!entry && !editing"
          class="flex flex-col items-center justify-center py-8 gap-3"
        >
          <UIcon
            name="i-lucide-book-open"
            class="size-12 text-dimmed"
          />
          <p class="text-sm text-muted">
            Nenhuma entrada para este dia.
          </p>
          <UButton
            label="Criar entrada"
            icon="i-lucide-plus"
            @click="editing = true"
          />
        </div>

        <!-- View mode -->
        <template v-if="entry && !editing">
          <!-- Edit action -->
          <div class="flex justify-end">
            <UButton
              icon="i-lucide-pencil"
              label="Editar"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="editing = true"
            />
          </div>

          <!-- Rich content (read-only) -->
          <ClientOnly>
            <NotionEditor
              :key="props.date + '-view'"
              :model-value="entry.content ?? ''"
              :editable="false"
            />
            <template #fallback>
              <USkeleton class="h-32 w-full" />
            </template>
          </ClientOnly>

          <!-- Tags -->
          <div
            v-if="entry.tags && entry.tags.length > 0"
            class="flex flex-wrap gap-1.5"
          >
            <UBadge
              v-for="tag in entry.tags"
              :key="tag.id"
              :label="tag.name"
              variant="subtle"
              color="neutral"
              size="xs"
            />
          </div>
        </template>

        <!-- Edit mode -->
        <template v-if="editing">
          <ClientOnly>
            <NotionEditor
              :key="props.date + '-edit'"
              v-model="content"
              placeholder="Escreva sua entrada... use '/' para inserir blocos."
            />
            <template #fallback>
              <USkeleton class="h-40 w-full" />
            </template>
          </ClientOnly>

          <div class="flex justify-end gap-2">
            <UButton
              label="Cancelar"
              color="neutral"
              variant="outline"
              @click="editing = false"
            />
            <UButton
              label="Salvar"
              :loading="saving"
              :disabled="saving || isContentEmpty(content)"
              @click="onSave"
            />
          </div>
        </template>
      </div>
    </template>
  </USlideover>
</template>
