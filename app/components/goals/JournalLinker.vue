<script setup lang="ts">
import type { JournalEntry } from '~/types/journal'
import { formatDisplay } from '#shared/utils/dateTime'

const props = defineProps<{
  existingEntryIds: string[]
}>()

const emit = defineEmits<{
  link: [entryId: string]
  cancel: []
}>()

const search = ref('')
const loading = ref(true)
const entries = ref<JournalEntry[]>([])

async function loadEntries() {
  loading.value = true
  try {
    const response = await $fetch<{ data: JournalEntry[] }>('/api/journal/entries', {
      query: { pageSize: 20, q: search.value || undefined }
    })
    entries.value = response.data ?? []
  } catch {
    entries.value = []
  } finally {
    loading.value = false
  }
}

onMounted(loadEntries)

let searchTimeout: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(loadEntries, 300)
})

function formatEntryDate(dateStr: string): string {
  const parsed = new Date(`${dateStr}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return dateStr
  return formatDisplay(parsed, "dd 'de' MMM'.' 'de' yyyy")
}

const availableEntries = computed(() =>
  entries.value.filter(e => !props.existingEntryIds.includes(e.id))
)
</script>

<template>
  <div class="space-y-2 rounded-lg border border-default p-3">
    <UInput
      v-model="search"
      icon="i-lucide-search"
      placeholder="Buscar entrada por título ou conteúdo..."
      size="sm"
      class="w-full"
    />

    <div v-if="loading" class="space-y-2">
      <USkeleton v-for="i in 3" :key="i" class="h-8 w-full" />
    </div>

    <div v-else-if="availableEntries.length > 0" class="max-h-40 overflow-y-auto space-y-1">
      <button
        v-for="entry in availableEntries"
        :key="entry.id"
        class="flex w-full items-center gap-2 rounded-md p-2 text-sm text-highlighted hover:bg-elevated transition-colors text-left"
        @click="emit('link', entry.id)"
      >
        <UIcon name="i-lucide-plus" class="size-3.5 text-muted shrink-0" />
        <span class="truncate">{{ formatEntryDate(entry.entryDate) }}</span>
      </button>
    </div>

    <p v-else class="text-xs text-muted py-2 text-center">
      Nenhuma entrada encontrada
    </p>

    <div class="flex justify-end pt-1">
      <UButton
        label="Fechar"
        size="xs"
        color="neutral"
        variant="ghost"
        @click="emit('cancel')"
      />
    </div>
  </div>
</template>
