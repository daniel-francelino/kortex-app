<script setup lang="ts">
import { AnimatePresence, motion } from 'motion-v'
import { isNavPathActive } from '~/utils/navigation'

const route = useRoute()
const router = useRouter()
const navDebugEnabled = ref(true)
const navDebugInfo = ref('')
const {
  active,
  hasItems: hasContextItems,
  items: contextItems,
  selectMobileContextNav
} = useMobileContextNav()

const items = [
  { label: 'Início', icon: 'i-lucide-house', to: '/app' },
  { label: 'Hábitos', icon: 'i-lucide-calendar-check', to: '/app/habits' },
  { label: 'Tarefas', icon: 'i-lucide-check-square', to: '/app/tasks' },
  { label: 'Diário', icon: 'i-lucide-book-open', to: '/app/journal' },
  { label: 'Mais', icon: 'i-lucide-menu', to: '' }
]

const showMoreMenu = ref(false)

const moreItems = [
  { label: 'Agenda', icon: 'i-lucide-calendar-days', to: '/app/appointments' },
  { label: 'Metas', icon: 'i-lucide-target', to: '/app/goals' },
  { label: 'Finanças', icon: 'i-lucide-wallet', to: '/app/financial' },
  { label: 'Notas', icon: 'i-lucide-brain', to: '/app/notes' },
  { label: 'Ideias', icon: 'i-lucide-lightbulb', to: '/app/ideas' },
  { label: 'Configurações', icon: 'i-lucide-settings', to: '/app/settings' }
]

function isActive(to: string): boolean {
  return isNavPathActive(route.path, to)
}

function isMoreActive(): boolean {
  return moreItems.some(item => isNavPathActive(route.path, item.to))
}

function isContextItemActive(item: { value: string, to?: string }): boolean {
  if (item.to) return route.path.startsWith(item.to)
  return active.value === item.value
}

function onContextItemClick(item: { value: string, to?: string }) {
  if (item.to) {
    router.push(item.to)
    return
  }
  selectMobileContextNav(item.value)
}

function handleMoreClick() {
  showMoreMenu.value = !showMoreMenu.value
}

function navigateTo(to: string) {
  showMoreMenu.value = false
  if (to) {
    router.push(to)
  }
}

function updateNavDebugInfo() {
  if (!import.meta.client || !navDebugEnabled.value) return

  const el = document.querySelector<HTMLElement>('.mobile-bottom-nav')
  if (!el) return

  const rect = el.getBoundingClientRect()
  const styles = window.getComputedStyle(el)
  const rootStyles = window.getComputedStyle(document.documentElement)
  const viewport = window.visualViewport

  navDebugInfo.value = [
    `rect.top=${Math.round(rect.top)}`,
    `rect.bottom=${Math.round(rect.bottom)}`,
    `rect.height=${Math.round(rect.height)}`,
    `css.top=${styles.top}`,
    `css.bottom=${styles.bottom}`,
    `css.height=${styles.height}`,
    `innerHeight=${window.innerHeight}`,
    `vv.height=${Math.round(viewport?.height ?? 0)}`,
    `safeBottom=${rootStyles.getPropertyValue('--safe-area-bottom').trim() || 'n/a'}`,
    `bleed=${rootStyles.getPropertyValue('--pwa-standalone-bottom-bleed').trim() || 'n/a'}`
  ].join(' | ')
}

function applyNavDebugPreference() {
  if (!import.meta.client) return

  const queryValue = Array.isArray(route.query.navDebug)
    ? route.query.navDebug[0]
    : route.query.navDebug

  if (queryValue === '1') {
    window.localStorage.setItem('kortex-mobile-nav-debug', '1')
  } else if (queryValue === '0') {
    window.localStorage.setItem('kortex-mobile-nav-debug', '0')
  }

  navDebugEnabled.value = window.localStorage.getItem('kortex-mobile-nav-debug') !== '0'
  document.documentElement.classList.toggle('mobile-nav-debug', navDebugEnabled.value)
  document.body.classList.toggle('mobile-nav-debug', navDebugEnabled.value)
  updateNavDebugInfo()
}

watchEffect(() => {
  if (!import.meta.client) return

  applyNavDebugPreference()

  document.documentElement.style.setProperty(
    '--mobile-bottom-nav-height',
    'var(--mobile-bottom-nav-bar-height, 4.75rem)'
  )
})

onMounted(() => {
  if (!import.meta.client) return

  updateNavDebugInfo()
  window.addEventListener('resize', updateNavDebugInfo, { passive: true })
  window.visualViewport?.addEventListener('resize', updateNavDebugInfo, { passive: true })
  window.visualViewport?.addEventListener('scroll', updateNavDebugInfo, { passive: true })
})

onUnmounted(() => {
  if (!import.meta.client) return
  document.documentElement.classList.remove('mobile-nav-debug')
  document.body.classList.remove('mobile-nav-debug')
  window.removeEventListener('resize', updateNavDebugInfo)
  window.visualViewport?.removeEventListener('resize', updateNavDebugInfo)
  window.visualViewport?.removeEventListener('scroll', updateNavDebugInfo)
  document.documentElement.style.setProperty(
    '--mobile-bottom-nav-height',
    'var(--mobile-bottom-nav-bar-height, 4.75rem)'
  )
})
</script>

<template>
  <div
    class="mobile-bottom-nav lg:hidden"
    :class="{ 'mobile-bottom-nav--debug': navDebugEnabled }"
  >
    <div
      v-if="navDebugEnabled"
      class="mobile-bottom-nav__debug-panel"
    >
      {{ navDebugInfo }}
    </div>

    <!-- More menu overlay -->
    <Transition name="slide-up">
      <div
        v-if="showMoreMenu"
        class="absolute bottom-full left-0 right-0 bg-elevated border-t border-default shadow-lg"
      >
        <div class="grid grid-cols-3 gap-1 p-3">
          <button
            v-for="item in moreItems"
            :key="item.to"
            class="flex flex-col items-center gap-1.5 rounded-lg p-3 transition-colors"
            :class="isActive(item.to) ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-muted/50'"
            @click="navigateTo(item.to)"
          >
            <UIcon :name="item.icon" class="size-5" />
            <span class="text-xs font-medium">{{ item.label }}</span>
          </button>
        </div>
      </div>
    </Transition>

    <!-- Backdrop for more menu -->
    <Teleport to="body">
      <Transition name="fade">
        <div
          v-if="showMoreMenu"
          class="fixed inset-0 z-40 bg-black/30 lg:hidden"
          @click="showMoreMenu = false"
        />
      </Transition>
    </Teleport>

    <!-- Bottom nav bar -->
    <nav class="px-2 py-1.5">
      <AnimatePresence mode="wait">
        <motion.div
          v-if="hasContextItems"
          key="context"
          class="mobile-context-nav flex items-center overflow-x-auto"
          :initial="{ opacity: 0, y: 8 }"
          :animate="{ opacity: 1, y: 0 }"
          :exit="{ opacity: 0, y: -6 }"
          :transition="{ duration: 0.18, ease: 'easeOut' }"
        >
          <motion.button
            v-for="(item, index) in contextItems"
            :key="item.value"
            type="button"
            class="flex min-h-14 flex-1 basis-0 flex-col items-center justify-center gap-0.5 rounded-xl px-3 text-center transition-colors"
            :class="
              isContextItemActive(item)
                ? 'text-primary'
                : 'text-muted active:bg-elevated/80'
            "
            :initial="{ opacity: 0, y: 8 }"
            :animate="{ opacity: 1, y: 0 }"
            :transition="{ duration: 0.16, delay: Math.min(index * 0.025, 0.1), ease: 'easeOut' }"
            :while-tap="{ scale: 0.98 }"
            :aria-pressed="!item.to ? isContextItemActive(item) : undefined"
            @click="onContextItemClick(item)"
          >
            <UIcon :name="item.icon" class="size-5 shrink-0" />
            <span class="max-w-full truncate text-[10px] font-medium leading-tight">{{ item.label }}</span>
          </motion.button>
        </motion.div>

        <motion.div
          v-else
          key="global"
          class="flex items-center justify-around"
          :initial="{ opacity: 0, y: 8 }"
          :animate="{ opacity: 1, y: 0 }"
          :exit="{ opacity: 0, y: -6 }"
          :transition="{ duration: 0.18, ease: 'easeOut' }"
        >
          <template v-for="item in items" :key="item.label">
            <NuxtLink
              v-if="item.to"
              :to="item.to"
              class="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-3 transition-colors"
              :class="isActive(item.to) ? 'text-primary' : 'text-muted'"
              @click="showMoreMenu = false"
            >
              <UIcon :name="item.icon" class="size-5" />
              <span class="text-[10px] font-medium leading-tight">{{ item.label }}</span>
            </NuxtLink>

            <button
              v-else
              class="flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl px-3 transition-colors"
              :class="isMoreActive() || showMoreMenu ? 'text-primary' : 'text-muted'"
              @click="handleMoreClick"
            >
              <UIcon :name="item.icon" class="size-5" />
              <span class="text-[10px] font-medium leading-tight">{{ item.label }}</span>
            </button>
          </template>
        </motion.div>
      </AnimatePresence>
    </nav>
  </div>
</template>

<style scoped>
.mobile-bottom-nav--debug {
  outline: 3px solid red !important;
  outline-offset: -3px;
  background:
    repeating-linear-gradient(
      45deg,
      rgba(255, 0, 0, 0.24),
      rgba(255, 0, 0, 0.24) 8px,
      rgba(255, 255, 0, 0.16) 8px,
      rgba(255, 255, 0, 0.16) 16px
    ),
    var(--ui-bg) !important;
}

.mobile-bottom-nav--debug::after {
  outline: 3px dashed fuchsia !important;
  outline-offset: -3px;
  background:
    repeating-linear-gradient(
      -45deg,
      rgba(255, 0, 255, 0.3),
      rgba(255, 0, 255, 0.3) 8px,
      rgba(0, 255, 255, 0.16) 8px,
      rgba(0, 255, 255, 0.16) 16px
    ) !important;
}

.mobile-bottom-nav--debug > nav {
  outline: 3px solid yellow !important;
  outline-offset: -6px;
  background: rgba(255, 255, 0, 0.16) !important;
}

.mobile-bottom-nav--debug :deep(.mobile-context-nav),
.mobile-bottom-nav--debug :deep(nav > div) {
  outline: 2px solid cyan !important;
  outline-offset: -4px;
  background: rgba(0, 255, 255, 0.12) !important;
}

.mobile-bottom-nav--debug :deep(a),
.mobile-bottom-nav--debug :deep(button) {
  outline: 2px solid lime !important;
  outline-offset: -2px;
  background-color: rgba(0, 255, 0, 0.12) !important;
}

.mobile-bottom-nav__debug-panel {
  position: absolute;
  right: 0;
  bottom: 100%;
  left: 0;
  z-index: 60;
  max-height: 40vh;
  overflow: auto;
  border: 2px solid red;
  background: rgba(0, 0, 0, 0.88);
  color: white;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 10px;
  line-height: 1.35;
  padding: 6px 8px;
  pointer-events: none;
  white-space: normal;
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.mobile-context-nav {
  scrollbar-width: none;
}

.mobile-context-nav::-webkit-scrollbar {
  display: none;
}
</style>
