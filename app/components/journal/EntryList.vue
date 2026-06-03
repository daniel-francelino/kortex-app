<script setup lang="ts">
import type { JournalEntry } from '~/types/journal'

defineProps<{
  entries: JournalEntry[]
  total: number
  page: number
  pageSize: number
  loading: boolean
}>()

const emit = defineEmits<{
  'update:page': [value: number]
  'select': [date: string]
}>()

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })
}

// Extracts plain text from Tiptap JSON content (or returns legacy plain text as-is)
function extractPreview(jsonContent: string): string {
  if (!jsonContent?.trim()) return ''
  try {
    const doc = JSON.parse(jsonContent)
    if (doc?.type !== 'doc') throw new Error()
    const parts: string[] = []

    function walk(node: { type: string; text?: string; content?: unknown[] }): void {
      if (node.type === 'text' && node.text) parts.push(node.text)
      if (node.content) (node.content as typeof node[]).forEach(walk)
    }

    ;(doc.content ?? []).forEach(walk)
    return parts.join(' ').replace(/\s+/g, ' ').trim()
  } catch {
    // Legacy plain text
    return jsonContent.replace(/\s+/g, ' ').trim()
  }
}
</script>

<template>
  <!-- Loading -->
  <div
    v-if="loading"
    class="space-y-3"
  >
    <UCard
      v-for="i in 5"
      :key="i"
    >
      <div class="space-y-2">
        <USkeleton class="h-4 w-40" />
        <USkeleton class="h-3 w-full" />
        <USkeleton class="h-3 w-4/5" />
        <USkeleton class="h-3 w-3/5" />
      </div>
    </UCard>
  </div>

  <!-- Empty -->
  <div
    v-else-if="entries.length === 0"
    class="flex flex-col items-center justify-center py-12 gap-3"
  >
    <UIcon
      name="i-lucide-book-open"
      class="size-12 text-dimmed"
    />
    <p class="text-sm text-muted">
      Nenhuma entrada encontrada.
    </p>
  </div>

  <!-- Entry cards -->
  <div
    v-else
    class="space-y-3"
  >
    <UCard
      v-for="entry in entries"
      :key="entry.id"
      class="cursor-pointer transition-all hover:ring-1 hover:ring-primary"
      @click="emit('select', entry.entryDate)"
    >
      <div class="space-y-2">
        <!-- Date -->
        <p class="text-xs font-medium text-muted capitalize">
          {{ formatDate(entry.entryDate) }}
        </p>

        <!-- Content preview — up to 5 visual lines -->
        <p
          v-if="extractPreview(entry.content)"
          class="text-sm text-highlighted line-clamp-5 leading-relaxed"
        >
          {{ extractPreview(entry.content) }}
        </p>
        <p
          v-else
          class="text-sm text-dimmed italic"
        >
          Sem conteúdo
        </p>

        <!-- Tags -->
        <div
          v-if="entry.tags && entry.tags.length > 0"
          class="flex flex-wrap gap-1 pt-1"
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
      </div>
    </UCard>

    <!-- Pagination -->
    <div
      v-if="total > pageSize"
      class="flex justify-center pt-4"
    >
      <UPagination
        :model-value="page"
        :total="total"
        :items-per-page="pageSize"
        @update:model-value="emit('update:page', $event)"
      />
    </div>
  </div>
</template>
