<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { GoalTimeCategory, GoalLifeCategory } from '~/types/goals'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': []
}>()

const { createGoal, timeCategoryOptions, lifeCategoryOptions } = useGoalActions()

const schema = z.object({
  title: z.string().min(1, 'Título é obrigatório').max(200),
  description: z.string().max(2000).optional(),
  timeCategory: z.nativeEnum(GoalTimeCategory).default(GoalTimeCategory.Monthly),
  lifeCategory: z.nativeEnum(GoalLifeCategory).default(GoalLifeCategory.Personal)
})

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({
  title: '',
  description: '',
  timeCategory: GoalTimeCategory.Monthly,
  lifeCategory: GoalLifeCategory.Personal
})

const selectedEmoji = ref<string | null>(null)
const loading = ref(false)

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (loading.value) return
  loading.value = true
  try {
    const result = await createGoal({ ...event.data, emoji: selectedEmoji.value })
    if (result) {
      resetForm()
      emit('saved')
      emit('update:open', false)
    }
  } finally {
    loading.value = false
  }
}

function resetForm() {
  state.title = ''
  state.description = ''
  state.timeCategory = GoalTimeCategory.Monthly
  state.lifeCategory = GoalLifeCategory.Personal
  selectedEmoji.value = null
}

function onClose() {
  emit('update:open', false)
}
</script>

<template>
  <UModal
    :open="props.open"
    title="Nova meta"
    description="Defina uma meta clara e alcançável."
    @update:open="onClose"
  >
    <template #body>
      <!-- Emoji picker -->
      <div class="flex flex-col items-center gap-1.5 pb-4">
        <GoalsEmojiPicker v-model="selectedEmoji" />
        <span class="text-xs text-muted">Ícone (opcional)</span>
      </div>

      <UForm
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField label="Título" name="title">
          <UInput
            v-model="state.title"
            placeholder="Ex: Aprender inglês"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Descrição" name="description">
          <UTextarea
            v-model="state.description"
            placeholder="Descreva o que deseja alcançar"
            class="w-full"
            :rows="3"
          />
        </UFormField>

        <UFormField label="Prazo" name="timeCategory">
          <USelect
            v-model="state.timeCategory"
            :items="timeCategoryOptions"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Área da vida" name="lifeCategory">
          <USelect
            v-model="state.lifeCategory"
            :items="lifeCategoryOptions"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <div class="flex justify-end gap-2 pt-2">
          <UButton
            label="Cancelar"
            color="neutral"
            variant="subtle"
            @click="onClose"
          />
          <UButton
            label="Criar meta"
            type="submit"
            :loading="loading"
            :disabled="loading"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
