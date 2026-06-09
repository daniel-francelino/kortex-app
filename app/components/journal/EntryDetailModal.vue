<script setup lang="ts">
import type { JournalEntry } from '~/types/journal'
import { getMoodOption } from '~/types/journal'
import { isEditorContentEmpty } from '~/utils/editor/content'

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
const mood = ref<string | null>(null)
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
      mood.value = data.entry?.mood ?? null
    }
  } finally {
    loading.value = false
  }
}

function isContentEmpty(val: string): boolean {
  return isEditorContentEmpty(val)
}

async function onSave() {
  if (isContentEmpty(content.value) || saving.value) return
  saving.value = true
  try {
    const result = await upsertEntry({
      entryDate: props.date,
      title: null,
      content: content.value,
      mood: mood.value,
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

function onOpenChange(value: boolean) {
  emit('update:open', value)
}
</script>

<template>
  <UModal
    :open="props.open"
    fullscreen
    :title="formatDate(props.date)"
    :description="editing ? 'Editando entrada do diario.' : 'Entrada do diario.'"
    :ui="{
      overlay: 'z-[220] bg-elevated/80',
      content: 'z-[230]',
      header: 'px-4 py-3 sm:px-8',
      body: 'overflow-y-auto p-0',
      footer: 'px-4 py-3 sm:px-8'
    }"
    @update:open="onOpenChange"
  >
    <template #body>
      <!-- Loading -->
      <div
        v-if="loading"
        class="mx-auto w-full max-w-4xl space-y-4 px-4 py-8 sm:px-8"
      >
        <USkeleton class="h-4 w-full" />
        <USkeleton class="h-4 w-5/6" />
        <USkeleton class="h-4 w-4/5" />
        <USkeleton class="h-40 w-full" />
      </div>

      <div
        v-else
        class="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-8"
      >
        <!-- No entry yet -->
        <div
          v-if="!entry && !editing"
          class="flex flex-1 flex-col items-center justify-center gap-3 py-16"
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
          <!-- Mood display + edit action -->
          <div class="flex items-center justify-between gap-3 border-b border-default pb-4">
            <div
              v-if="getMoodOption(entry.mood)"
              class="flex items-center gap-2"
            >
              <span class="text-2xl leading-none">{{ getMoodOption(entry.mood)?.emoji }}</span>
              <span
                class="text-sm font-medium"
                :style="{ color: getMoodOption(entry.mood)?.color }"
              >{{ getMoodOption(entry.mood)?.label }}</span>
            </div>
            <div v-else />
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
              min-height="60vh"
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
          <JournalMoodSelector v-model="mood" />

          <ClientOnly>
            <NotionEditor
              :key="props.date + '-edit'"
              v-model="content"
              placeholder="Escreva sua entrada... use '/' para inserir blocos."
              min-height="60vh"
            />
            <template #fallback>
              <USkeleton class="h-40 w-full" />
            </template>
          </ClientOnly>
        </template>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <template v-if="editing">
          <UButton
            label="Cancelar"
            color="neutral"
            variant="outline"
            @click="editing = false"
          />
          <UButton
            label="Salvar"
            icon="i-lucide-check"
            :loading="saving"
            :disabled="saving || isContentEmpty(content)"
            @click="onSave"
          />
        </template>

        <UButton
          v-else
          label="Fechar"
          icon="i-lucide-x"
          color="neutral"
          variant="subtle"
          @click="onOpenChange(false)"
        />
      </div>
    </template>
  </UModal>
</template>
