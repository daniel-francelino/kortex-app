<script setup lang="ts">
import type { IdeaList } from '~/types/ideas'
import { z } from 'zod'

const { lists, createList, updateList, deleteList } = useIdeas()

const emit = defineEmits<{
  'filter-list': [listId: string]
}>()

const modalOpen = ref(false)
const editingList = ref<IdeaList | null>(null)
const deleting = ref<string | null>(null)

const LIST_COLORS = [
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
  editingList.value = null
  formState.name = ''
  formState.color = ''
  modalOpen.value = true
}

function openEdit(list: IdeaList): void {
  editingList.value = list
  formState.name = list.name
  formState.color = list.color ?? ''
  modalOpen.value = true
}

async function onSubmit(): Promise<void> {
  const payload = { name: formState.name, color: formState.color || undefined }
  if (editingList.value) {
    const success = await updateList(editingList.value.id, payload)
    if (success) modalOpen.value = false
  } else {
    const result = await createList(payload)
    if (result) modalOpen.value = false
  }
}

async function onDelete(list: IdeaList): Promise<void> {
  deleting.value = list.id
  await deleteList(list.id)
  deleting.value = null
}

const COLOR_MAP: Record<string, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  yellow: 'bg-yellow-500',
  green: 'bg-green-500',
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
  pink: 'bg-pink-500'
}

function getColorClass(color: string | null | undefined): string {
  if (!color) return 'bg-primary'
  return COLOR_MAP[color] ?? 'bg-primary'
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-semibold text-highlighted">
        <UIcon name="i-lucide-folder" class="size-4 mr-1 inline" />
        Listas
      </h3>
      <UButton
        icon="i-lucide-plus"
        size="xs"
        variant="ghost"
        @click="openCreate"
      />
    </div>

    <!-- All ideas filter -->
    <button
      class="w-full text-left rounded px-2 py-1.5 text-sm text-default hover:bg-elevated transition-colors mb-1"
      @click="emit('filter-list', '')"
    >
      <UIcon name="i-lucide-layers" class="size-3.5 mr-1.5 inline text-muted" />
      Todas as ideias
    </button>

    <div v-if="lists && lists.length > 0" class="space-y-0.5">
      <div
        v-for="list in lists"
        :key="list.id"
        class="flex items-center justify-between rounded px-2 py-1.5 hover:bg-elevated group"
      >
        <button
          class="flex items-center gap-2 flex-1 min-w-0"
          @click="emit('filter-list', list.id)"
        >
          <span :class="getColorClass(list.color)" class="inline-block size-2.5 rounded-full shrink-0" />
          <span class="text-sm text-default truncate">{{ list.name }}</span>
          <UBadge size="xs" color="neutral" variant="subtle">
            {{ list.ideaCount ?? 0 }}
          </UBadge>
        </button>
        <div class="flex items-center gap-0.5 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100">
          <UButton
            icon="i-lucide-pencil"
            size="xs"
            variant="ghost"
            @click.stop="openEdit(list)"
          />
          <UButton
            icon="i-lucide-trash-2"
            size="xs"
            color="error"
            variant="ghost"
            :loading="deleting === list.id"
            @click.stop="onDelete(list)"
          />
        </div>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <UModal v-model:open="modalOpen">
      <template #content>
        <UCard>
          <template #header>
            <h3 class="text-lg font-semibold text-highlighted">
              {{ editingList ? 'Editar Lista' : 'Nova Lista' }}
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
                placeholder="Nome da lista..."
                autofocus
                class="w-full"
              />
            </UFormField>

            <UFormField label="Cor" name="color">
              <USelect
                v-model="formState.color"
                :items="LIST_COLORS"
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
                :label="editingList ? 'Salvar' : 'Criar'"
                type="submit"
              />
            </div>
          </UForm>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
