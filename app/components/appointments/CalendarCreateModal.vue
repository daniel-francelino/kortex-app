<script setup lang="ts">
import { z } from 'zod'
import type { Calendar, CalendarVisibility } from '~/types/appointments'

const props = defineProps<{
  open: boolean
  calendars: Calendar[] | null | undefined
  calendar?: Calendar | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'created': []
  'updated': []
}>()

const { createCalendar, updateCalendar } = useAppointments()

const schema = z.object({
  name: z.string().min(1, 'Nome Ã© obrigatÃ³rio').max(100),
  description: z.string().max(500).optional(),
  color: z.string().max(20).optional(),
  visibility: z.enum(['private', 'shared', 'public']).default('private')
})

type FormState = z.infer<typeof schema>

const state = reactive<FormState>({
  name: '',
  description: '',
  color: '#10b981',
  visibility: 'private'
})

const loading = ref(false)
const isEditing = computed(() => Boolean(props.calendar))

const colorOptions = [
  { label: 'Verde', value: '#10b981' },
  { label: 'Azul', value: '#3b82f6' },
  { label: 'Amarelo', value: '#f59e0b' },
  { label: 'Vermelho', value: '#ef4444' },
  { label: 'Roxo', value: '#8b5cf6' },
  { label: 'Rosa', value: '#ec4899' }
]

async function onSubmit() {
  if (loading.value) return
  loading.value = true
  try {
    if (props.calendar) {
      const success = await updateCalendar(props.calendar.id, {
        name: state.name,
        description: state.description || null,
        color: state.color || null,
        visibility: state.visibility as CalendarVisibility
      })

      if (success) {
        emit('update:open', false)
        emit('updated')
      }

      return
    }

    const result = await createCalendar({
      name: state.name,
      description: state.description || undefined,
      color: state.color || undefined,
      visibility: state.visibility as CalendarVisibility
    })

    if (result) {
      state.name = ''
      state.description = ''
      state.color = '#10b981'
      state.visibility = 'private'
      emit('update:open', false)
      emit('created')
    }
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.open, props.calendar] as const,
  ([open, calendar]) => {
    if (!open) return

    state.name = calendar?.name ?? ''
    state.description = calendar?.description ?? ''
    state.color = calendar?.color ?? '#10b981'
    state.visibility = calendar?.visibility ?? 'private'
  },
  { immediate: true }
)
</script>

<template>
  <UModal
    :open="open"
    :title="isEditing ? 'Editar calendário' : 'Novo calendário'"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <UForm
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField
          label="Nome"
          name="name"
        >
          <UInput
            v-model="state.name"
            placeholder="Ex.: Trabalho, Pessoal..."
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="DescriÃ§Ã£o"
          name="description"
        >
          <UTextarea
            v-model="state.description"
            placeholder="DescriÃ§Ã£o opcional"
            :rows="2"
            class="w-full"
          />
        </UFormField>

        <UFormField
          label="Cor"
          name="color"
        >
          <div class="flex gap-2">
            <button
              v-for="opt in colorOptions"
              :key="opt.value"
              type="button"
              class="size-8 rounded-full ring-2 ring-offset-2 ring-offset-default transition-all"
              :class="state.color === opt.value ? 'ring-primary' : 'ring-transparent'"
              :style="{ backgroundColor: opt.value }"
              :title="opt.label"
              @click="state.color = opt.value"
            />
          </div>
        </UFormField>

        <div class="flex justify-end gap-2 pt-2">
          <UButton
            label="Cancelar"
            variant="outline"
            @click="emit('update:open', false)"
          />
          <UButton
            type="submit"
            :label="isEditing ? 'Salvar' : 'Criar'"
            :loading="loading"
            :disabled="loading"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
