<script setup lang="ts">
import type { SchedulingQuestion } from '~/types/scheduling'
import { SchedulingQuestionType } from '~/types/scheduling'

const props = defineProps<{
  open: boolean
  question: Omit<SchedulingQuestion, 'id'> | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'save': [value: Omit<SchedulingQuestion, 'id'>]
  'remove': []
}>()

const label = ref('')
const type = ref<SchedulingQuestionType>(SchedulingQuestionType.Text)
const isRequired = ref(false)
const options = ref<string[]>([])
const newOption = ref('')

const questionTypeOptions = [
  { label: 'Texto curto', value: SchedulingQuestionType.Text },
  { label: 'Texto longo', value: SchedulingQuestionType.Textarea },
  { label: 'Seleção', value: SchedulingQuestionType.Select }
]

watch(() => [props.open, props.question] as const, ([open, question]) => {
  if (!open) return
  label.value = question?.label ?? ''
  type.value = question?.type ?? SchedulingQuestionType.Text
  isRequired.value = question?.isRequired ?? false
  options.value = [...(question?.options ?? [])]
  newOption.value = ''
}, { immediate: true })

const canSave = computed(() => {
  if (!label.value.trim()) return false
  if (type.value === SchedulingQuestionType.Select && options.value.length < 2) return false
  return true
})

function addOption() {
  const value = newOption.value.trim()
  if (!value) return
  options.value.push(value)
  newOption.value = ''
}

function removeOption(index: number) {
  options.value.splice(index, 1)
}

function onSave() {
  if (!canSave.value) return
  emit('save', {
    label: label.value.trim(),
    type: type.value,
    isRequired: isRequired.value,
    isHidden: false,
    options: type.value === SchedulingQuestionType.Select ? options.value : null,
    sortOrder: 0
  })
}
</script>

<template>
  <USlideover :open="open" title="Editar pergunta" @update:open="emit('update:open', $event)">
    <template #body>
      <div class="space-y-4">
        <UFormField label="Rótulo">
          <UInput
            v-model="label"
            placeholder="Ex.: De que se trata esta reunião?"
            class="w-full"
            autofocus
          />
        </UFormField>

        <UFormField label="Tipo">
          <USelect
            v-model="type"
            :items="questionTypeOptions"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <div v-if="type === SchedulingQuestionType.Select" class="space-y-2">
          <p class="text-sm font-medium text-highlighted">
            Opções
          </p>
          <div v-for="(opt, i) in options" :key="i" class="flex items-center gap-2">
            <UInput v-model="options[i]" size="sm" class="flex-1" />
            <UButton
              icon="i-lucide-x"
              size="xs"
              color="neutral"
              variant="ghost"
              @click="removeOption(i)"
            />
          </div>
          <div class="flex items-center gap-2">
            <UInput
              v-model="newOption"
              placeholder="Nova opção"
              size="sm"
              class="flex-1"
              @keyup.enter="addOption"
            />
            <UButton
              icon="i-lucide-plus"
              size="xs"
              color="neutral"
              variant="subtle"
              @click="addOption"
            />
          </div>
          <p v-if="options.length < 2" class="text-xs text-warning">
            Adicione ao menos 2 opções.
          </p>
        </div>

        <UCheckbox v-model="isRequired" label="Obrigatória" />
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <UButton
          v-if="question"
          label="Excluir pergunta"
          color="error"
          variant="ghost"
          size="sm"
          @click="emit('remove')"
        />
        <div v-else />
        <div class="flex gap-2">
          <UButton
            label="Cancelar"
            color="neutral"
            variant="outline"
            @click="emit('update:open', false)"
          />
          <UButton label="Salvar" :disabled="!canSave" @click="onSave" />
        </div>
      </div>
    </template>
  </USlideover>
</template>
