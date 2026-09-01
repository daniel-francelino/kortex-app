<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { HabitReflection } from '~/types/habits'
import { formatDisplay } from '#shared/utils/dateTime'

const props = defineProps<{
  weekKey: string
  existingReflection?: HabitReflection | null
  editable?: boolean
  loading?: boolean
  onSave?: (payload: { weekKey: string, wins?: string, improvements?: string }) => Promise<boolean>
}>()

const emit = defineEmits<{
  'navigate-week': [direction: 'prev' | 'next']
}>()

const canEdit = computed(() => props.editable !== false)

const schema = z.object({
  wins: z.string().max(2000).optional(),
  improvements: z.string().max(2000).optional()
})

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({
  wins: '',
  improvements: ''
})

const isEditing = ref(canEdit.value && !props.existingReflection)

watch(canEdit, (editable) => {
  if (!editable) {
    isEditing.value = false
    return
  }
  if (!props.existingReflection) {
    isEditing.value = true
  }
})

watch(() => props.existingReflection, (reflection) => {
  if (reflection) {
    state.wins = reflection.wins ?? ''
    state.improvements = reflection.improvements ?? ''
    isEditing.value = false
  } else {
    state.wins = ''
    state.improvements = ''
    isEditing.value = canEdit.value
  }
}, { immediate: true })

const reviewPeriod = computed(() => {
  const match = props.weekKey.match(/^(\d{4})-W(\d{2})$/)
  if (!match) {
    return { dateRangeLabel: '' }
  }

  const year = Number.parseInt(match[1]!, 10)
  const week = Number.parseInt(match[2]!, 10)
  if (!Number.isFinite(year) || !Number.isFinite(week) || week < 1) {
    return { dateRangeLabel: '' }
  }

  const firstDayOfYear = new Date(year, 0, 1)
  const firstDayWeekday = firstDayOfYear.getDay()

  // Same week model used in getCurrentWeekKey(): weeks start on Sunday and are keyed as YYYY-Www.
  const startOffset = (week - 1) * 7 - firstDayWeekday
  const startDate = new Date(year, 0, 1 + startOffset)
  const endDate = new Date(startDate)
  endDate.setDate(startDate.getDate() + 6)

  const currentYear = new Date().getFullYear()
  const shouldShowYear = startDate.getFullYear() !== currentYear || endDate.getFullYear() !== currentYear

  const dateFormat = shouldShowYear ? 'dd/MM/yyyy' : 'dd/MM'

  return {
    dateRangeLabel: `${formatDisplay(startDate, dateFormat)} — ${formatDisplay(endDate, dateFormat)}`
  }
})

const submitting = ref(false)

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (submitting.value) return
  if (!props.onSave) return
  submitting.value = true
  try {
    const ok = await props.onSave({
      weekKey: props.weekKey,
      wins: event.data.wins,
      improvements: event.data.improvements
    })
    if (ok) {
      isEditing.value = false
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Header with week arrows -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Semana anterior"
          @click="emit('navigate-week', 'prev')"
        />
        <div>
          <h3 class="font-semibold text-highlighted">
            Revisão Semanal
          </h3>
          <p class="text-sm text-muted">
            Semana {{ props.weekKey }}
          </p>
          <p class="text-xs text-muted">
            {{ reviewPeriod.dateRangeLabel }}
          </p>
        </div>
        <UButton
          icon="i-lucide-chevron-right"
          color="neutral"
          variant="ghost"
          size="sm"
          aria-label="Próxima semana"
          @click="emit('navigate-week', 'next')"
        />
      </div>
      <UButton
        v-if="canEdit && !isEditing && existingReflection && !props.loading"
        label="Editar"
        icon="i-lucide-pencil"
        color="neutral"
        variant="subtle"
        size="sm"
        @click="isEditing = true"
      />
    </div>

    <!-- Loading skeleton -->
    <template v-if="props.loading">
      <UCard>
        <div class="space-y-4">
          <USkeleton class="h-4 w-32" />
          <USkeleton class="h-20 w-full" />
          <USkeleton class="h-4 w-32" />
          <USkeleton class="h-20 w-full" />
        </div>
      </UCard>
    </template>

    <!-- Read-only view -->
    <template v-else-if="!isEditing && existingReflection">
      <UCard>
        <div class="space-y-4">
          <div>
            <p class="text-sm font-medium text-highlighted">
              O que deu certo?
            </p>
            <p class="text-sm text-muted mt-1 whitespace-pre-line">
              {{ existingReflection.wins || '—' }}
            </p>
          </div>
          <div>
            <p class="text-sm font-medium text-highlighted">
              O que posso melhorar?
            </p>
            <p class="text-sm text-muted mt-1 whitespace-pre-line">
              {{ existingReflection.improvements || '—' }}
            </p>
          </div>
        </div>
      </UCard>
    </template>

    <!-- Form -->
    <template v-else-if="canEdit">
      <UForm
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField label="O que deu certo esta semana?" name="wins">
          <UTextarea
            v-model="state.wins"
            placeholder="Completei todos os hábitos na segunda e terça..."
            class="w-full"
            :rows="3"
          />
        </UFormField>

        <UFormField label="O que posso melhorar?" name="improvements">
          <UTextarea
            v-model="state.improvements"
            placeholder="Na quarta perdi o ritmo porque..."
            class="w-full"
            :rows="3"
          />
        </UFormField>

        <div class="flex justify-end gap-2">
          <UButton
            v-if="existingReflection"
            icon="i-lucide-x"
            label="Cancelar"
            color="neutral"
            variant="subtle"
            @click="isEditing = false"
          />
          <UButton
            icon="i-lucide-check"
            label="Salvar"
            type="submit"
            :loading="submitting"
            :disabled="submitting"
          />
        </div>
      </UForm>
    </template>

    <!-- No reflection, not editable -->
    <template v-else>
      <UCard>
        <div class="flex flex-col items-center gap-2 py-4">
          <UIcon name="i-lucide-notebook-pen" class="size-8 text-dimmed" />
          <p class="text-sm text-muted">
            Nenhuma reflexão registrada para esta semana.
          </p>
        </div>
      </UCard>
    </template>
  </div>
</template>
