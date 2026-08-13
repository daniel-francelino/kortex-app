<script setup lang="ts">
import type { CreateTagPayload, Note, NoteTag, NoteDetail, UpdateNotePayload, UpdateTagPayload } from '~/types/notes'
import { NOTE_TYPE_META, NoteType } from '~/types/notes'
import { motion } from 'motion-v'

const props = defineProps<{
  note: NoteDetail | null
  tags: NoteTag[]
  noteTypeOptions: { label: string, value: string }[]
  updateNote: (id: string, payload: UpdateNotePayload, options?: { silent?: boolean }) => Promise<Note | null>
  createTag: (payload: CreateTagPayload) => Promise<NoteTag | null>
  updateTag: (id: string, payload: UpdateTagPayload) => Promise<NoteTag | null>
  deleteTag: (id: string) => Promise<boolean>
}>()

const emit = defineEmits<{
  'updated': []
  'navigate-note': [noteId: string]
}>()

const editType = ref<NoteType>(NoteType.Note)
const editTagIds = ref<string[]>([])
const saving = ref(false)
const savingError = ref(false)

const typeItems = computed(() =>
  props.noteTypeOptions.map(opt => ({ ...opt, icon: NOTE_TYPE_META[opt.value as NoteType]?.icon }))
)

const currentTypeIcon = computed(() => NOTE_TYPE_META[editType.value]?.icon)

const tagItems = computed(() =>
  props.tags.map(t => ({ label: `#${t.name}`, value: t.id, color: t.color }))
)

// Read-only shared notes can't have their type/tags changed here — same rule
// NoteEditor.vue applies to title/content (`accessRole !== 'view'`).
const canEdit = computed(() => (props.note?.accessRole ?? 'owner') !== 'view')

let syncing = false

watch(() => props.note, (note) => {
  if (!note) return
  syncing = true
  editType.value = note.type as NoteType
  editTagIds.value = (note.tags ?? []).map(t => t.id)
  nextTick(() => {
    syncing = false
  })
}, { immediate: true })

let saveTimer: ReturnType<typeof setTimeout> | null = null

async function scheduleSave() {
  if (syncing || !canEdit.value) return

  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    if (!props.note) return

    saving.value = true
    savingError.value = false
    try {
      const result = await props.updateNote(
        props.note.id,
        { type: editType.value, tagIds: editTagIds.value },
        { silent: true }
      )
      if (result) emit('updated')
      else savingError.value = true
    } catch {
      savingError.value = true
    } finally {
      saving.value = false
    }
  }, 600)
}

watch(editType, () => {
  if (!syncing && props.note) scheduleSave()
})
watch(editTagIds, () => {
  if (!syncing && props.note) scheduleSave()
}, { deep: true })

onUnmounted(() => {
  if (saveTimer) clearTimeout(saveTimer)
})

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}
</script>

<template>
  <div class="p-3">
    <template v-if="note">
      <div class="space-y-4">
        <!-- Type -->
        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-muted uppercase tracking-wide block">Tipo</label>
          <USelect
            v-model="editType"
            :items="typeItems"
            value-key="value"
            size="xs"
            class="w-full"
            :icon="currentTypeIcon"
            :disabled="!canEdit"
          />
        </div>

        <!-- Tags -->
        <div class="space-y-1.5">
          <div class="flex items-center justify-between">
            <label class="text-xs font-semibold text-muted uppercase tracking-wide block">Tags</label>
            <UPopover v-if="canEdit">
              <UTooltip text="Criar ou editar tags">
                <UButton
                  icon="i-lucide-settings-2"
                  size="xs"
                  variant="ghost"
                  color="neutral"
                />
              </UTooltip>
              <template #content>
                <div class="p-3 w-64">
                  <NotesTagManager
                    :tags="tags"
                    :create-tag="createTag"
                    :update-tag="updateTag"
                    :delete-tag="deleteTag"
                  />
                </div>
              </template>
            </UPopover>
          </div>
          <p class="text-[11px] text-dimmed leading-snug">
            Etiquetas pra organizar e (no futuro) filtrar suas notas — clique no ícone acima pra criar ou editar.
          </p>
          <USelect
            v-model="editTagIds"
            :items="tagItems"
            value-key="value"
            multiple
            size="xs"
            placeholder="Sem tags"
            class="w-full"
            :disabled="!canEdit"
          >
            <template #item-leading="{ item }">
              <span
                :class="getNoteTagColorClass((item as { color?: string | null }).color)"
                class="inline-block size-2 rounded-full"
              />
            </template>
          </USelect>
        </div>

        <!-- Dates -->
        <div class="space-y-2 border-t border-default pt-3">
          <div class="flex items-start justify-between gap-2 text-xs">
            <span class="text-muted shrink-0">Criada</span>
            <span class="text-default text-right">{{ formatDate(note.createdAt) }}</span>
          </div>
          <div class="flex items-start justify-between gap-2 text-xs">
            <span class="text-muted shrink-0">Atualizada</span>
            <span class="text-default text-right">{{ formatDate(note.updatedAt) }}</span>
          </div>
        </div>

        <!-- Stats -->
        <div class="space-y-2 border-t border-default pt-3">
          <div class="flex items-center justify-between text-xs">
            <span class="text-muted flex items-center gap-1.5">
              <UIcon name="i-lucide-link" class="size-3" />
              Vínculos
            </span>
            <UBadge size="xs" variant="subtle" color="neutral">
              {{ note.links?.length ?? note.linkCount ?? 0 }}
            </UBadge>
          </div>
          <div class="flex items-center justify-between text-xs">
            <span class="text-muted flex items-center gap-1.5">
              <UIcon name="i-lucide-corner-down-left" class="size-3" />
              Backlinks
            </span>
            <UBadge size="xs" variant="subtle" color="neutral">
              {{ note.backlinks?.length ?? note.backlinkCount ?? 0 }}
            </UBadge>
          </div>
        </div>

        <!-- Backlinks list -->
        <div v-if="note.backlinks?.length" class="border-t border-default pt-3 space-y-0.5">
          <p class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
            Mencionado em
          </p>
          <button
            v-for="bl in note.backlinks"
            :key="bl.id"
            class="w-full text-left text-xs text-primary hover:underline truncate block py-0.5 flex items-center gap-1.5"
            @click="emit('navigate-note', bl.sourceNoteId)"
          >
            <UIcon name="i-lucide-arrow-left" class="size-3 shrink-0" />
            <span class="truncate">{{ bl.sourceNote?.title ?? 'Nota excluída' }}</span>
          </button>
        </div>

        <!-- Save / error indicator -->
        <motion.div
          v-if="saving || savingError"
          :key="savingError ? 'error' : 'saving'"
          class="text-xs flex items-center gap-1.5 pt-1"
          :class="savingError ? 'text-error' : 'text-muted'"
          :initial="{ opacity: 0 }"
          :animate="{ opacity: 1 }"
          :exit="{ opacity: 0 }"
          :transition="{ duration: 0.15 }"
        >
          <template v-if="savingError">
            <UIcon name="i-lucide-alert-circle" class="size-3" />
            Erro ao salvar
          </template>
          <template v-else>
            <UIcon name="i-lucide-loader-2" class="size-3 animate-spin" />
            Salvando...
          </template>
        </motion.div>
      </div>
    </template>

    <div v-else class="flex flex-col items-center justify-center py-8 gap-2">
      <UIcon name="i-lucide-info" class="size-6 text-dimmed" />
      <p class="text-xs text-muted">
        Selecione uma nota
      </p>
    </div>
  </div>
</template>
