<script setup lang="ts">
const props = withDefaults(defineProps<{
  showLabel?: boolean
  size?: 'sm' | 'md' | 'lg'
}>(), {
  showLabel: true,
  size: 'md'
})

const iconClass = computed(() => {
  if (props.size === 'sm') return 'h-8 w-8 rounded-[1rem]'
  if (props.size === 'lg') return 'h-16 w-16 rounded-[1.5rem]'
  return 'h-9 w-9 rounded-[1.15rem]'
})
</script>

<template>
  <div class="inline-flex items-center gap-3 leading-none text-left">
    <img
      src="/icons/kortex-icon.svg"
      alt=""
      :class="['shrink-0 ring-1 ring-inset ring-white/10', iconClass]"
    >

    <div
      v-if="showLabel"
      class="min-w-0"
    >
      <div class="text-sm font-semibold tracking-tight text-highlighted">
        Kortex
      </div>
    </div>
  </div>
</template>
