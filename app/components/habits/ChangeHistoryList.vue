<script setup lang="ts">
import type { HabitChangeHistory, HabitDifficulty, HabitFrequency, HabitType } from '~/types/habits'
import { DIFFICULTY_META, FREQUENCY_META, HABIT_TYPE_META } from '~/types/habits'
import { formatDisplay } from '#shared/utils/dateTime'

const props = defineProps<{
  habitId: string
}>()

const { fetchHistory } = useHabits()

const entries = ref<HabitChangeHistory[]>([])
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const loaded = ref(false)
const hasMore = ref(true)

const FIELD_LABELS: Record<string, string> = {
  difficulty: 'Dificuldade',
  frequency: 'Frequência',
  identityId: 'Identidade',
  habitType: 'Tipo'
}

function formatFieldValue(field: string, value: string | null): string {
  if (value == null) return '—'

  if (field === 'difficulty' && value in DIFFICULTY_META) {
    return DIFFICULTY_META[value as HabitDifficulty].label
  }
  if (field === 'frequency' && value in FREQUENCY_META) {
    return FREQUENCY_META[value as HabitFrequency].label
  }
  if (field === 'habitType' && value in HABIT_TYPE_META) {
    return HABIT_TYPE_META[value as HabitType].label
  }

  return value
}

function formatDate(iso: string): string {
  return formatDisplay(iso, "dd 'de' MMM'.' 'de' yyyy, HH:mm")
}

async function loadMore() {
  if (loading.value || !hasMore.value) return
  loading.value = true
  try {
    const results = await fetchHistory(props.habitId, page.value)
    entries.value.push(...results)
    hasMore.value = results.length === pageSize
    page.value += 1
  } finally {
    loading.value = false
    loaded.value = true
  }
}

defineExpose({ loadMore, loaded })
</script>

<template>
  <div class="space-y-3">
    <div v-if="!loaded && loading" class="space-y-2">
      <USkeleton class="h-10 w-full" />
      <USkeleton class="h-10 w-full" />
    </div>

    <div v-else-if="entries.length === 0" class="py-4 text-center text-sm text-muted">
      Nenhuma alteração registrada ainda.
    </div>

    <template v-else>
      <div
        v-for="entry in entries"
        :key="entry.id"
        class="rounded-lg border border-default/60 bg-default/40 px-3 py-2 text-sm"
      >
        <p class="text-highlighted">
          <span class="font-medium">{{ FIELD_LABELS[entry.field] ?? entry.field }}</span>:
          {{ formatFieldValue(entry.field, entry.oldValue) }} → {{ formatFieldValue(entry.field, entry.newValue) }}
        </p>
        <p class="mt-0.5 text-xs text-muted">
          {{ formatDate(entry.createdAt) }}
        </p>
      </div>

      <UButton
        v-if="hasMore"
        label="Carregar mais"
        color="neutral"
        variant="subtle"
        size="sm"
        block
        :loading="loading"
        @click="loadMore"
      />
    </template>
  </div>
</template>
