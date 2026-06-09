<script setup lang="ts">
import type { Note, NoteFolder, NoteSearchResult } from '~/types/notes'
import { NOTE_TYPE_META, NoteType } from '~/types/notes'

type DateFilter = 'all' | 'today' | 'week' | 'month'

type SearchDialogItem = {
  id: string
  title: string
  type: NoteType
  excerpt: string | null
  updatedAt: string
  folderId: string | null
  folderName: string | null
}

type SearchDialogSection = {
  key: string
  label: string
  items: SearchDialogItem[]
}

const props = defineProps<{
  open: boolean
  query: string
  notes: Note[]
  folders: NoteFolder[]
  results: NoteSearchResult[]
  searching: boolean
  selectedId?: string | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:query': [value: string]
  'select': [id: string]
}>()

const titleOnlySearch = ref(false)
const folderId = ref<string | null>(null)
const dateFilter = ref<DateFilter>('all')

const searchTerm = computed(() => props.query.trim())

const foldersById = computed(
  () => new Map(props.folders.map(folder => [folder.id, folder]))
)

const notesById = computed(
  () => new Map(props.notes.map(note => [note.id, note]))
)

const sortedFolders = computed(() =>
  [...props.folders].sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
  )
)

const sortedNotes = computed(() =>
  [...props.notes].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
)

const folderFilterLabel = computed(() => {
  if (!folderId.value) return 'Em todas'
  return foldersById.value.get(folderId.value)?.name ?? 'Em todas'
})

const folderItems = computed(() => [
  [
    {
      label: 'Todas as notas',
      icon: 'i-lucide-files',
      type: 'checkbox' as const,
      checked: folderId.value === null,
      onUpdateChecked: () => {
        folderId.value = null
      }
    },
    ...sortedFolders.value.map(folder => ({
      label: folder.name,
      icon: 'i-lucide-folder',
      type: 'checkbox' as const,
      checked: folderId.value === folder.id,
      onUpdateChecked: () => {
        folderId.value = folder.id
      }
    }))
  ]
])

const dateFilterLabel = computed(() => {
  if (dateFilter.value === 'today') return 'Hoje'
  if (dateFilter.value === 'week') return '7 dias'
  if (dateFilter.value === 'month') return '30 dias'
  return 'Qualquer data'
})

const dateItems = computed(() => [
  [
    { label: 'Qualquer data', value: 'all' as const, icon: 'i-lucide-calendar-days' },
    { label: 'Hoje', value: 'today' as const, icon: 'i-lucide-calendar' },
    { label: 'Últimos 7 dias', value: 'week' as const, icon: 'i-lucide-calendar-range' },
    { label: 'Últimos 30 dias', value: 'month' as const, icon: 'i-lucide-calendar-range' }
  ].map(option => ({
    label: option.label,
    icon: option.icon,
    type: 'checkbox' as const,
    checked: dateFilter.value === option.value,
    onUpdateChecked: () => {
      dateFilter.value = option.value
    }
  }))
])

const items = computed<SearchDialogItem[]>(() => {
  const source = searchTerm.value
    ? props.results.map(result => normalizeSearchResult(result))
    : sortedNotes.value.map(note => normalizeNote(note))

  return source.filter((item) => {
    if (folderId.value !== null && item.folderId !== folderId.value) return false
    if (titleOnlySearch.value && searchTerm.value) {
      const title = item.title.toLocaleLowerCase('pt-BR')
      if (!title.includes(searchTerm.value.toLocaleLowerCase('pt-BR'))) return false
    }
    if (dateFilter.value !== 'all' && !matchesDateFilter(item.updatedAt)) return false
    return true
  })
})

const groupedItems = computed<SearchDialogSection[]>(() => {
  const groups: SearchDialogSection[] = [
    { key: 'today', label: 'Hoje', items: [] },
    { key: 'yesterday', label: 'Ontem', items: [] },
    { key: 'month', label: 'Últimos 30 dias', items: [] },
    { key: 'older', label: 'Anteriores', items: [] }
  ]

  for (const item of items.value) {
    const groupKey = getDateGroup(item.updatedAt)
    groups.find(group => group.key === groupKey)?.items.push(item)
  }

  return groups.filter(group => group.items.length > 0)
})

function normalizeNote(note: Note): SearchDialogItem {
  const folder = note.folderId ? foldersById.value.get(note.folderId) : null

  return {
    id: note.id,
    title: note.title || 'Sem título',
    type: note.type,
    excerpt: null,
    updatedAt: note.updatedAt,
    folderId: note.folderId ?? null,
    folderName: folder?.name ?? null
  }
}

function normalizeSearchResult(result: NoteSearchResult): SearchDialogItem {
  const note = notesById.value.get(result.id)
  const folder = note?.folderId ? foldersById.value.get(note.folderId) : null

  return {
    id: result.id,
    title: result.title || 'Sem título',
    type: result.type,
    excerpt: getReadableExcerpt(result.excerpt, note?.content ?? null),
    updatedAt: result.updatedAt,
    folderId: note?.folderId ?? null,
    folderName: folder?.name ?? null
  }
}

function getTypeMeta(type: NoteType) {
  return NOTE_TYPE_META[type] ?? NOTE_TYPE_META[NoteType.Note]
}

function getDateGroup(dateStr: string): 'today' | 'yesterday' | 'month' | 'older' {
  const days = daysBetweenToday(dateStr)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days <= 30) return 'month'
  return 'older'
}

function matchesDateFilter(dateStr: string): boolean {
  const days = daysBetweenToday(dateStr)
  if (dateFilter.value === 'today') return days === 0
  if (dateFilter.value === 'week') return days <= 7
  if (dateFilter.value === 'month') return days <= 30
  return true
}

function daysBetweenToday(dateStr: string): number {
  const date = new Date(dateStr)
  const today = new Date()
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  return Math.max(0, Math.floor((startOfToday - startOfDate) / 86_400_000))
}

function getReadableExcerpt(excerpt: string | null, content: string | null): string | null {
  const contentText = extractReadableText(content)
  const excerptText = extractReadableText(excerpt)
  const source = contentText || excerptText

  if (!source) return null

  return cropExcerpt(source, searchTerm.value)
}

function extractReadableText(value: string | null): string | null {
  if (!value) return null

  const trimmed = value.trim()
  if (!trimmed) return null

  const parsedText = extractJsonText(trimmed)
  if (parsedText) return parsedText

  if (looksLikeJsonSnippet(trimmed)) return null

  return normalizeExcerptText(trimmed.replace(/<[^>]*>/g, ' '))
}

function extractJsonText(value: string): string | null {
  if (!value.startsWith('{') && !value.startsWith('[')) return null

  try {
    const parsed: unknown = JSON.parse(value)
    const chunks: string[] = []

    collectTextChunks(parsed, chunks)

    return normalizeExcerptText(chunks.join(' '))
  } catch {
    return null
  }
}

function collectTextChunks(node: unknown, chunks: string[]): void {
  if (!node || typeof node !== 'object') return

  const record = node as {
    text?: unknown
    type?: unknown
    attrs?: Record<string, unknown>
    content?: unknown
  }

  if (typeof record.text === 'string') {
    chunks.push(record.text)
  } else if (record.type === 'emoji') {
    const emoji = record.attrs?.native ?? record.attrs?.emoji ?? record.attrs?.name
    if (typeof emoji === 'string') chunks.push(emoji)
  }

  if (Array.isArray(record.content)) {
    for (const child of record.content) {
      collectTextChunks(child, chunks)
    }
  }
}

function looksLikeJsonSnippet(value: string): boolean {
  return value.includes('"type"') || value.includes('"content"') || value.includes('"attrs"')
}

function normalizeExcerptText(value: string): string | null {
  const text = value.replace(/\s+/g, ' ').trim()
  return text || null
}

function cropExcerpt(value: string, query: string): string {
  const maxLength = 120
  const normalizedValue = value.toLocaleLowerCase('pt-BR')
  const normalizedQuery = query.toLocaleLowerCase('pt-BR')
  const index = normalizedQuery ? normalizedValue.indexOf(normalizedQuery) : -1

  if (value.length <= maxLength) return value

  const start = index > 40 ? index - 40 : 0
  const end = Math.min(value.length, start + maxLength)

  return `${start > 0 ? '...' : ''}${value.slice(start, end)}${end < value.length ? '...' : ''}`
}

function close(): void {
  emit('update:open', false)
  emit('update:query', '')
}

function onQueryInput(event: Event): void {
  emit('update:query', (event.target as HTMLInputElement).value)
}

function onOpenChange(value: boolean): void {
  if (value) {
    emit('update:open', true)
    return
  }

  close()
}

function selectItem(item: SearchDialogItem): void {
  close()
  emit('select', item.id)
}
</script>

<template>
  <UModal
    :open="open"
    :close="false"
    :ui="{
      overlay: 'bg-default/60 backdrop-blur-sm',
      content: 'w-[min(94vw,38rem)] max-w-[38rem] overflow-hidden rounded-2xl',
      body: 'p-0 sm:p-0'
    }"
    @update:open="onOpenChange"
  >
    <template #body>
      <div class="bg-default">
        <div class="flex items-center gap-3 px-5 py-4">
          <UIcon name="i-lucide-search" class="size-5 shrink-0 text-muted" />
          <input
            :value="query"
            autofocus
            class="min-w-0 flex-1 bg-transparent text-base text-highlighted outline-none placeholder:text-muted"
            placeholder="Buscar nas suas notas..."
            @input="onQueryInput"
            @keydown.esc.prevent="close"
          >
        </div>

        <div class="flex flex-wrap items-center gap-1 border-t border-default px-5 py-2">
          <UButton
            icon="i-lucide-type"
            label="Título"
            size="xs"
            color="neutral"
            :variant="titleOnlySearch ? 'soft' : 'ghost'"
            @click="titleOnlySearch = !titleOnlySearch"
          />

          <UButton
            icon="i-lucide-user"
            label="Você"
            size="xs"
            color="neutral"
            variant="ghost"
            disabled
          />

          <UDropdownMenu :items="folderItems">
            <UButton
              icon="i-lucide-file"
              :label="folderFilterLabel"
              size="xs"
              color="neutral"
              variant="ghost"
            />
          </UDropdownMenu>

          <UDropdownMenu :items="dateItems">
            <UButton
              icon="i-lucide-plus"
              :label="dateFilterLabel"
              size="xs"
              color="neutral"
              variant="ghost"
            />
          </UDropdownMenu>
        </div>

        <div class="max-h-[min(62vh,32rem)] overflow-y-auto px-4 py-3">
          <div v-if="searching && searchTerm" class="space-y-2">
            <USkeleton v-for="i in 5" :key="i" class="h-9 w-full rounded-lg" />
          </div>

          <template v-else-if="groupedItems.length > 0">
            <section
              v-for="section in groupedItems"
              :key="section.key"
              class="mb-4 last:mb-0"
            >
              <p class="mb-1.5 px-2 text-xs font-medium text-muted">
                {{ section.label }}
              </p>

              <button
                v-for="item in section.items"
                :key="item.id"
                class="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-elevated"
                :class="selectedId === item.id ? 'bg-elevated' : ''"
                @click="selectItem(item)"
              >
                <UIcon
                  :name="getTypeMeta(item.type).icon"
                  class="size-4 shrink-0"
                  :class="`text-${getTypeMeta(item.type).color}-500`"
                />
                <div class="min-w-0 flex-1">
                  <div class="flex min-w-0 items-center gap-1.5">
                    <span class="truncate text-sm font-medium text-highlighted">
                      {{ item.title }}
                    </span>
                    <span
                      v-if="item.folderName"
                      class="shrink-0 truncate text-xs text-muted"
                    >
                      - {{ item.folderName }}
                    </span>
                  </div>
                  <p v-if="item.excerpt" class="truncate text-xs text-muted">
                    {{ item.excerpt }}
                  </p>
                </div>
              </button>
            </section>
          </template>

          <div v-else class="flex flex-col items-center justify-center py-12 text-center">
            <UIcon name="i-lucide-search-x" class="mb-3 size-9 text-muted" />
            <p class="text-sm font-medium text-highlighted">
              Nenhum resultado
            </p>
            <p class="text-xs text-muted">
              Tente outro termo ou remova um filtro.
            </p>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
