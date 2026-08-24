<script setup lang="ts">
import type { IdeaList, IdeaTag, IdeaPriority } from '~/types/ideas'
import { IdeaStatus } from '~/types/ideas'
import { z } from 'zod'

const props = defineProps<{
  open: boolean
  lists: IdeaList[]
  tags: IdeaTag[]
}>()

const emit = defineEmits<{
  'update:open': [val: boolean]
  'saved': [idea: { id: string }]
}>()

const { createIdea, statusOptions, priorityOptions } = useIdeas()

const schema = z.object({
  title: z.string().min(1, { message: 'Título é obrigatório' }).max(500),
  description: z.string().max(10000).optional(),
  status: z.nativeEnum(IdeaStatus).default(IdeaStatus.Backlog),
  priority: z.string().optional(),
  listId: z.string().optional(),
  dueDate: z.string().optional()
})

const formState = reactive({
  title: '',
  description: '',
  status: IdeaStatus.Backlog as IdeaStatus,
  priority: '',
  listId: '',
  dueDate: '',
  tagIds: [] as string[]
})

const submitting = ref(false)

const listOptions = computed(() => [
  { label: 'Sem lista', value: '' },
  ...props.lists.map(l => ({ label: l.name, value: l.id }))
])

const tagSelectOptions = computed(() =>
  props.tags.map(t => ({ label: `#${t.name}`, value: t.id }))
)

const prioritySelectOptions = computed(() => [
  { label: 'Sem prioridade', value: '' },
  ...priorityOptions
])

async function onSubmit(): Promise<void> {
  submitting.value = true
  try {
    const idea = await createIdea({
      title: formState.title,
      description: formState.description || undefined,
      status: formState.status,
      priority: formState.priority ? formState.priority as IdeaPriority : undefined,
      listId: formState.listId || undefined,
      dueDate: formState.dueDate || undefined,
      tagIds: formState.tagIds.length > 0 ? formState.tagIds : undefined
    })
    if (idea) {
      // Reset form
      formState.title = ''
      formState.description = ''
      formState.status = IdeaStatus.Backlog
      formState.priority = ''
      formState.listId = ''
      formState.dueDate = ''
      formState.tagIds = []
      emit('saved', idea)
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <UModal
    :open="open"
    @update:open="emit('update:open', $event)"
  >
    <template #content>
      <UCard>
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-lightbulb" class="size-5 text-primary" />
            <h3 class="text-lg font-semibold text-highlighted">
              Nova Ideia
            </h3>
          </div>
        </template>

        <UForm
          :schema="schema"
          :state="formState"
          class="space-y-4"
          @submit="onSubmit"
        >
          <UFormField label="Título" name="title">
            <UInput
              v-model="formState.title"
              placeholder="O que você tem em mente?"
              autofocus
              class="w-full"
            />
          </UFormField>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <UFormField label="Status" name="status">
              <USelect
                v-model="formState.status"
                :items="statusOptions"
                value-key="value"
                size="sm"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Prioridade" name="priority">
              <USelect
                v-model="formState.priority"
                :items="prioritySelectOptions"
                value-key="value"
                size="sm"
                class="w-full"
              />
            </UFormField>
          </div>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <UFormField label="Lista" name="listId">
              <USelect
                v-model="formState.listId"
                :items="listOptions"
                value-key="value"
                size="sm"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Data" name="dueDate">
              <input
                v-model="formState.dueDate"
                type="date"
                class="w-full text-sm bg-transparent border border-default rounded-md px-3 py-1.5 outline-none focus:ring-1 focus:ring-primary text-default"
              >
            </UFormField>
          </div>

          <UFormField label="Tags">
            <USelect
              v-model="formState.tagIds"
              :items="tagSelectOptions"
              value-key="value"
              multiple
              size="sm"
              placeholder="Selecionar tags..."
              class="w-full"
            />
          </UFormField>

          <UFormField label="Descrição" name="description">
            <UTextarea
              v-model="formState.description"
              placeholder="Descreva sua ideia em detalhes..."
              :rows="3"
              class="w-full"
            />
          </UFormField>

          <div class="flex justify-end gap-2 pt-2">
            <UButton
              label="Cancelar"
              variant="ghost"
              @click="emit('update:open', false)"
            />
            <UButton
              label="Criar"
              type="submit"
              :loading="submitting"
            />
          </div>
        </UForm>
      </UCard>
    </template>
  </UModal>
</template>
