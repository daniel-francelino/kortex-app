<script setup lang="ts">
import type { JournalInsights } from '~/types/journal'
import { getMoodOptionByScore } from '~/types/journal'

const props = defineProps<{
  insights: JournalInsights | null
  loading: boolean
}>()

const emit = defineEmits<{
  rangeChange: [range: '7d' | '30d' | '90d']
}>()

const rangeOptions = [
  { label: '7 dias', value: '7d' },
  { label: '30 dias', value: '30d' },
  { label: '90 dias', value: '90d' }
]

const selectedRange = ref('30d')

watch(selectedRange, (val) => {
  emit('rangeChange', val as '7d' | '30d' | '90d')
})

const isMobile = useIsMobile()

const _props = props
</script>

<template>
  <div class="space-y-6">
    <!-- Range selector -->
    <div class="flex items-center justify-between">
      <h4 class="text-sm font-medium text-highlighted">
        Insights do Diário
      </h4>
      <USelect
        v-model="selectedRange"
        :items="rangeOptions"
        value-key="value"
        :size="isMobile ? 'lg' : 'sm'"
        class="min-w-28"
      />
    </div>

    <!-- Loading -->
    <template v-if="_props.loading">
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <UCard
          v-for="i in 3"
          :key="i"
        >
          <div class="text-center space-y-2">
            <USkeleton class="h-8 w-12 mx-auto" />
            <USkeleton class="h-3 w-16 mx-auto" />
          </div>
        </UCard>
      </div>
      <UCard>
        <div class="space-y-3">
          <USkeleton class="h-4 w-32" />
          <USkeleton
            v-for="i in 4"
            :key="i"
            class="h-6 w-full"
          />
        </div>
      </UCard>
    </template>

    <template v-else-if="_props.insights">
      <!-- Total entries -->
      <UCard>
        <div class="text-center">
          <p class="text-3xl font-bold text-highlighted">
            {{ _props.insights.totalEntries }}
          </p>
          <p class="text-xs text-muted">
            Entradas no período
          </p>
        </div>
      </UCard>

      <!-- Metric averages -->
      <div
        v-if="_props.insights.metrics.length > 0"
        class="grid grid-cols-2 gap-3 sm:grid-cols-3"
      >
        <UCard
          v-for="metric in _props.insights.metrics"
          :key="metric.key"
        >
          <div class="text-center">
            <p class="text-2xl font-bold text-highlighted">
              {{ metric.avg }}
            </p>
            <p class="text-xs text-muted">
              {{ metric.name }} (média)
            </p>
            <p class="text-xs text-dimmed">
              {{ metric.min }}–{{ metric.max }} · {{ metric.count }} registros
            </p>
          </div>
        </UCard>
      </div>

      <!-- Entries by day of week -->
      <UCard v-if="_props.insights.entriesByDayOfWeek.length > 0">
        <template #header>
          <h4 class="text-sm font-medium text-highlighted">
            Entradas por dia da semana
          </h4>
        </template>

        <div class="space-y-2">
          <div
            v-for="day in _props.insights.entriesByDayOfWeek"
            :key="day.day"
            class="flex items-center justify-between text-sm"
          >
            <span class="text-highlighted w-20">{{ day.day }}</span>
            <div class="flex-1 mx-3">
              <UProgress
                :model-value="_props.insights.totalEntries > 0 ? Math.round((day.count / _props.insights.totalEntries) * 100) : 0"
                :max="100"
                size="xs"
              />
            </div>
            <span class="text-muted tabular-nums w-8 text-right">
              {{ day.count }}
            </span>
          </div>
        </div>
      </UCard>

      <!-- Mood × metric correlation -->
      <UCard v-if="_props.insights.moodCorrelations.length > 0">
        <template #header>
          <h4 class="text-sm font-medium text-highlighted">
            Humor × métricas
          </h4>
        </template>

        <div class="space-y-4">
          <div
            v-for="corr in _props.insights.moodCorrelations"
            :key="corr.key"
          >
            <p class="text-xs font-medium text-highlighted mb-1.5">
              {{ corr.name }}
            </p>
            <div class="flex flex-wrap gap-2">
              <div
                v-for="g in corr.groups"
                :key="g.label"
                class="flex items-center gap-1.5 rounded-lg bg-elevated/40 px-2.5 py-1.5"
              >
                <span class="text-base leading-none">{{ getMoodOptionByScore(g.avgMood)?.emoji }}</span>
                <div class="text-xs">
                  <p class="text-highlighted font-medium">
                    {{ g.label }}
                  </p>
                  <p class="text-dimmed">
                    {{ g.avgMood }}/5 · {{ g.count }} {{ g.count === 1 ? 'dia' : 'dias' }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Empty -->
      <div
        v-if="_props.insights.totalEntries === 0"
        class="flex flex-col items-center justify-center py-8 gap-3"
      >
        <UIcon
          name="i-lucide-bar-chart-3"
          class="size-12 text-dimmed"
        />
        <p class="text-sm text-muted">
          Escreva entradas no diário para ver insights aqui.
        </p>
      </div>
    </template>
  </div>
</template>
