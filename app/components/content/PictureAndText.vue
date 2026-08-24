<script setup lang="ts">
import { UCard } from '#components'

defineProps<{
  reverse?: boolean
  card?: boolean
}>()
</script>

<template>
  <component :is="card ? UCard : 'div'">
    <div class="grid grid-cols-1 items-center w-full gap-6 sm:grid-cols-3 sm:gap-x-8">
      <div :class="{ 'sm:order-2': reverse }">
        <slot name="image" />
      </div>
      <div class="sm:col-span-2">
        <slot />
      </div>
    </div>
  </component>
</template>
