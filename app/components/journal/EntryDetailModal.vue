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

const { fetchEntryByDate, upsertEntry, deleteEntry } = useJournal()

const isMobile = useIsMobile()

const loading = ref(false)
const entry = ref<JournalEntry | null>(null)

const content = ref('')
const mood = ref<string | null>(null)
const editing = ref(false)
const saving = ref(false)
const deleting = ref(false)
const confirmDeleteOpen = ref(false)

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
}

async function onSave() {
  if (isContentEmpty(content.value) || saving.value) return
  saving.value = true
  try {
    const result = await upsertEntry({
      entryDate: props.date,
      title: null,
      content: content.value,
      mood: mood.value
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
      content: 'z-[230] flex h-dvh max-h-dvh flex-col',
      header: 'shrink-0 px-4 py-3 sm:px-8',
      body: 'min-h-0 flex-1 overflow-y-auto p-0',
      footer: 'shrink-0 px-4 py-3 sm:px-8'
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
                :size="isMobile ? 'md' : 'sm'"
                @click="confirmDeleteOpen = true"
              />
              <UButton
                icon="i-lucide-pencil"
                label="Editar"
                color="neutral"
                variant="ghost"
                :size="isMobile ? 'md' : 'sm'"
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
          :size="isMobile ? 'md' : 'sm'"
          @click="confirmDeleteOpen = false"
        />
        <UButton
          label="Excluir"
          color="error"
          icon="i-lucide-trash-2"
          :size="isMobile ? 'md' : 'sm'"
          :loading="deleting"
          @click="onDeleteEntry"
        />
      </div>
    </template>
  </UModal>
</template>
