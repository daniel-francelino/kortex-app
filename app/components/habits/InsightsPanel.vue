<script setup lang="ts">
import type { HabitInsights as InsightsType, HeatmapData, IdentityProgress, MoodCorrelationData } from '~/types/habits'
import { MOOD_OPTIONS } from '~/types/journal'
import { formatDisplay } from '#shared/utils/dateTime'

const props = defineProps<{
  insights: InsightsType | null
  loading: boolean
}>()

const { data: moodCorrelation, status: moodCorrelationStatus } = useFetch<MoodCorrelationData>(
  '/api/habits/insights/mood-correlation',
  { lazy: true, key: 'habits-mood-correlation' }
)

const moodCorrelationBars = computed(() => {
  const buckets = moodCorrelation.value?.buckets ?? []

  return MOOD_OPTIONS.map((option) => {
    const bucket = buckets.find(b => b.mood === option.value)
    return {
      ...option,
      avgCompletionRate: bucket?.avgCompletionRate ?? 0,
      sampleDays: bucket?.sampleDays ?? 0
    }
  })
})

const currentYear = new Date().getFullYear()
const selectedHeatmapYear = ref(currentYear)

const { data: heatmapData, status: heatmapStatus } = useFetch<HeatmapData>('/api/habits/insights/heatmap', {
  lazy: true,
  key: computed(() => `habits-heatmap-${selectedHeatmapYear.value}`),
  query: computed(() => ({ year: selectedHeatmapYear.value })),
  watch: [selectedHeatmapYear]
})

const availableHeatmapYears = computed(() => heatmapData.value?.availableYears ?? [currentYear])

const selectedHeatmapYearIndex = computed(() =>
  availableHeatmapYears.value.findIndex(year => year === selectedHeatmapYear.value)
)

const canViewOlderYear = computed(() => {
  const index = selectedHeatmapYearIndex.value
  return index >= 0 && index < availableHeatmapYears.value.length - 1
})

const canViewNewerYear = computed(() => {
  const index = selectedHeatmapYearIndex.value
  return index > 0
})

const completedDays = computed(() =>
  (heatmapData.value?.days ?? []).filter(day => day.count > 0)
)

const activeDaysCount = computed(() => completedDays.value.length)

const totalCompletedLogs = computed(() =>
  (heatmapData.value?.days ?? []).reduce((sum, day) => sum + day.count, 0)
)

const strongestDay = computed(() => {
  return [...(heatmapData.value?.days ?? [])]
    .sort((a, b) => b.count - a.count)[0] ?? null
})

const currentWeeklyRate = computed(() => {
  const rates = heatmapData.value?.weeklyRates ?? []
  return rates.at(-1)?.rate ?? null
})

const previousWeeklyRate = computed(() => {
  const rates = heatmapData.value?.weeklyRates ?? []
  return rates.length > 1 ? rates.at(-2)?.rate ?? null : null
})

const weeklyDelta = computed(() => {
  if (currentWeeklyRate.value == null || previousWeeklyRate.value == null) return null
  return currentWeeklyRate.value - previousWeeklyRate.value
})

const topIdentity = computed<IdentityProgress | null>(() => {
  return [...(props.insights?.identityProgress ?? [])]
    .sort((a, b) => b.score - a.score)[0] ?? null
})

const needsAttentionIdentity = computed<IdentityProgress | null>(() => {
  const items = (props.insights?.identityProgress ?? []).filter(item => item.totalHabits > 0)
  return [...items].sort((a, b) => a.score - b.score)[0] ?? null
})

const stats = computed(() => {
  if (!props.insights) return []

  return [
    {
      title: 'Taxa 7 dias',
      value: `${props.insights.completionRate7d}%`,
      detail: props.insights.completionRate7d >= 70 ? 'Ritmo forte na semana' : 'Há espaço para ganhar consistência',
      icon: 'i-lucide-trending-up',
      tone: 'primary' as const
    },
    {
      title: 'Taxa 30 dias',
      value: `${props.insights.completionRate30d}%`,
      detail: 'Visão consolidada do último mês',
      icon: 'i-lucide-bar-chart-3',
      tone: 'primary' as const
    },
    {
      title: 'Streak médio',
      value: `${props.insights.averageStreak}d`,
      detail: props.insights.averageStreak > 0 ? 'Dias seguidos por hábito, em média' : 'Ainda sem sequência relevante',
      icon: 'i-lucide-flame',
      tone: 'warning' as const
    },
    {
      title: 'Melhor dia',
      value: props.insights.bestDay ?? '—',
      detail: props.insights.bestDay ? 'Dia com mais conclusões recentes' : 'Ainda sem padrão suficiente',
      icon: 'i-lucide-calendar-check',
      tone: 'success' as const
    },
    {
      title: 'Dias ativos',
      value: String(activeDaysCount.value),
      detail: 'Dias com ao menos um hábito concluído no período',
      icon: 'i-lucide-calendar-range',
      tone: 'neutral' as const
    },
    {
      title: 'Conclusões',
      value: String(totalCompletedLogs.value),
      detail: 'Hábitos concluídos no recorte do mapa',
      icon: 'i-lucide-check-check',
      tone: 'success' as const
    }
  ]
})

const quickHighlights = computed(() => {
  const strongest = strongestDay.value
  const weeklyTitle = selectedHeatmapYear.value === currentYear
    ? 'Semana atual'
    : 'Última semana do ano'

  return [
    {
      title: weeklyTitle,
      value: currentWeeklyRate.value != null ? `${currentWeeklyRate.value}%` : '—',
      note: weeklyDelta.value == null
        ? 'Sem base suficiente para comparar'
        : weeklyDelta.value >= 0
          ? `+${weeklyDelta.value} pts vs. semana anterior`
          : `${weeklyDelta.value} pts vs. semana anterior`,
      icon: 'i-lucide-activity'
    },
    {
      title: 'Pico de execução',
      value: strongest ? `${strongest.count} hábitos` : '—',
      note: strongest ? formatDayLabel(strongest.date) : 'Ainda sem atividade suficiente',
      icon: 'i-lucide-rocket'
    },
    {
      title: 'Hábitos ativos',
      value: String(heatmapData.value?.totalHabits ?? 0),
      note: 'Base usada nos cálculos de consistência',
      icon: 'i-lucide-list-checks'
    }
  ]
})

const hasAnyInsightData = computed(() => {
  return Boolean(
    stats.value.length
    || (heatmapData.value?.days?.length ?? 0) > 0
    || (props.insights?.identityProgress?.length ?? 0) > 0
  )
})

function formatDayLabel(dateStr: string): string {
  return formatDisplay(new Date(`${dateStr}T12:00:00`), "dd 'de' MMM'.'")
}

function navigateHeatmapYear(direction: 'older' | 'newer') {
  const index = selectedHeatmapYearIndex.value
  if (index < 0) {
    selectedHeatmapYear.value = currentYear
    return
  }

  const targetIndex = direction === 'older' ? index + 1 : index - 1
  const targetYear = availableHeatmapYears.value[targetIndex]

  if (targetYear) {
    selectedHeatmapYear.value = targetYear
  }
}
</script>

<template>
  <div class="space-y-5 lg:space-y-6">
    <div class="grid gap-4 ">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <template v-if="loading">
          <UCard v-for="i in 6" :key="i" class="min-h-28">
            <div class="space-y-3">
              <USkeleton class="h-4 w-24" />
              <USkeleton class="h-8 w-20" />
              <USkeleton class="h-3 w-full" />
            </div>
          </UCard>
        </template>

        <template v-else>
          <UCard
            v-for="stat in stats"
            :key="stat.title"
            class="min-h-28"
          >
            <div class="flex h-full items-start gap-3">
              <div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-elevated ring ring-default">
                <UIcon :name="stat.icon" class="size-5 text-primary" />
              </div>

              <div class="min-w-0 space-y-1.5">
                <p class="text-xs uppercase tracking-[0.14em] text-muted">
                  {{ stat.title }}
                </p>
                <p class="text-xl font-semibold leading-none text-highlighted sm:text-2xl">
                  {{ stat.value }}
                </p>
                <p class="text-sm leading-5 text-muted">
                  {{ stat.detail }}
                </p>
              </div>
            </div>
          </UCard>
        </template>
      </div>

      <UCard class="self-start overflow-hidden">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-sparkles" class="size-5 text-primary" />
            <p class="font-medium text-highlighted">
              Leitura rápida
            </p>
          </div>
        </template>

        <div class="space-y-3">
          <div
            v-for="item in quickHighlights"
            :key="item.title"
            class="rounded-2xl border border-default bg-muted/40 p-4"
          >
            <div class="flex items-start gap-3">
              <div class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-default ring ring-default">
                <UIcon :name="item.icon" class="size-4.5 text-primary" />
              </div>

              <div class="min-w-0 space-y-1">
                <p class="text-xs uppercase tracking-[0.12em] text-muted">
                  {{ item.title }}
                </p>
                <p class="text-lg font-semibold text-highlighted">
                  {{ item.value }}
                </p>
                <p class="text-sm text-muted">
                  {{ item.note }}
                </p>
              </div>
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-2">
            <div class="rounded-2xl border border-default p-4">
              <p class="text-xs uppercase tracking-[0.12em] text-muted">
                Melhor identidade
              </p>
              <p class="mt-1 text-base font-semibold text-highlighted">
                {{ topIdentity?.identity.name ?? 'Sem identidade suficiente' }}
              </p>
              <p class="mt-1 text-sm text-muted">
                {{
                  topIdentity
                    ? `${topIdentity.score}% de consistência em ${topIdentity.totalHabits} hábitos`
                    : 'Crie hábitos vinculados a identidades para comparar progresso.'
                }}
              </p>
            </div>

            <div class="rounded-2xl border border-default p-4">
              <p class="text-xs uppercase tracking-[0.12em] text-muted">
                Ponto de atenção
              </p>
              <p class="mt-1 text-base font-semibold text-highlighted">
                {{ needsAttentionIdentity?.identity.name ?? 'Nada crítico por enquanto' }}
              </p>
              <p class="mt-1 text-sm text-muted">
                {{
                  needsAttentionIdentity
                    ? `${needsAttentionIdentity.score}% de consistência. Boa candidata para revisão.`
                    : 'Conforme mais dados aparecerem, esta área destaca onde agir primeiro.'
                }}
              </p>
            </div>
          </div>
        </div>
      </UCard>
    </div>

    <div class="grid gap-4 2xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <UCard class="overflow-hidden">
        <template #header>
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-calendar" class="size-5 text-primary" />
              <div>
                <p class="font-medium text-highlighted">
                  Mapa de atividades
                </p>
                <p class="text-sm text-muted">
                  Visão do ano para localizar padrão, lacunas e picos.
                </p>
              </div>
            </div>

            <div class="flex items-center gap-2 self-end sm:self-auto">
              <UButton
                v-if="availableHeatmapYears.length > 1"
                icon="i-lucide-chevron-left"
                color="neutral"
                variant="subtle"
                size="sm"
                :disabled="!canViewOlderYear"
                aria-label="Ver ano anterior"
                @click="navigateHeatmapYear('older')"
              />
              <div class="min-w-20 text-center text-sm font-medium text-highlighted">
                {{ selectedHeatmapYear }}
              </div>
              <UButton
                v-if="availableHeatmapYears.length > 1"
                icon="i-lucide-chevron-right"
                color="neutral"
                variant="subtle"
                size="sm"
                :disabled="!canViewNewerYear"
                aria-label="Ver ano seguinte"
                @click="navigateHeatmapYear('newer')"
              />
            </div>
          </div>
        </template>

        <template v-if="heatmapStatus === 'pending'">
          <div class="space-y-2">
            <USkeleton class="h-32 w-full" />
            <USkeleton class="ml-auto h-4 w-40" />
          </div>
        </template>

        <template v-else-if="heatmapData?.days?.length">
          <HabitsHeatmapChart :days="heatmapData.days" />
        </template>

        <div v-else class="py-8 text-center text-sm text-muted">
          Sem dados de atividade em {{ selectedHeatmapYear }}.
        </div>
      </UCard>

      <UCard class="overflow-hidden">
        <template #header>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-trending-up" class="size-5 text-primary" />
            <div>
              <p class="font-medium text-highlighted">
                Taxa de conclusão semanal
              </p>
              <p class="text-sm text-muted">
                Tendência recente para entender aceleração ou queda de consistência.
              </p>
            </div>
          </div>
        </template>

        <template v-if="heatmapStatus === 'pending'">
          <div class="space-y-3">
            <USkeleton class="h-36 w-full" />
            <USkeleton class="h-4 w-32" />
          </div>
        </template>

        <template v-else-if="heatmapData?.weeklyRates?.length">
          <HabitsWeeklyRateChart :rates="heatmapData.weeklyRates" />
        </template>

        <div v-else class="py-8 text-center text-sm text-muted">
          Sem dados suficientes para o gráfico.
        </div>
      </UCard>
    </div>

    <UCard class="overflow-hidden">
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-smile" class="size-5 text-primary" />
          <div>
            <p class="font-medium text-highlighted">
              Humor e consistência
            </p>
            <p class="text-sm text-muted">
              Taxa média de conclusão de hábitos em dias com cada humor registrado no diário (últimos 90 dias).
            </p>
          </div>
        </div>
      </template>

      <template v-if="moodCorrelationStatus === 'pending'">
        <div class="space-y-2">
          <USkeleton v-for="i in 5" :key="i" class="h-8 w-full" />
        </div>
      </template>

      <template v-else-if="moodCorrelation?.insufficientData">
        <div class="py-8 text-center text-sm text-muted">
          Registre humor no diário e conclua hábitos nos mesmos dias para ver essa correlação.
        </div>
      </template>

      <template v-else>
        <div class="space-y-3">
          <div
            v-for="bar in moodCorrelationBars"
            :key="bar.value"
            class="flex items-center gap-3"
          >
            <span class="w-28 shrink-0 text-sm text-muted">
              {{ bar.emoji }} {{ bar.label }}
            </span>
            <div class="h-2.5 flex-1 overflow-hidden rounded-full bg-muted/40">
              <div
                class="h-full rounded-full bg-primary"
                :style="{ width: `${bar.avgCompletionRate}%` }"
              />
            </div>
            <span class="w-24 shrink-0 text-right text-sm text-highlighted">
              {{ bar.sampleDays > 0 ? `${bar.avgCompletionRate}%` : '—' }}
            </span>
          </div>
        </div>
      </template>
    </UCard>

    <div
      v-if="!loading && !hasAnyInsightData"
      class="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-default py-12"
    >
      <UIcon name="i-lucide-bar-chart-3" class="size-12 text-dimmed" />
      <div class="text-center">
        <p class="font-medium text-highlighted">
          Sem dados suficientes
        </p>
        <p class="text-sm text-muted">
          Complete seus hábitos para destravar insights mais úteis aqui.
        </p>
      </div>
    </div>
  </div>
</template>
