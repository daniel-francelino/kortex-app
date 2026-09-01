<script setup lang="ts">
type StandaloneNavigator = Navigator & {
  standalone?: boolean
}

let displayModeQuery: MediaQueryList | undefined

function isStandaloneApp() {
  return window.matchMedia?.('(display-mode: standalone)').matches
    || (window.navigator as StandaloneNavigator).standalone === true
}

function applyRuntimeClasses() {
  const isStandalone = isStandaloneApp()

  document.documentElement.classList.toggle('pwa-standalone', isStandalone)
  document.body.classList.toggle('pwa-standalone', isStandalone)
}

function updateViewportMetrics() {
  const viewport = window.visualViewport
  const height = viewport?.height ?? window.innerHeight
  const offsetTop = viewport?.offsetTop ?? 0

  document.documentElement.style.setProperty('--app-visual-height', `${height}px`)
  document.documentElement.style.setProperty('--app-visual-offset-top', `${offsetTop}px`)
}

onMounted(() => {
  displayModeQuery = window.matchMedia?.('(display-mode: standalone)')

  applyRuntimeClasses()
  updateViewportMetrics()

  window.addEventListener('resize', updateViewportMetrics, { passive: true })
  window.addEventListener('orientationchange', updateViewportMetrics, { passive: true })
  displayModeQuery?.addEventListener?.('change', applyRuntimeClasses)
  window.visualViewport?.addEventListener('resize', updateViewportMetrics, { passive: true })
  window.visualViewport?.addEventListener('scroll', updateViewportMetrics, { passive: true })
})

onUnmounted(() => {
  window.removeEventListener('resize', updateViewportMetrics)
  window.removeEventListener('orientationchange', updateViewportMetrics)
  displayModeQuery?.removeEventListener?.('change', applyRuntimeClasses)
  window.visualViewport?.removeEventListener('resize', updateViewportMetrics)
  window.visualViewport?.removeEventListener('scroll', updateViewportMetrics)
})
</script>

<template>
  <slot />
</template>
