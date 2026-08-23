<script setup lang="ts">
function updateViewportMetrics() {
  const viewport = window.visualViewport
  const height = viewport?.height ?? window.innerHeight
  const offsetTop = viewport?.offsetTop ?? 0

  document.documentElement.style.setProperty('--app-visual-height', `${height}px`)
  document.documentElement.style.setProperty('--app-visual-offset-top', `${offsetTop}px`)
}

onMounted(() => {
  updateViewportMetrics()

  window.addEventListener('resize', updateViewportMetrics, { passive: true })
  window.addEventListener('orientationchange', updateViewportMetrics, { passive: true })
  window.visualViewport?.addEventListener('resize', updateViewportMetrics, { passive: true })
  window.visualViewport?.addEventListener('scroll', updateViewportMetrics, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('resize', updateViewportMetrics)
  window.removeEventListener('orientationchange', updateViewportMetrics)
  window.visualViewport?.removeEventListener('resize', updateViewportMetrics)
  window.visualViewport?.removeEventListener('scroll', updateViewportMetrics)
})
</script>

<template>
  <slot />
</template>
