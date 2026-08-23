<script setup lang="ts">
import type { CreateTagPayload, NoteTag, UpdateTagPayload } from '~/types/notes'
import { z } from 'zod'

const props = defineProps<{
  tags: NoteTag[]
  createTag: (payload: CreateTagPayload) => Promise<NoteTag | null>
  updateTag: (id: string, payload: UpdateTagPayload) => Promise<NoteTag | null>
  deleteTag: (id: string) => Promise<boolean>
}>()

const modalOpen = ref(false)
const editingTag = ref<NoteTag | null>(null)
const deleting = ref<string | null>(null)

const TAG_COLORS = [
  { label: 'Padrão', value: '' },
  { label: 'Vermelho', value: 'red' },
  { label: 'Laranja', value: 'orange' },
  { label: 'Amarelo', value: 'yellow' },
  { label: 'Verde', value: 'green' },
  { label: 'Azul', value: 'blue' },
  { label: 'Roxo', value: 'purple' },
  { label: 'Rosa', value: 'pink' }
]

const schema = z.object({
  name: z.string().min(1, { message: 'Nome é obrigatório' }).max(100),
  color: z.string().optional()
})

const formState = reactive({ name: '', color: '' })

function openCreate(): void {
  editingTag.value = null
  formState.name = ''
  formState.color = ''
  modalOpen.value = true
}

function openEdit(tag: NoteTag): void {
  editingTag.value = tag
  formState.name = tag.name
  formState.color = tag.color ?? ''
  modalOpen.value = true
}

async function onSubmit(): Promise<void> {
  const payload = { name: formState.name, color: formState.color || undefined }

  if (editingTag.value) {
    const success = await props.updateTag(editingTag.value.id, payload)
    if (success) modalOpen.value = false
  } else {
    const result = await props.createTag(payload)
    if (result) modalOpen.value = false
  }
}

async function onDelete(tag: NoteTag): Promise<void> {
  deleting.value = tag.id
  await props.deleteTag(tag.id)
  deleting.value = null
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-semibold text-highlighted">
        <UIcon name="i-lucide-tags" class="size-4 mr-1 inline" />
        Tags
      </h3>
      <UButton
        icon="i-lucide-plus"
        size="xs"
        variant="ghost"
        @click="openCreate"
      />
    </div>

    <div v-if="tags && tags.length > 0" class="space-y-1">
      <div
        v-for="tag in tags"
        :key="tag.id"
        class="flex items-center justify-between rounded px-2 py-1.5 hover:bg-elevated group"
      >
        <div class="flex items-center gap-2">
          <span :class="getNoteTagColorClass(tag.color)" class="inline-block size-2.5 rounded-full" />
          <span class="text-sm text-default">#{{ tag.name }}</span>
        </div>
        <div class="flex items-center gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
          <UButton
            icon="i-lucide-pencil"
            size="xs"
            variant="ghost"
            @click="openEdit(tag)"
          />
          <UButton
            icon="i-lucide-trash-2"
            size="xs"
            color="error"
            variant="ghost"
            :loading="deleting === tag.id"
            @click="onDelete(tag)"
          />
        </div>
      </div>
    </div>
    <p v-else class="text-xs text-muted px-2">
      Nenhuma tag criada
    </p>

    <!-- Create/Edit Modal -->
    <UModal v-model:open="modalOpen">
      <template #content>
        <UCard>
          <template #header>
            <h3 class="text-lg font-semibold text-highlighted">
              {{ editingTag ? 'Editar Tag' : 'Nova Tag' }}
            </h3>
          </template>

          <UForm
            :schema="schema"
            :state="formState"
            class="space-y-4"
            @submit="onSubmit"
          >
            <UFormField label="Nome" name="name">
              <UInput
                v-model="formState.name"
                placeholder="Nome da tag..."
                autofocus
                class="w-full"
              />
            </UFormField>

            <UFormField label="Cor" name="color">
              <USelect
                v-model="formState.color"
                :items="TAG_COLORS"
                value-key="value"
                class="w-full"
              />
            </UFormField>

            <div class="flex justify-end gap-2 pt-2">
              <UButton
                label="Cancelar"
                variant="ghost"
                @click="modalOpen = false"
              />
              <UButton
                :label="editingTag ? 'Salvar' : 'Criar'"
                type="submit"
              />
            </div>
          </UForm>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
