<script setup lang="ts">
defineProps<{
  collapsed?: boolean
}>()
</script>

<template>
  <NuxtLink
    to="/app"
    class="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-elevated max-lg:h-10 max-lg:px-0 max-lg:py-0"
  >
    <AppLogo
      :show-label="false"
      size="sm"
    />
    <span
      v-if="!collapsed"
      class="text-sm font-semibold text-highlighted truncate"
    >
      Kortex
    </span>
  </NuxtLink>
</template>
