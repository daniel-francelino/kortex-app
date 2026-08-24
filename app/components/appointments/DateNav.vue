<script setup lang="ts">
defineProps<{
  label: string
}>()

const emit = defineEmits<{
  prev: []
  next: []
  today: []
}>()
</script>

<template>
  <div class="flex min-w-0 items-center gap-1">
    <!-- "Hoje": icon-only below sm so it's always reachable, labeled from sm: up -->
    <UTooltip text="Hoje" class="sm:hidden">
      <UButton
        square
        variant="outline"
        size="sm"
        class="justify-center"
        icon="i-lucide-calendar-1"
        aria-label="Ir para hoje"
        @click="emit('today')"
      />
    </UTooltip>
    <UButton
      label="Hoje"
      variant="outline"
      size="sm"
      class="hidden sm:flex"
      @click="emit('today')"
    />
    <UButton
      icon="i-lucide-chevron-left"
      variant="ghost"
      size="sm"
      class="hidden sm:flex"
      aria-label="Período anterior"
      @click="emit('prev')"
    />
    <UButton
      icon="i-lucide-chevron-right"
      variant="ghost"
      size="sm"
      class="hidden sm:flex"
      aria-label="Próximo período"
      @click="emit('next')"
    />
    <h2 class="ml-1 min-w-0 truncate text-sm font-semibold text-highlighted sm:min-w-36">
      {{ label }}
    </h2>
  </div>
</template>
