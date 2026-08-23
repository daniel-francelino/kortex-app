<script setup lang="ts">
const visible = ref(true)

onMounted(() => {
  window.setTimeout(() => {
    visible.value = false
  }, 650)
})
</script>

<template>
  <Transition name="kortex-launch-splash">
    <div
      v-if="visible"
      class="kortex-launch-splash"
      aria-hidden="true"
    >
      <div class="kortex-launch-splash__mark">
        <AppLogo
          :show-label="false"
          size="lg"
        />
      </div>
      <div class="kortex-launch-splash__name">
        Kortex
      </div>
    </div>
  </Transition>
</template>
