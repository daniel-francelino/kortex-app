<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { GoalTimeCategory, GoalLifeCategory, GoalProgressType } from '~/types/goals'
import { GOAL_TEMPLATES, type GoalTemplate } from '~/utils/goal-templates'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': []
}>()

const { createGoal, createTask, timeCategoryOptions, lifeCategoryOptions, getLifeCategoryLabel } = useGoalActions()

const schema = z.object({
  title: z.string().min(1, 'Título é obrigatório').max(200),
  description: z.string().max(2000).optional(),
  timeCategory: z.nativeEnum(GoalTimeCategory).default(GoalTimeCategory.Monthly),
  lifeCategory: z.nativeEnum(GoalLifeCategory).default(GoalLifeCategory.Personal),
  progressType: z.nativeEnum(GoalProgressType).default(GoalProgressType.Tasks),
  targetValue: z.number().min(0).optional(),
  currentValue: z.number().min(0).default(0),
  unit: z.string().max(30).optional()
})

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({
  title: '',
  description: '',
  timeCategory: GoalTimeCategory.Monthly,
  lifeCategory: GoalLifeCategory.Personal,
  progressType: GoalProgressType.Tasks,
  targetValue: undefined,
  currentValue: 0,
  unit: ''
})

const progressTypeOptions = [
  { label: 'Por tarefas', value: GoalProgressType.Tasks },
  { label: 'Numérico', value: GoalProgressType.Numeric },
  { label: 'Monetário', value: GoalProgressType.Monetary }
]

const selectedEmoji = ref<string | null>(null)
const loading = ref(false)

// ─── Templates ────────────────────────────────────────────────────────────────
const modalMode = ref<'custom' | 'template'>('custom')
const templateFilter = ref<GoalLifeCategory | undefined>(undefined)
const pendingTemplateTasks = ref<string[]>([])

const modeItems = [
  { label: 'Personalizado', value: 'custom' },
  { label: 'Começar de um template', value: 'template' }
]

const templateFilterOptions = computed(() => [
  { label: 'Todas as áreas', value: undefined },
  ...lifeCategoryOptions.map(o => ({ label: o.label, value: o.value }))
])

const filteredTemplates = computed(() =>
  templateFilter.value
    ? GOAL_TEMPLATES.filter(t => t.lifeCategory === templateFilter.value)
    : GOAL_TEMPLATES
)

function applyTemplate(template: GoalTemplate) {
  state.title = template.title
  state.description = template.description
  state.timeCategory = template.timeCategory
  state.lifeCategory = template.lifeCategory
  selectedEmoji.value = template.emoji
  pendingTemplateTasks.value = [...template.tasks]
  modalMode.value = 'custom'
}

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (loading.value) return
  loading.value = true
  try {
    const result = await createGoal({
      ...event.data,
      emoji: selectedEmoji.value,
      targetValue: event.data.progressType === GoalProgressType.Tasks ? undefined : (event.data.targetValue ?? null),
      unit: event.data.progressType === GoalProgressType.Tasks ? undefined : (event.data.unit || null)
    })
    if (result) {
      for (const taskTitle of pendingTemplateTasks.value) {
        await createTask(result.id, { title: taskTitle })
      }
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
  state.progressType = GoalProgressType.Tasks
  state.targetValue = undefined
  state.currentValue = 0
  state.unit = ''
  selectedEmoji.value = null
  modalMode.value = 'custom'
  templateFilter.value = undefined
  pendingTemplateTasks.value = []
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
      <UTabs
        :items="modeItems"
        :model-value="modalMode"
        class="mb-4"
        @update:model-value="modalMode = $event as 'custom' | 'template'"
      />

      <!-- Template gallery -->
      <div v-if="modalMode === 'template'" class="space-y-3">
        <USelect
          v-model="templateFilter"
          :items="templateFilterOptions"
          value-key="value"
          placeholder="Filtrar por área"
          class="w-full"
        />
        <div class="grid max-h-96 gap-2 overflow-y-auto sm:grid-cols-2">
          <button
            v-for="template in filteredTemplates"
            :key="template.id"
            type="button"
            class="flex flex-col items-start gap-1 rounded-xl border border-default p-3 text-left transition-colors hover:bg-elevated"
            @click="applyTemplate(template)"
          >
            <span class="text-2xl">{{ template.emoji }}</span>
            <p class="text-sm font-medium text-highlighted">
              {{ template.title }}
            </p>
            <p class="text-xs text-muted">
              {{ getLifeCategoryLabel(template.lifeCategory) }}
            </p>
          </button>
        </div>
      </div>

      <template v-else>
        <!-- Emoji picker -->
        <div class="flex flex-col items-center gap-1.5 pb-4">
          <GoalsEmojiPicker v-model="selectedEmoji" />
          <span class="text-xs text-muted">Ícone (opcional)</span>
        </div>

        <p v-if="pendingTemplateTasks.length > 0" class="mb-4 text-xs text-muted">
          {{ pendingTemplateTasks.length }} tarefa(s) sugerida(s) do template serão criadas junto com a meta.
        </p>

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

          <UFormField label="Tipo de progresso" name="progressType">
            <USelect
              v-model="state.progressType"
              :items="progressTypeOptions"
              value-key="value"
              class="w-full"
            />
          </UFormField>

          <div v-if="state.progressType !== GoalProgressType.Tasks" class="grid gap-4 sm:grid-cols-3">
            <UFormField label="Valor atual" name="currentValue">
              <UInputNumber v-model="state.currentValue" :min="0" class="w-full" />
            </UFormField>
            <UFormField label="Meta" name="targetValue">
              <UInputNumber v-model="state.targetValue" :min="0" class="w-full" />
            </UFormField>
            <UFormField label="Unidade" name="unit">
              <UInput v-model="state.unit" placeholder="Ex: livros, R$, km" class="w-full" />
            </UFormField>
          </div>

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
    </template>
  </UModal>
</template>
