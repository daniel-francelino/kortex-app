<script setup lang="ts">
import type { Goal } from '~/types/goals'

const props = defineProps<{
  existingGoalIds: string[]
}>()

const emit = defineEmits<{
  link: [goalId: string]
  cancel: []
}>()

const search = ref('')
const loading = ref(true)
const goals = ref<Goal[]>([])

async function loadGoals() {
  loading.value = true
  try {
    const response = await $fetch<{ data: Goal[] }>('/api/goals', {
      query: { pageSize: 50, search: search.value || undefined }
    })
    goals.value = response.data ?? []
  } catch {
    goals.value = []
  } finally {
    loading.value = false
  }
}

onMounted(loadGoals)

let searchTimeout: ReturnType<typeof setTimeout> | undefined
watch(search, () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(loadGoals, 300)
})

const availableGoals = computed(() =>
  goals.value.filter(g => !props.existingGoalIds.includes(g.id))
)
</script>

<template>
  <div class="space-y-2 rounded-lg border border-default p-3">
    <UInput
      v-model="search"
      icon="i-lucide-search"
      placeholder="Buscar meta..."
      size="sm"
      class="w-full"
    />

    <div v-if="loading" class="space-y-2">
      <USkeleton v-for="i in 3" :key="i" class="h-8 w-full" />
    </div>

    <div v-else-if="availableGoals.length > 0" class="max-h-40 overflow-y-auto space-y-1">
      <button
        v-for="goal in availableGoals"
        :key="goal.id"
        class="flex w-full items-center gap-2 rounded-md p-2 text-sm text-highlighted hover:bg-elevated transition-colors text-left"
        @click="emit('link', goal.id)"
      >
        <UIcon name="i-lucide-plus" class="size-3.5 text-muted shrink-0" />
        <span class="truncate">{{ goal.title }}</span>
      </button>
    </div>

    <p v-else class="text-xs text-muted py-2 text-center">
      Nenhuma meta disponível
    </p>

    <div class="flex justify-end pt-1">
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
