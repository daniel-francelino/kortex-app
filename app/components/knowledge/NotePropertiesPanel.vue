<script setup lang="ts">
import type { KnowledgeTag, NoteDetail } from '~/types/knowledge'
import { NOTE_TYPE_META, NoteType } from '~/types/knowledge'

const props = defineProps<{
  note: NoteDetail | null
  tags: KnowledgeTag[]
}>()

const emit = defineEmits<{
  updated: []
  'navigate-note': [noteId: string]
}>()

const { updateNote, noteTypeOptions } = useKnowledge()

const editType = ref<NoteType>(NoteType.Note)
const editTagIds = ref<string[]>([])
const saving = ref(false)

const tagOptions = computed(() =>
  props.tags.map(t => ({ label: `#${t.name}`, value: t.id }))
)

const typeMeta = computed(() => NOTE_TYPE_META[editType.value] ?? NOTE_TYPE_META[NoteType.Note])

let syncing = false

watch(() => props.note, (note) => {
  if (!note) return
  syncing = true
  editType.value = note.type as NoteType
  editTagIds.value = (note.tags ?? []).map(t => t.id)
  nextTick(() => { syncing = false })
}, { immediate: true })

let saveTimer: ReturnType<typeof setTimeout> | null = null

async function scheduleSave() {
  if (syncing) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    if (!props.note) return
    saving.value = true
    try {
      await updateNote(props.note.id, { type: editType.value, tagIds: editTagIds.value })
      emit('updated')
    } finally {
      saving.value = false
    }
  }, 600)
}

watch(editType, () => { if (!syncing && props.note) scheduleSave() })
watch(editTagIds, () => { if (!syncing && props.note) scheduleSave() }, { deep: true })

onUnmounted(() => { if (saveTimer) clearTimeout(saveTimer) })

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
            :items="noteTypeOptions"
            value-key="value"
            size="xs"
            class="w-full"
          />
        </div>

        <!-- Tags -->
        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-muted uppercase tracking-wide block">Tags</label>
          <USelect
            v-model="editTagIds"
            :items="tagOptions"
            value-key="value"
            multiple
            size="xs"
            placeholder="Sem tags"
            class="w-full"
          />
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
            <UBadge size="xs" variant="subtle" color="neutral">{{ note.links?.length ?? note.linkCount ?? 0 }}</UBadge>
          </div>
          <div class="flex items-center justify-between text-xs">
            <span class="text-muted flex items-center gap-1.5">
              <UIcon name="i-lucide-corner-down-left" class="size-3" />
              Backlinks
            </span>
            <UBadge size="xs" variant="subtle" color="neutral">{{ note.backlinks?.length ?? note.backlinkCount ?? 0 }}</UBadge>
          </div>
        </div>

        <!-- Backlinks list -->
        <div v-if="note.backlinks?.length" class="border-t border-default pt-3 space-y-0.5">
          <p class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Mencionado em</p>
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

        <!-- Save indicator -->
        <div v-if="saving" class="text-xs text-muted flex items-center gap-1.5 pt-1">
          <UIcon name="i-lucide-loader-2" class="size-3 animate-spin" />
          Salvando...
        </div>
      </div>
    </template>

    <div v-else class="flex flex-col items-center justify-center py-8 gap-2">
      <UIcon name="i-lucide-info" class="size-6 text-dimmed" />
      <p class="text-xs text-muted">Selecione uma nota</p>
    </div>
  </div>
</template>
