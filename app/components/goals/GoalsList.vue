<script setup lang="ts">
import type { Goal } from '~/types/goals'
import { GoalLifeCategory, GoalStatus, GoalTimeCategory } from '~/types/goals'

const _props = defineProps<{
  goals: Goal[]
  total: number
  page: number
  pageSize: number
  loading: boolean
}>()

const emit = defineEmits<{
  'update:page': [value: number]
  'select': [goalId: string]
  'edit': [goal: Goal]
  'archive': [goal: Goal]
  'complete': [goal: Goal]
  'restore': [goal: Goal]
}>()

type BadgeColor = 'success' | 'error' | 'primary' | 'secondary' | 'info' | 'warning' | 'neutral'

const timeCategoryLabels: Record<string, string> = {
  [GoalTimeCategory.Daily]: 'Diário',
  [GoalTimeCategory.Weekly]: 'Semanal',
  [GoalTimeCategory.Monthly]: 'Mensal',
  [GoalTimeCategory.Quarterly]: 'Trimestral',
  [GoalTimeCategory.Yearly]: 'Anual',
  [GoalTimeCategory.LongTerm]: 'Longo prazo'
}

const lifeCategoryLabels: Record<string, string> = {
  [GoalLifeCategory.Personal]: 'Pessoal',
  [GoalLifeCategory.Career]: 'Carreira',
  [GoalLifeCategory.Health]: 'Saúde',
  [GoalLifeCategory.Finance]: 'Finanças',
  [GoalLifeCategory.Spiritual]: 'Espiritual',
  [GoalLifeCategory.Learning]: 'Aprendizado',
  [GoalLifeCategory.Relationships]: 'Relacionamentos',
  [GoalLifeCategory.Lifestyle]: 'Estilo de vida'
}

const statusLabels: Record<string, string> = {
  [GoalStatus.Active]: 'Ativa',
  [GoalStatus.Completed]: 'Concluída',
  [GoalStatus.Archived]: 'Arquivada'
}

function getTimeCategoryLabel(value: string): string {
  return timeCategoryLabels[value] ?? value
}

function getLifeCategoryLabel(value: string): string {
  return lifeCategoryLabels[value] ?? value
}

function getStatusLabel(value: string): string {
  return statusLabels[value] ?? value
}

function getStatusColor(status: string): BadgeColor {
  switch (status) {
    case GoalStatus.Active: return 'primary'
    case GoalStatus.Completed: return 'success'
    case GoalStatus.Archived: return 'neutral'
    default: return 'neutral'
  }
}

function getRowItems(goal: Goal) {
  const items = [
    {
      label: 'Editar',
      icon: 'i-lucide-pencil',
      onSelect: () => emit('edit', goal)
    }
  ]

  if (goal.status === GoalStatus.Active) {
    items.push({
      label: 'Concluir',
      icon: 'i-lucide-check-circle',
      onSelect: () => emit('complete', goal)
    })
  }

  if (goal.status === GoalStatus.Archived) {
    items.push({
      label: 'Restaurar',
      icon: 'i-lucide-rotate-ccw',
      onSelect: () => emit('restore', goal)
    })
  } else {
    items.push({
      label: 'Arquivar',
      icon: 'i-lucide-archive',
      onSelect: () => emit('archive', goal)
    })
  }

  return items
}
</script>

<template>
  <div class="space-y-4">
    <!-- Loading skeletons -->
    <template v-if="loading">
      <UCard v-for="i in 6" :key="i">
        <div class="flex items-center gap-3">
          <USkeleton class="size-9 rounded-xl shrink-0" />
          <div class="flex-1 space-y-2">
            <USkeleton class="h-4 w-2/3" />
            <USkeleton class="h-3 w-1/3" />
          </div>
          <USkeleton class="h-5 w-16 rounded-full" />
          <USkeleton class="h-2 w-24 rounded-full" />
        </div>
      </UCard>
    </template>

    <!-- Goals list -->
    <template v-else-if="goals.length > 0">
      <UCard
        v-for="goal in goals"
        :key="goal.id"
        class="cursor-pointer transition-colors hover:bg-elevated/50"
        @click="emit('select', goal.id)"
      >
        <div class="flex flex-wrap items-center gap-3">
          <!-- Cover thumbnail / emoji avatar -->
          <div class="size-9 rounded-xl flex items-center justify-center shrink-0 bg-elevated border border-default overflow-hidden">
            <img
              v-if="goal.coverImageUrl"
              :src="goal.coverImageUrl"
              alt=""
              class="size-full object-cover"
            >
            <span v-else-if="goal.emoji" class="text-xl leading-none select-none">{{ goal.emoji }}</span>
            <UIcon v-else name="i-lucide-target" class="size-4 text-muted" />
          </div>

          <div class="flex-1 min-w-0">
            <p class="font-medium text-highlighted truncate">
              {{ goal.title }}
            </p>
            <p class="text-xs text-muted truncate mt-0.5">
              {{ getLifeCategoryLabel(goal.lifeCategory) }} · {{ getTimeCategoryLabel(goal.timeCategory) }}
            </p>
          </div>

          <UDropdownMenu
            :items="getRowItems(goal)"
            :content="{ align: 'end' }"
            class="shrink-0 sm:order-last"
          >
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              size="xs"
              @click.stop
            />
          </UDropdownMenu>

          <!-- Status + progress — full width row on mobile (forces a wrap under the title), inline on larger screens -->
          <div class="flex w-full items-center gap-3 pl-12 sm:w-auto sm:shrink-0 sm:pl-0">
            <UBadge
              :label="getStatusLabel(goal.status)"
              :color="getStatusColor(goal.status)"
              variant="subtle"
              size="xs"
              class="shrink-0"
            />

            <div class="flex flex-1 items-center gap-2 sm:max-w-40">
              <UProgress
                :model-value="Number(goal.progress)"
                :max="100"
                size="xs"
                class="flex-1"
              />
              <span class="text-xs text-muted tabular-nums w-8 text-right shrink-0">
                {{ Math.round(goal.progress) }}%
              </span>
            </div>
          </div>
        </div>
      </UCard>
    </template>

    <!-- Empty state -->
    <div v-else class="flex flex-col items-center justify-center py-12 gap-3">
      <UIcon name="i-lucide-target" class="size-12 text-dimmed" />
      <p class="text-sm text-muted">
        Nenhuma meta encontrada
      </p>
    </div>

    <!-- Pagination -->
    <div v-if="total > pageSize" class="flex justify-center pt-2">
      <UPagination
        :model-value="page"
        :total="total"
        :items-per-page="pageSize"
        @update:model-value="emit('update:page', $event)"
      />
    </div>
  </div>
</template>
