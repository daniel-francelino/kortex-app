<script setup lang="ts">
import { z } from 'zod'
import type { CreateNotePayload, Note } from '~/types/notes'
import { NoteType } from '~/types/notes'

const props = defineProps<{
  open: boolean
  noteTypeOptions: { label: string, value: string }[]
  createNote: (payload: CreateNotePayload) => Promise<Note | null>
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': [note: Note]
}>()

const schema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  type: z.nativeEnum(NoteType),
  content: z.string().optional()
})

type FormState = z.infer<typeof schema>

const state = reactive<FormState>({
  title: '',
  type: NoteType.Note,
  content: ''
})

const submitting = ref(false)

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    state.title = ''
    state.type = NoteType.Note
    state.content = ''
  }
})

async function onSubmit(): Promise<void> {
  submitting.value = true
  try {
    const note = await props.createNote({
      title: state.title,
      content: state.content || undefined,
      type: state.type
    })
    if (note) {
      emit('update:open', false)
      emit('saved', note as Note)
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal :open="open" @update:open="emit('update:open', $event)">
    <template #header>
      <h3 class="text-lg font-semibold">
        Nova nota
      </h3>
    </template>

    <template #body>
      <UForm
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField label="Título" name="title">
          <UInput
            v-model="state.title"
            placeholder="Ex: Ideias sobre produtividade..."
            class="w-full"
            autofocus
          />
        </UFormField>

        <UFormField label="Tipo" name="type">
          <USelect
            v-model="state.type"
            :items="noteTypeOptions"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Conteúdo (opcional)" name="content">
          <UTextarea
            v-model="state.content"
            placeholder="Escreva em Markdown... Use [[Nome da Nota]] para vincular e #tag para categorizar"
            :rows="6"
            class="w-full font-mono text-sm"
          />
        </UFormField>

        <div class="flex justify-end gap-2 pt-2">
          <UButton
            icon="i-lucide-x"
            label="Cancelar"
            color="neutral"
            variant="subtle"
            @click="emit('update:open', false)"
          />
          <UButton
            icon="i-lucide-check"
            label="Criar"
            type="submit"
            :loading="submitting"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
