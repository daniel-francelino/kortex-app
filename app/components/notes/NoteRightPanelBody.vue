<script setup lang="ts">
import type { Note, NoteDetail, NoteTag, UpdateNotePayload } from '~/types/notes'

type OutlineItem = { level: number, text: string, blockId: string }

defineProps<{
  view: 'outline' | 'properties' | null
  outline: OutlineItem[]
  activeHeadingId: string | null
  note: NoteDetail | null
  tags: NoteTag[]
  noteTypeOptions: { label: string, value: string }[]
  updateNote: (id: string, payload: UpdateNotePayload, options?: { silent?: boolean }) => Promise<Note | null>
}>()

const emit = defineEmits<{
  'click-outline-item': [blockId: string]
  'updated': []
  'navigate-note': [noteId: string]
}>()
</script>

<template>
  <NotesNoteOutlinePanel
    v-if="view === 'outline'"
    :outline="outline"
    :active-heading-id="activeHeadingId"
    @click-item="(blockId: string) => emit('click-outline-item', blockId)"
  />
  <NotesNotePropertiesPanel
    v-else-if="view === 'properties'"
    :note="note"
    :tags="tags"
    :note-type-options="noteTypeOptions"
    :update-note="updateNote"
    @updated="emit('updated')"
    @navigate-note="(noteId: string) => emit('navigate-note', noteId)"
  />
</template>
