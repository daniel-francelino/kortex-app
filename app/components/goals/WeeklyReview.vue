<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { GoalReflection } from '~/types/goals'
import { formatDisplay } from '#shared/utils/dateTime'

const props = defineProps<{
  goalId: string
}>()

const { fetchReflection, saveReflection } = useGoalActions()

// Small, goal-specific duplicate of useHabits().getCurrentWeekKey() — same
// week model (Sunday-start, YYYY-Www), kept local since it's a few lines and
// this component has no other dependency on the habits composable.
function getCurrentWeekKey(): string {
  const now = new Date()
  const oneJan = new Date(now.getFullYear(), 0, 1)
  const days = Math.floor((now.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000))
  const weekNumber = Math.ceil((days + oneJan.getDay() + 1) / 7)
  return `${now.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`
}

function weekKeyToStartDate(weekKey: string): Date | null {
  const match = weekKey.match(/^(\d{4})-W(\d{2})$/)
  if (!match) return null

  const year = Number.parseInt(match[1]!, 10)
  const week = Number.parseInt(match[2]!, 10)
  const firstDayOfYear = new Date(year, 0, 1)
  const startOffset = (week - 1) * 7 - firstDayOfYear.getDay()
  return new Date(year, 0, 1 + startOffset)
}

function shiftWeekKey(weekKey: string, direction: 'prev' | 'next'): string {
  const startDate = weekKeyToStartDate(weekKey)
  if (!startDate) return weekKey

  startDate.setDate(startDate.getDate() + (direction === 'next' ? 7 : -7))
  const oneJan = new Date(startDate.getFullYear(), 0, 1)
  const days = Math.floor((startDate.getTime() - oneJan.getTime()) / (24 * 60 * 60 * 1000))
  const weekNumber = Math.ceil((days + oneJan.getDay() + 1) / 7)
  return `${startDate.getFullYear()}-W${String(weekNumber).padStart(2, '0')}`
}

const reviewPeriod = computed(() => {
  const startDate = weekKeyToStartDate(currentWeekKey.value)
  if (!startDate) return ''

  const endDate = new Date(startDate)
  endDate.setDate(startDate.getDate() + 6)

  return `${formatDisplay(startDate, 'dd/MM')} — ${formatDisplay(endDate, 'dd/MM')}`
})

const currentWeekKey = ref(getCurrentWeekKey())
const reflection = ref<GoalReflection | null>(null)
const loading = ref(false)
const isEditing = ref(false)

async function load() {
  loading.value = true
  try {
    reflection.value = await fetchReflection(props.goalId, currentWeekKey.value)
    isEditing.value = !reflection.value
  } finally {
    loading.value = false
  }
}

watch(currentWeekKey, load, { immediate: true })

function navigateWeek(direction: 'prev' | 'next') {
  currentWeekKey.value = shiftWeekKey(currentWeekKey.value, direction)
}

const schema = z.object({
  notes: z.string().max(2000).optional()
})

type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({ notes: '' })
const stillRelevant = ref<boolean | undefined>(undefined)

watch(reflection, (r) => {
  state.notes = r?.notes ?? ''
  stillRelevant.value = r?.stillRelevant ?? undefined
})

const submitting = ref(false)

async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (submitting.value) return
  submitting.value = true
  try {
    const result = await saveReflection(props.goalId, {
      weekKey: currentWeekKey.value,
      stillRelevant: stillRelevant.value,
      notes: event.data.notes
    })
    if (result) {
      reflection.value = result
      isEditing.value = false
    }
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Semana anterior"
          @click="navigateWeek('prev')"
        />
        <div>
          <p class="text-sm font-medium text-highlighted">
            Semana {{ currentWeekKey }}
          </p>
          <p class="text-xs text-muted">
            {{ reviewPeriod }}
          </p>
        </div>
        <UButton
          icon="i-lucide-chevron-right"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Próxima semana"
          @click="navigateWeek('next')"
        />
      </div>
      <UButton
        v-if="!isEditing && reflection && !loading"
        label="Editar"
        icon="i-lucide-pencil"
        color="neutral"
        variant="subtle"
        size="xs"
        @click="isEditing = true"
      />
    </div>

    <template v-if="loading">
      <USkeleton class="h-24 w-full" />
    </template>

    <!-- Read-only view -->
    <template v-else-if="!isEditing && reflection">
      <UCard>
        <div class="space-y-3">
          <div class="flex items-center gap-2">
            <UBadge
              :label="reflection.stillRelevant === false ? 'Não faz mais sentido' : 'Ainda faz sentido'"
              :color="reflection.stillRelevant === false ? 'warning' : 'success'"
              variant="subtle"
              size="sm"
            />
          </div>
          <p class="text-sm text-muted whitespace-pre-line">
            {{ reflection.notes || 'Nenhuma anotação para esta semana.' }}
          </p>
        </div>
      </UCard>
    </template>

    <!-- Form -->
    <template v-else>
      <UForm
        :schema="schema"
        :state="state"
        class="space-y-3"
        @submit="onSubmit"
      >
        <UFormField label="Essa meta ainda faz sentido?">
          <div class="flex gap-2">
            <UButton
              label="Sim"
              size="sm"
              :color="stillRelevant === true ? 'success' : 'neutral'"
              :variant="stillRelevant === true ? 'solid' : 'outline'"
              @click="stillRelevant = true"
            />
            <UButton
              label="Não"
              size="sm"
              :color="stillRelevant === false ? 'warning' : 'neutral'"
              :variant="stillRelevant === false ? 'solid' : 'outline'"
              @click="stillRelevant = false"
            />
          </div>
        </UFormField>

        <UFormField label="O que mudou desde a última revisão?" name="notes">
          <UTextarea
            v-model="state.notes"
            placeholder="Novos aprendizados, obstáculos, mudanças de prioridade..."
            class="w-full"
            :rows="3"
          />
        </UFormField>

        <div class="flex justify-end gap-2">
          <UButton
            v-if="reflection"
            label="Cancelar"
            icon="i-lucide-x"
            color="neutral"
            variant="subtle"
            @click="isEditing = false"
          />
          <UButton
            label="Salvar"
            icon="i-lucide-check"
            type="submit"
            :loading="submitting"
            :disabled="submitting"
          />
        </div>
      </UForm>
    </template>
  </div>
</template>
