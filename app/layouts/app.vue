<script setup lang="ts">
import { AnimatePresence, motion } from 'motion-v'
import type { NavigationMenuItem } from '@nuxt/ui'

const toast = useToast()
const route = useRoute()

const open = ref(false)
const sidebarCollapsed = ref(true)
const isMobile = useMediaQuery('(max-width: 1023px)')
const mobileSettingsOpen = ref(true)

const links = [
  [
    {
      label: 'Visão geral',
      icon: 'i-lucide-house',
      to: '/app',
      onSelect: () => {
        open.value = false
      }
    },
    {
      label: 'Agenda',
      icon: 'i-lucide-calendar-days',
      to: '/app/appointments',
      onSelect: () => {
        open.value = false
      }
    },
    {
      label: 'Hábitos',
      icon: 'i-lucide-calendar-check',
      to: '/app/habits',
      onSelect: () => {
        open.value = false
      }
    },
    {
      label: 'Metas',
      icon: 'i-lucide-target',
      to: '/app/goals',
      onSelect: () => {
        open.value = false
      }
    },
    {
      label: 'Tarefas',
      icon: 'i-lucide-check-square',
      to: '/app/tasks',
      onSelect: () => {
        open.value = false
      }
    },
    {
      label: 'Diário de Bordo',
      icon: 'i-lucide-book-open',
      to: '/app/journal',
      onSelect: () => {
        open.value = false
      }
    },
    {
      label: 'Notas',
      icon: 'i-lucide-brain',
      to: '/app/notes',
      onSelect: () => {
        open.value = false
      }
    },
    // {
    //  label: 'Ideias',
    //  icon: 'i-lucide-lightbulb',
    //  to: '/app/ideas',
    //  onSelect: () => {
    //    open.value = false
    //  }
    // },
    {
      label: 'Configurações',
      to: '/app/settings',
      icon: 'i-lucide-settings',
      defaultOpen: true,
      type: 'trigger',
      children: [
        {
          label: 'Geral',
          to: '/app/settings',
          exact: true,
          onSelect: () => {
            open.value = false
          }
        },
        {
          label: 'Assinatura',
          to: '/app/settings/subscription',
          onSelect: () => {
            open.value = false
          }
        },
        {
          label: 'Notificações',
          to: '/app/settings/notifications',
          onSelect: () => {
            open.value = false
          }
        },
        {
          label: 'Segurança',
          to: '/app/settings/security',
          onSelect: () => {
            open.value = false
          }
        }
      ]
    }
  ],
  [
    {
      label: 'Enviar feedback',
      icon: 'i-lucide-message-circle',
      to: '/app/feedback',
      onSelect: () => {
        open.value = false
      }
    },
    {
      label: 'Ajuda',
      icon: 'i-lucide-info',
      to: '/docs'
    }
  ]
] satisfies NavigationMenuItem[][]

const groups = computed(() => [
  {
    id: 'links',
    label: 'Ir para',
    items: links.flat()
  }
])

const primaryLinks = computed(() => links[0].filter(item => !item.children))
const settingsLink = computed(() => links[0].find(item => item.children))
const secondaryLinks = computed(() => links[1])
const mobileMenuTransition = { duration: 0.18, ease: 'easeOut' }

function isActivePath(to?: string, exact?: boolean): boolean {
  if (!to) return false
  if (exact || to === '/app') return route.path === to
  return route.path.startsWith(to)
}

function closeMobileSidebar() {
  open.value = false
}

const { load: loadPreferences } = useUserPreferences()

onMounted(async () => {
  await loadPreferences()

  const cookie = useCookie('cookie-consent')
  if (cookie.value === 'accepted') {
    return
  }

  toast.add({
    title: 'Usamos cookies essenciais para melhorar sua experiência no Kortex.',
    duration: 0,
    close: false,
    actions: [
      {
        label: 'Aceitar',
        color: 'neutral',
        variant: 'outline',
        onClick: () => {
          cookie.value = 'accepted'
        }
      },
      {
        label: 'Recusar',
        color: 'neutral',
        variant: 'ghost'
      }
    ]
  })
})

watch(
  isMobile,
  (mobile) => {
    if (mobile) {
      sidebarCollapsed.value = false
    }
  },
  { immediate: true }
)
</script>

<template>
  <UDashboardGroup unit="rem" class="kortex-app-shell">
    <UDashboardSidebar
      id="default"
      v-model:open="open"
      v-model:collapsed="sidebarCollapsed"
      :collapsible="!isMobile"
      :resizable="!isMobile"
      class="kortex-app-sidebar bg-elevated/25"
      :ui="{
        content: 'kortex-mobile-sidebar-content max-lg:overflow-hidden max-lg:bg-default max-lg:pt-0 max-lg:pb-0',
        header: 'max-lg:h-auto max-lg:min-h-[calc(var(--ui-header-height)+var(--mobile-sidebar-safe-area-top))] max-lg:items-center max-lg:pt-[var(--mobile-sidebar-safe-area-top)] max-lg:px-4',
        body: 'max-lg:px-4 max-lg:pb-3',
        footer: 'max-lg:border-t max-lg:border-default max-lg:px-4 max-lg:pt-3 max-lg:pb-[max(0.75rem,var(--mobile-sidebar-safe-area-bottom))] lg:border-t lg:border-default'
      }"
    >
      <template #header="{ collapsed }">
        <TeamsMenu :collapsed="collapsed" />
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton
          :collapsed="collapsed"
          class="bg-transparent ring-default max-lg:h-12 max-lg:text-sm"
        />

        <template v-if="isMobile">
          <motion.div
            class="mt-3 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-3"
            :initial="{ opacity: 0, y: 8 }"
            :animate="{ opacity: 1, y: 0 }"
            :transition="{ duration: 0.2, ease: 'easeOut' }"
          >
            <nav class="space-y-1.5" aria-label="Navegação principal">
              <motion.div
                v-for="(item, itemIndex) in primaryLinks"
                :key="item.to"
                :initial="{ opacity: 0, x: -10 }"
                :animate="{ opacity: 1, x: 0 }"
                :transition="{ ...mobileMenuTransition, delay: Math.min(itemIndex * 0.025, 0.12) }"
                :while-tap="{ scale: 0.985 }"
              >
                <NuxtLink
                  :to="item.to"
                  class="relative flex min-h-12 items-center gap-3 overflow-hidden rounded-xl px-3 text-[15px] font-medium transition-colors"
                  :class="
                    isActivePath(item.to, item.exact)
                      ? 'text-primary'
                      : 'text-muted active:bg-elevated/80'
                  "
                  @click="closeMobileSidebar"
                >
                  <motion.span
                    v-if="isActivePath(item.to, item.exact)"
                    class="absolute inset-0 rounded-xl bg-primary/15"
                    layout-id="mobile-sidebar-active-link"
                    :transition="{ duration: 0.18, ease: 'easeOut' }"
                  />
                  <span
                    class="relative flex size-9 shrink-0 items-center justify-center rounded-lg"
                    :class="isActivePath(item.to, item.exact) ? 'bg-primary/15' : 'bg-elevated/50'"
                  >
                    <UIcon :name="item.icon" class="size-5" />
                  </span>
                  <span class="relative truncate">{{ item.label }}</span>
                </NuxtLink>
              </motion.div>
            </nav>

            <motion.section
              v-if="settingsLink"
              class="space-y-1.5"
              :initial="{ opacity: 0, x: -10 }"
              :animate="{ opacity: 1, x: 0 }"
              :transition="{ ...mobileMenuTransition, delay: 0.14 }"
            >
              <motion.button
                type="button"
                class="relative flex min-h-12 w-full items-center gap-3 overflow-hidden rounded-xl px-3 text-left text-[15px] font-medium transition-colors"
                :class="
                  isActivePath(settingsLink.to)
                    ? 'text-primary'
                    : 'text-muted active:bg-elevated/80'
                "
                :aria-expanded="mobileSettingsOpen"
                :while-tap="{ scale: 0.985 }"
                @click="mobileSettingsOpen = !mobileSettingsOpen"
              >
                <motion.span
                  v-if="isActivePath(settingsLink.to)"
                  class="absolute inset-0 rounded-xl bg-primary/15"
                  layout-id="mobile-sidebar-active-link"
                  :transition="{ duration: 0.18, ease: 'easeOut' }"
                />
                <span
                  class="relative flex size-9 shrink-0 items-center justify-center rounded-lg"
                  :class="isActivePath(settingsLink.to) ? 'bg-primary/15' : 'bg-elevated/50'"
                >
                  <UIcon :name="settingsLink.icon" class="size-5" />
                </span>
                <span class="relative min-w-0 flex-1 truncate">{{ settingsLink.label }}</span>
                <motion.div
                  class="relative shrink-0"
                  :animate="{ rotate: mobileSettingsOpen ? 180 : 0 }"
                  :transition="{ duration: 0.18, ease: 'easeOut' }"
                >
                  <UIcon
                    name="i-lucide-chevron-down"
                    class="size-5"
                  />
                </motion.div>
              </motion.button>

              <AnimatePresence>
                <motion.div
                  v-if="mobileSettingsOpen"
                  class="ml-6 overflow-hidden border-l border-default pl-3"
                  :initial="{ height: 0, opacity: 0 }"
                  :animate="{ height: 'auto', opacity: 1 }"
                  :exit="{ height: 0, opacity: 0 }"
                  :transition="{ duration: 0.2, ease: 'easeOut' }"
                >
                  <div class="space-y-1 py-1">
                    <motion.div
                      v-for="(child, childIndex) in settingsLink.children"
                      :key="child.to"
                      :initial="{ opacity: 0, x: -8 }"
                      :animate="{ opacity: 1, x: 0 }"
                      :exit="{ opacity: 0, x: -6 }"
                      :transition="{ duration: 0.16, delay: childIndex * 0.025, ease: 'easeOut' }"
                      :while-tap="{ scale: 0.985 }"
                    >
                      <NuxtLink
                        :to="child.to"
                        class="flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors"
                        :class="
                          isActivePath(child.to, child.exact)
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted active:bg-elevated/80'
                        "
                        @click="closeMobileSidebar"
                      >
                        {{ child.label }}
                      </NuxtLink>
                    </motion.div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </motion.section>

            <motion.nav
              class="mt-auto space-y-1.5 border-t border-default pt-3"
              aria-label="Suporte"
              :initial="{ opacity: 0, y: 8 }"
              :animate="{ opacity: 1, y: 0 }"
              :transition="{ ...mobileMenuTransition, delay: 0.18 }"
            >
              <motion.div
                v-for="(item, itemIndex) in secondaryLinks"
                :key="item.to"
                :initial="{ opacity: 0, x: -8 }"
                :animate="{ opacity: 1, x: 0 }"
                :transition="{ ...mobileMenuTransition, delay: Math.min(itemIndex * 0.025, 0.08) }"
                :while-tap="{ scale: 0.985 }"
              >
                <NuxtLink
                  :to="item.to"
                  class="flex min-h-12 items-center gap-3 rounded-xl px-3 text-[15px] font-medium text-muted transition-colors active:bg-elevated/80"
                  @click="closeMobileSidebar"
                >
                  <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-elevated/50">
                    <UIcon :name="item.icon" class="size-5" />
                  </span>
                  <span class="truncate">{{ item.label }}</span>
                </NuxtLink>
              </motion.div>
            </motion.nav>
          </motion.div>
        </template>

        <template v-else>
          <UNavigationMenu
            :collapsed="collapsed"
            :items="links[0]"
            orientation="vertical"
            tooltip
            popover
          />

          <UNavigationMenu
            :collapsed="collapsed"
            :items="links[1]"
            orientation="vertical"
            tooltip
            class="mt-auto"
          />
        </template>
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch :groups="groups" />

    <div class="app-content-with-bottom-nav flex min-h-0 flex-1 flex-col w-full min-w-0 overflow-hidden">
      <slot />
    </div>

    <MobileBottomNav />

    <NotificationsSlideover />
  </UDashboardGroup>

  <OnboardingFlowModal />
</template>
