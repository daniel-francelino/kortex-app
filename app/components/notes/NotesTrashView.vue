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
}>()

const confirmTarget = ref<TrashItem | null>(null)

function getTypeMeta(type: NoteType | null) {
  return NOTE_TYPE_META[type ?? NoteType.Note] ?? NOTE_TYPE_META[NoteType.Note]
}

function relativeDeletedAt(deletedAt: string) {
  return formatDistanceToNow(new Date(deletedAt), { addSuffix: true, locale: ptBR })
}

function askPermanentDelete(item: TrashItem) {
  confirmTarget.value = item
}

function cancelPermanentDelete() {
  confirmTarget.value = null
}

function confirmPermanentDelete() {
  if (!confirmTarget.value) return
  emit('permanent-delete', confirmTarget.value)
  confirmTarget.value = null
}
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <div class="px-4 sm:px-6 py-4 border-b border-default shrink-0">
      <h2 class="text-base font-semibold text-highlighted flex items-center gap-2">
        <UIcon name="i-lucide-trash-2" class="size-4" />
        Lixeira
      </h2>
      <p class="text-xs text-muted mt-0.5">
        Notas e pastas excluídas ficam aqui até serem restauradas ou excluídas permanentemente.
      </p>
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

      <ul v-else class="space-y-0.5">
        <li
          v-for="item in props.items"
          :key="`${item.kind}-${item.id}`"
          class="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-elevated/80 transition-colors"
        >
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
    </div>

    <UModal
      :open="!!confirmTarget"
      @update:open="(value: boolean) => { if (!value) confirmTarget = null }"
    >
      <template #header>
        <h3 class="text-lg font-semibold">
          Excluir "{{ confirmTarget?.title || 'Sem título' }}" permanentemente?
        </h3>
      </template>

      <template #body>
        <p class="text-sm text-muted">
          <template v-if="confirmTarget?.kind === 'folder'">
            Isso exclui a pasta e tudo o que estiver dentro dela para sempre.
          </template>
          <template v-else>
            Essa nota será removida para sempre.
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
