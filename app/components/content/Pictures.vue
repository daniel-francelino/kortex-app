<script setup lang="ts">
defineProps<{
  orientation: 'horizontal' | 'vertical'
}>()
</script>

<template>
  <div
    class="flex items-center justify-between"
    :class="orientation === 'vertical' ? 'flex-col space-y-4' : 'flex-row flex-wrap gap-4 overflow-x-auto'"
  >
    <slot />
  </div>
</template>
