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

// Known WebKit bug: on a PWA's cold launch (and again after the app returns
// from background), `env(safe-area-inset-bottom)` can report 0 until
// *something* forces iOS to recompute it — confirmed on-device here: the
// value stayed 0 from load, then flipped to the correct 34px the instant an
// unrelated system notification banner appeared and forced a reflow. Every
// safe-area-dependent layout (the bottom nav's height/position, its content
// clearance) inherits that same stale 0 until then. Toggling `viewport-fit`
// off and back is the standard workaround — it forces iOS to redo the
// safe-area computation immediately instead of waiting on an unrelated event.
function nudgeSafeAreaRecalc() {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]')
  const original = meta?.getAttribute('content')
  if (!meta || !original || !original.includes('viewport-fit=cover')) return

  meta.setAttribute('content', original.replace('viewport-fit=cover', 'viewport-fit=auto'))
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      meta.setAttribute('content', original)
    })
  })
}

function onVisibilityChange() {
  if (document.visibilityState === 'visible') {
    nudgeSafeAreaRecalc()
    updateViewportMetrics()
  }
}

onMounted(() => {
  displayModeQuery = window.matchMedia?.('(display-mode: standalone)')

  applyRuntimeClasses()
  updateViewportMetrics()
  // One immediate attempt plus a delayed retry — the delayed one is the
  // reliable one in practice (matches the notification-banner case that
  // surfaced this bug: the fix landed only once the OS was done settling
  // the launch transition, not on the very first frame).
  nudgeSafeAreaRecalc()
  setTimeout(nudgeSafeAreaRecalc, 400)

  window.addEventListener('resize', updateViewportMetrics, { passive: true })
  window.addEventListener('orientationchange', updateViewportMetrics, { passive: true })
  displayModeQuery?.addEventListener?.('change', applyRuntimeClasses)
  window.visualViewport?.addEventListener('resize', updateViewportMetrics, { passive: true })
  window.visualViewport?.addEventListener('scroll', updateViewportMetrics, { passive: true })
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateViewportMetrics)
  window.removeEventListener('orientationchange', updateViewportMetrics)
  displayModeQuery?.removeEventListener?.('change', applyRuntimeClasses)
  window.visualViewport?.removeEventListener('resize', updateViewportMetrics)
  window.visualViewport?.removeEventListener('scroll', updateViewportMetrics)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})
</script>

<template>
  <slot />
</template>
