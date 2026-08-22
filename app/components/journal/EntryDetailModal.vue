<script setup lang="ts">
import type { JournalEntry, MetricValueWithDefinition } from '~/types/journal'
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

const {
  fetchEntryByDate,
  upsertEntry,
  deleteEntry,
  tags: availableTags,
  refreshTags,
  metricDefinitions,
  refreshMetricDefinitions,
  createMetricDefinition,
  upsertMetricValues,
  metricTypeOptions
} = useJournal()

onMounted(() => {
  refreshTags()
  refreshMetricDefinitions()
})

const loading = ref(false)
const entry = ref<JournalEntry | null>(null)
const entryTags = ref<string[]>([])
const entryMetrics = ref<MetricValueWithDefinition[]>([])

const content = ref('')
const mood = ref<string | null>(null)
const editing = ref(false)
const saving = ref(false)
const deleting = ref(false)
const confirmDeleteOpen = ref(false)
const metricCreateOpen = ref(false)

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
    entry.value = data?.entry ?? null
    entryTags.value = (data?.tags ?? []).map((t: unknown) => (t as { name: string }).name)
    entryMetrics.value = data?.metrics ?? []
    content.value = data?.entry?.content ?? ''
    mood.value = data?.entry?.mood ?? null
  } finally {
    loading.value = false
  }
}

async function onDeleteEntry() {
  if (deleting.value) return
  deleting.value = true
  try {
    const ok = await deleteEntry(props.date)
    if (ok) {
      confirmDeleteOpen.value = false
      emit('updated')
      onOpenChange(false)
    }
  } finally {
    deleting.value = false
  }
}

function isContentEmpty(val: string): boolean {
  return isEditorContentEmpty(val)
}

function cancelEditing() {
  editing.value = false
  content.value = entry.value?.content ?? ''
  mood.value = entry.value?.mood ?? null
  entryTags.value = (entry.value?.tags ?? []).map(t => t.name)
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
      tags: entryTags.value
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
            <div class="flex items-center gap-2">
              <UButton
                icon="i-lucide-trash-2"
                label="Excluir"
                color="error"
                variant="ghost"
                size="sm"
                @click="confirmDeleteOpen = true"
              />
              <UButton
                icon="i-lucide-pencil"
                label="Editar"
                color="neutral"
                variant="ghost"
                size="sm"
                @click="editing = true"
              />
            </div>
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

          <!-- Metrics (read-only) -->
          <div
            v-if="entryMetrics.length > 0"
            class="rounded-lg border border-default p-3"
          >
            <h4 class="text-sm font-medium text-highlighted mb-2">
              Métricas do dia
            </h4>
            <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div
                v-for="mv in entryMetrics"
                :key="mv.id"
                class="rounded-md bg-elevated/40 p-2"
              >
                <p class="text-xs text-muted">
                  {{ mv.definition?.name }}
                </p>
                <p class="text-sm font-medium text-highlighted">
                  {{ mv.numberValue ?? (mv.booleanValue !== null ? (mv.booleanValue ? 'Sim' : 'Não') : (mv.selectValue ?? mv.textValue ?? '—')) }}
                  <span
                    v-if="mv.definition?.unit"
                    class="text-xs text-muted"
                  >{{ mv.definition.unit }}</span>
                </p>
              </div>
            </div>
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

          <!-- Tags -->
          <div class="rounded-lg border border-default p-3">
            <h4 class="text-sm font-medium text-highlighted mb-2">
              Tags
            </h4>
            <JournalTagEditor
              v-model="entryTags"
              :available-tags="availableTags ?? []"
            />
          </div>

          <!-- Metrics (editable) -->
          <div class="rounded-lg border border-default p-3">
            <div class="flex justify-end mb-2">
              <UButton
                label="Nova métrica"
                icon="i-lucide-plus"
                size="xs"
                color="neutral"
                variant="ghost"
                @click="metricCreateOpen = true"
              />
            </div>
            <JournalMetricsPanel
              :definitions="metricDefinitions ?? []"
              :existing-values="entryMetrics"
              :entry-date="props.date"
              :on-upsert-metric-values="upsertMetricValues"
              @saved="loadEntry"
            />
          </div>
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
            @click="cancelEditing"
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

  <!-- Delete confirmation -->
  <UModal
    :open="confirmDeleteOpen"
    :ui="{ overlay: 'z-[240]', content: 'z-[250]' }"
    @update:open="confirmDeleteOpen = $event"
  >
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-trash-2" class="size-4 text-error" />
        <span class="text-sm font-semibold text-highlighted">Excluir entrada</span>
      </div>
    </template>

    <template #body>
      <p class="text-sm text-muted">
        Tem certeza que deseja excluir a entrada de {{ formatDate(props.date) }}? Essa ação não pode ser desfeita pela interface.
      </p>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <UButton
          label="Cancelar"
          variant="ghost"
          color="neutral"
          size="sm"
          @click="confirmDeleteOpen = false"
        />
        <UButton
          label="Excluir"
          color="error"
          icon="i-lucide-trash-2"
          size="sm"
          :loading="deleting"
          @click="onDeleteEntry"
        />
      </div>
    </template>
  </UModal>

  <JournalMetricCreateModal
    :open="metricCreateOpen"
    :metric-type-options="metricTypeOptions"
    :on-create-metric-definition="createMetricDefinition"
    @update:open="metricCreateOpen = $event"
  />
</template>
