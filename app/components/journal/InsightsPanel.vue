<script setup lang="ts">
import { AnimatePresence, motion } from 'motion-v'
import type { JournalInsights } from '~/types/journal'

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

    <AnimatePresence mode="wait">
      <!-- Loading -->
      <motion.div
        v-if="_props.loading"
      class="space-y-6"
      :initial="{ opacity: 0, y: 8 }"
      :animate="{ opacity: 1, y: 0 }"
      :exit="{ opacity: 0, y: -6 }"
      :transition="{ duration: 0.16 }"
    >
      <UCard>
        <div class="text-center space-y-2">
          <USkeleton class="h-8 w-12 mx-auto" />
          <USkeleton class="h-3 w-16 mx-auto" />
        </div>
      </UCard>
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
      </motion.div>

      <motion.div
        v-else-if="_props.insights"
      class="space-y-6"
      :initial="{ opacity: 0, y: 10 }"
      :animate="{ opacity: 1, y: 0 }"
      :exit="{ opacity: 0, y: -6 }"
      :transition="{ duration: 0.18 }"
    >
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

      <!-- Entries by day of week -->
      <UCard v-if="_props.insights.entriesByDayOfWeek.length > 0">
        <template #header>
          <h4 class="text-sm font-medium text-highlighted">
            Entradas por dia da semana
          </h4>
        </template>

        <div class="space-y-2">
          <motion.div
            v-for="(day, index) in _props.insights.entriesByDayOfWeek"
            :key="day.day"
            class="flex items-center justify-between text-sm"
            :initial="{ opacity: 0, x: -8 }"
            :animate="{ opacity: 1, x: 0 }"
            :transition="{ duration: 0.16, delay: 0.08 + index * 0.03 }"
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
          </motion.div>
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
      </motion.div>
    </AnimatePresence>
  </div>
</template>
