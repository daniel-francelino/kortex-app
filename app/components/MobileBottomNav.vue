<script setup lang="ts">
import { AnimatePresence, motion } from 'motion-v'

const route = useRoute()
const router = useRouter()
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
  if (!to) return false
  if (to === '/app') return route.path === '/app'
  return route.path.startsWith(to)
}

function isMoreActive(): boolean {
  return moreItems.some(item => route.path.startsWith(item.to))
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

watchEffect(() => {
  if (!import.meta.client) return

  document.documentElement.style.setProperty(
    '--mobile-bottom-nav-height',
    'calc(var(--mobile-bottom-nav-bar-height, 4.75rem) + var(--mobile-bottom-nav-safe-padding, 0px))'
  )
})

onUnmounted(() => {
  if (!import.meta.client) return
  document.documentElement.style.setProperty(
    '--mobile-bottom-nav-height',
    'calc(var(--mobile-bottom-nav-bar-height, 4.75rem) + var(--mobile-bottom-nav-safe-padding, 0px))'
  )
})
</script>

<template>
  <div class="mobile-bottom-nav lg:hidden">
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
