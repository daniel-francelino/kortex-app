<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { TrashItem } from '~/types/notes'
import { NOTE_TYPE_META, NoteType } from '~/types/notes'

const props = defineProps<{
  items: TrashItem[]
  loading: boolean
}>()

const emit = defineEmits<{
  'restore': [item: TrashItem]
  'permanent-delete': [item: TrashItem]
  'bulk-restore': [items: TrashItem[]]
  'bulk-permanent-delete': [items: TrashItem[]]
}>()

function itemKey(item: TrashItem) {
  return `${item.kind}-${item.id}`
}

const selectedKeys = ref<Set<string>>(new Set())

const selectedItems = computed(() =>
  props.items.filter(item => selectedKeys.value.has(itemKey(item)))
)

const allSelected = computed(() =>
  props.items.length > 0 && selectedKeys.value.size === props.items.length
)

const someSelected = computed(() => selectedKeys.value.size > 0)

// Keyed by item, not index — items disappearing after a restore/delete
// (bulk or not) shouldn't leave stale keys selected for items that no
// longer exist in the list.
watch(() => props.items, (items) => {
  const validKeys = new Set(items.map(itemKey))
  for (const key of selectedKeys.value) {
    if (!validKeys.has(key)) selectedKeys.value.delete(key)
  }
})

function toggleSelected(item: TrashItem) {
  const key = itemKey(item)
  if (selectedKeys.value.has(key)) selectedKeys.value.delete(key)
  else selectedKeys.value.add(key)
}

function toggleSelectAll() {
  if (allSelected.value) {
    selectedKeys.value.clear()
    return
  }
  selectedKeys.value = new Set(props.items.map(itemKey))
}

function clearSelection() {
  selectedKeys.value.clear()
}

function restoreSelected() {
  if (selectedItems.value.length === 0) return
  emit('bulk-restore', selectedItems.value)
  clearSelection()
}

// One confirm modal covers three cases — a single item, the current
// selection, or the whole trash ("esvaziar") — the message just adapts to
// the count.
const confirmTargets = ref<TrashItem[] | null>(null)

function askPermanentDelete(item: TrashItem) {
  confirmTargets.value = [item]
}

function askBulkPermanentDelete() {
  if (selectedItems.value.length === 0) return
  confirmTargets.value = selectedItems.value
}

function askEmptyTrash() {
  if (props.items.length === 0) return
  confirmTargets.value = props.items
}

function cancelPermanentDelete() {
  confirmTargets.value = null
}

function confirmPermanentDelete() {
  if (!confirmTargets.value) return

  if (confirmTargets.value.length === 1) emit('permanent-delete', confirmTargets.value[0]!)
  else emit('bulk-permanent-delete', confirmTargets.value)

  clearSelection()
  confirmTargets.value = null
}

function getTypeMeta(type: NoteType | null) {
  return NOTE_TYPE_META[type ?? NoteType.Note] ?? NOTE_TYPE_META[NoteType.Note]
}

function relativeDeletedAt(deletedAt: string) {
  return formatDistanceToNow(new Date(deletedAt), { addSuffix: true, locale: ptBR })
}
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <div class="px-4 sm:px-6 py-4 border-b border-default shrink-0">
      <div class="flex items-center justify-between gap-2">
        <h2 class="text-base font-semibold text-highlighted flex items-center gap-2">
          <UIcon name="i-lucide-trash-2" class="size-4" />
          Lixeira
        </h2>
        <UButton
          v-if="items.length > 0"
          label="Esvaziar lixeira"
          icon="i-lucide-trash"
          size="xs"
          color="error"
          variant="ghost"
          @click="askEmptyTrash"
        />
      </div>
      <p class="text-xs text-muted mt-0.5">
        Notas e pastas excluídas ficam aqui até serem restauradas ou excluídas permanentemente — itens com mais de 30 dias na lixeira são removidos automaticamente.
      </p>
    </div>

    <div
      v-if="someSelected"
      class="flex items-center justify-between gap-2 px-4 sm:px-6 py-2 border-b border-default bg-elevated/50 shrink-0"
    >
      <span class="text-xs text-muted">{{ selectedKeys.size }} selecionado(s)</span>
      <div class="flex items-center gap-2">
        <UButton
          label="Restaurar selecionados"
          icon="i-lucide-undo-2"
          size="xs"
          color="neutral"
          variant="subtle"
          @click="restoreSelected"
        />
        <UButton
          label="Excluir selecionados"
          icon="i-lucide-x"
          size="xs"
          color="error"
          variant="subtle"
          @click="askBulkPermanentDelete"
        />
        <UButton
          label="Limpar seleção"
          size="xs"
          color="neutral"
          variant="ghost"
          @click="clearSelection"
        />
      </div>
    </div>

    <div class="flex-1 overflow-y-auto p-2">
      <div v-if="loading" class="space-y-2 p-2">
        <USkeleton v-for="i in 6" :key="i" class="h-12 w-full" />
      </div>

      <div
        v-else-if="items.length === 0"
        class="flex flex-col items-center justify-center h-full text-center text-muted gap-2 py-16"
      >
        <UIcon name="i-lucide-trash-2" class="size-8 opacity-40" />
        <p class="text-sm">
          A lixeira está vazia.
        </p>
      </div>

      <template v-else>
        <div class="flex items-center gap-2.5 px-3 py-1.5">
          <UCheckbox
            :model-value="allSelected"
            @update:model-value="toggleSelectAll"
          />
          <span class="text-xs text-muted">Selecionar todos</span>
        </div>

        <ul class="space-y-0.5">
          <li
            v-for="item in props.items"
            :key="itemKey(item)"
            class="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-elevated/80 transition-colors"
          >
            <UCheckbox
              :model-value="selectedKeys.has(itemKey(item))"
              @update:model-value="toggleSelected(item)"
            />

            <span v-if="item.kind === 'note' && item.icon" class="text-sm leading-none shrink-0">
              {{ item.icon }}
            </span>
            <UIcon
              v-else-if="item.kind === 'note'"
              :name="getTypeMeta(item.type).icon"
              class="size-3.5 shrink-0"
              :class="`text-${getTypeMeta(item.type).color}-500`"
            />
            <UIcon
              v-else
              name="i-lucide-folder"
              class="size-3.5 shrink-0 text-amber-500"
            />

            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-highlighted truncate">
                {{ item.title || 'Sem título' }}
              </p>
              <p class="text-xs text-dimmed">
                Excluído {{ relativeDeletedAt(item.deletedAt) }}
              </p>
            </div>

            <UButton
              label="Restaurar"
              icon="i-lucide-undo-2"
              size="xs"
              color="neutral"
              variant="subtle"
              @click="emit('restore', item)"
            />
            <UTooltip text="Excluir permanentemente">
              <UButton
                icon="i-lucide-x"
                size="xs"
                color="error"
                variant="ghost"
                @click="askPermanentDelete(item)"
              />
            </UTooltip>
          </li>
        </ul>
      </template>
    </div>

    <UModal
      :open="!!confirmTargets"
      @update:open="(value: boolean) => { if (!value) confirmTargets = null }"
    >
      <template #header>
        <h3 class="text-lg font-semibold">
          <template v-if="confirmTargets && confirmTargets.length === 1">
            Excluir "{{ confirmTargets[0]!.title || 'Sem título' }}" permanentemente?
          </template>
          <template v-else>
            Excluir {{ confirmTargets?.length ?? 0 }} itens permanentemente?
          </template>
        </h3>
      </template>

      <template #body>
        <p class="text-sm text-muted">
          <template v-if="confirmTargets && confirmTargets.length === 1">
            <template v-if="confirmTargets[0]!.kind === 'folder'">
              Isso exclui a pasta e tudo o que estiver dentro dela para sempre.
            </template>
            <template v-else>
              Essa nota será removida para sempre.
            </template>
          </template>
          <template v-else>
            Isso remove {{ confirmTargets?.length ?? 0 }} itens (e o conteúdo de pastas incluídas) para sempre.
          </template>
          Essa ação não pode ser desfeita.
        </p>

        <div class="flex justify-end gap-2 pt-4">
          <UButton
            label="Cancelar"
            color="neutral"
            variant="subtle"
            @click="cancelPermanentDelete"
          />
          <UButton
            label="Excluir permanentemente"
            color="error"
            @click="confirmPermanentDelete"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
