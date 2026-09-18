<script setup lang="ts">
import { Capacitor } from '@capacitor/core'

const emit = defineEmits<{ 'update:visible': [value: boolean] }>()
const { loading } = useAuth()
const visible = ref(false)
const minimumElapsed = ref(false)
let minimumTimer: ReturnType<typeof setTimeout> | undefined
let fallbackTimer: ReturnType<typeof setTimeout> | undefined
let tabletViewport: MediaQueryList | undefined
let disposed = false

function dismiss() {
  visible.value = false
  clearTimeout(minimumTimer)
  clearTimeout(fallbackTimer)
}

watch([minimumElapsed, loading], ([elapsed, busy]) => {
  if (elapsed && !busy) dismiss()
})

onMounted(async () => {
  // The animated artwork belongs to the web experience on tablet/desktop.
  // Native apps keep their platform splash, and phones go straight to content.
  tabletViewport = window.matchMedia('(min-width: 768px)')
  if (Capacitor.isNativePlatform() || !tabletViewport.matches) return

  tabletViewport.addEventListener('change', onViewportChange)

  visible.value = true
  emit('update:visible', true)
  // Never leave the application covered if startup or a native plugin fails.
  fallbackTimer = setTimeout(dismiss, 4000)
  await nextTick()

  if (disposed || !visible.value) return
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  minimumTimer = setTimeout(() => { minimumElapsed.value = true }, reducedMotion ? 0 : 1100)
})

function onViewportChange(event: MediaQueryListEvent) {
  if (!event.matches) dismiss()
}

function onAfterLeave() {
  emit('update:visible', false)
}

onBeforeUnmount(() => {
  disposed = true
  clearTimeout(minimumTimer)
  clearTimeout(fallbackTimer)
  tabletViewport?.removeEventListener('change', onViewportChange)
  emit('update:visible', false)
})
</script>

<template>
  <Transition name="splash" @after-leave="onAfterLeave">
    <div v-if="visible" class="app-splash" role="status" aria-live="polite" aria-label="Abrindo o Kortex">
      <div class="app-splash__identity" aria-hidden="true">
        <div class="app-splash__glow" />
        <div class="app-splash__mark">
          <svg viewBox="0 0 100 100" fill="none" class="app-splash__symbol">
            <g stroke="currentColor" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
              <path class="app-splash__stroke" pathLength="1" d="M20 85V15" />
              <path class="app-splash__stroke app-splash__stroke--upper" pathLength="1" d="M20 50L50 25L80 15" />
              <path class="app-splash__stroke app-splash__stroke--lower" pathLength="1" d="M20 50L50 75L80 85" />
            </g>
            <circle class="app-splash__node" cx="20" cy="50" r="8" fill="currentColor" />
            <circle class="app-splash__node app-splash__node--end" cx="80" cy="15" r="6" fill="currentColor" />
            <circle class="app-splash__node app-splash__node--end" cx="80" cy="85" r="6" fill="currentColor" />
          </svg>
        </div>
        <p class="app-splash__name">Kortex</p>
        <div class="app-splash__activity"><span /><span /><span /></div>
      </div>
      <span class="sr-only">Preparando seu espaço.</span>
    </div>
  </Transition>
</template>

<style scoped>
.app-splash {
  position: fixed;
  inset: 0;
  z-index: 10000;
  overflow: hidden;
  background: radial-gradient(ellipse at 50% 36%, #063827 0%, #020b17 45%, #020618 100%);
  color: #12e39a;
  touch-action: none;
}
.app-splash__identity {
  position: absolute;
  top: 38%;
  left: 50%;
  width: min(23vw, 128px);
  transform: translate(-50%, -50%);
  text-align: center;
}
.app-splash__glow {
  position: absolute;
  inset: -55%;
  border-radius: 50%;
  background: radial-gradient(circle, #12e39a20, #12e39a00 70%);
  animation: splash-glow 2.4s ease-in-out infinite;
}
.app-splash__mark {
  position: relative;
  aspect-ratio: 1;
  padding: 18%;
  border: 1px solid #12e39a26;
  border-radius: 28%;
  background: linear-gradient(145deg, #0a2a27, #04131d);
  box-shadow: 0 16px 48px #00000030, inset 0 1px 0 #ffffff0a;
  animation: splash-arrive 600ms cubic-bezier(0.16, 1, 0.3, 1) both;
}
.app-splash__symbol { display: block; width: 100%; height: 100%; }
.app-splash__stroke {
  stroke-dasharray: 1;
  stroke-dashoffset: 0;
  animation: splash-draw 600ms ease-out both;
}
.app-splash__stroke--upper { animation-delay: 150ms; }
.app-splash__stroke--lower { animation-delay: 280ms; }
.app-splash__node { animation: splash-node 300ms 350ms ease-out both; }
.app-splash__node--end { animation-delay: 650ms; }
.app-splash__name {
  position: absolute;
  top: calc(100% + 4vh);
  left: 50%;
  margin: 0;
  transform: translateX(-50%);
  color: #f8fafc;
  font-size: clamp(24px, 7vw, 32px);
  font-weight: 700;
  letter-spacing: -0.04em;
  animation: splash-node 450ms 250ms ease-out both;
}
.app-splash__activity {
  position: absolute;
  top: calc(100% + 4vh + 60px);
  left: 50%;
  display: flex;
  gap: 6px;
  transform: translateX(-50%);
}
.app-splash__activity span {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: currentColor;
  animation: splash-dot 1.2s ease-in-out infinite;
}
.app-splash__activity span:nth-child(2) { animation-delay: 150ms; }
.app-splash__activity span:nth-child(3) { animation-delay: 300ms; }
.splash-leave-active { transition: opacity 320ms ease-out; }
.splash-leave-to { opacity: 0; }
@keyframes splash-arrive {
  from { opacity: 0; transform: translateY(8px) scale(0.94); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes splash-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@keyframes splash-node { from { opacity: 0; } to { opacity: 1; } }
@keyframes splash-glow { 0%, 100% { opacity: 0.5; transform: scale(0.95); } 50% { opacity: 1; transform: scale(1.05); } }
@keyframes splash-dot { 0%, 100% { opacity: 0.2; } 50% { opacity: 0.9; } }
@media (prefers-reduced-motion: reduce) {
  .app-splash *, .app-splash *::before, .app-splash *::after { animation: none !important; }
  .splash-leave-active { transition: none; }
}
</style>
