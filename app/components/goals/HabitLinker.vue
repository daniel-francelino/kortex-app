<script setup lang="ts">
import type { Habit } from '~/types/habits'

const props = defineProps<{
  existingHabitIds: string[]
}>()

const emit = defineEmits<{
  'link': [habitId: string]
  'cancel': []
  'create-habit': []
}>()

const search = ref('')
const loading = ref(true)
const habits = ref<Habit[]>([])

onMounted(async () => {
  try {
    const response = await $fetch<{ data: Habit[] }>('/api/habits', {
      query: { pageSize: 100, archived: false }
    })
    habits.value = response.data ?? []
  } catch {
    habits.value = []
  } finally {
    loading.value = false
  }
})

const linkableHabits = computed(() =>
  habits.value.filter(h => !props.existingHabitIds.includes(h.id) && !h.goalId)
)

const hiddenByOtherGoalCount = computed(() =>
  habits.value.filter(h => !props.existingHabitIds.includes(h.id) && h.goalId).length
)

const availableHabits = computed(() => {
  let filtered = linkableHabits.value
  if (search.value) {
    const q = search.value.toLowerCase()
    filtered = filtered.filter(h => h.name.toLowerCase().includes(q))
  }
  return filtered
})
</script>

<template>
  <div class="space-y-2 rounded-lg border border-default p-3">
    <UInput
      v-model="search"
      icon="i-lucide-search"
      placeholder="Buscar hábito..."
      size="sm"
      class="w-full"
    />

    <div v-if="loading" class="space-y-2">
      <USkeleton v-for="i in 3" :key="i" class="h-8 w-full" />
    </div>

    <div v-else-if="availableHabits.length > 0" class="max-h-40 overflow-y-auto space-y-1">
      <button
        v-for="habit in availableHabits"
        :key="habit.id"
        class="flex w-full items-center gap-2 rounded-md p-2 text-sm text-highlighted hover:bg-elevated transition-colors text-left"
        @click="emit('link', habit.id)"
      >
        <UIcon name="i-lucide-plus" class="size-3.5 text-muted shrink-0" />
        <span class="truncate">{{ habit.name }}</span>
      </button>
    </div>

    <p v-else class="text-xs text-muted py-2 text-center">
      Nenhum hábito disponível
    </p>

    <p v-if="hiddenByOtherGoalCount > 0" class="text-xs text-muted px-1">
      {{ hiddenByOtherGoalCount }} hábito(s) já vinculado(s) a outras metas não aparecem aqui.
    </p>

    <div class="flex items-center justify-between gap-2 pt-1">
      <UButton
        label="Criar novo hábito para esta meta"
        icon="i-lucide-plus"
        size="xs"
        color="primary"
        variant="subtle"
        @click="emit('create-habit')"
      />
      <UButton
        label="Fechar"
        size="xs"
        color="neutral"
        variant="ghost"
        @click="emit('cancel')"
      />
    </div>
  </div>
</template>
