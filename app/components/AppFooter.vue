<script setup lang="ts">
import { PostHogEvent } from '~/types/analytics'

const { capture } = usePostHog()
const columns = [{
  label: 'Produto',
  children: [
    { label: 'Recursos', to: '/#recursos' },
    { label: 'Como funciona', to: '/#como-funciona' },
    { label: 'Planos', to: '/pricing' }
  ]
}, {
  label: 'Explore',
  children: [
    { label: 'Documentação', to: '/docs' },
    { label: 'Blog', to: '/blog' },
    { label: 'Novidades', to: '/changelog' }
  ]
}]
</script>

<template>
  <footer class="border-t border-default bg-default">
    <UContainer>
      <div class="grid gap-12 py-14 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr]">
        <div>
          <NuxtLink to="/" aria-label="Kortex – início" class="inline-flex"><AppLogo /></NuxtLink>
          <p class="mt-5 max-w-xs text-sm leading-7 text-muted">Um lugar para organizar suas ideias.<br>Mais espaço para viver as suas prioridades.</p>
          <UButton
            to="/signup"
            label="Começar meu Kortex"
            trailing-icon="i-lucide-arrow-up-right"
            variant="link"
            class="mt-5 min-h-11 px-0"
            @click="capture(PostHogEvent.PublicFooterCtaClicked, { location: 'footer', target: '/signup', target_label: 'Começar meu Kortex' })"
          />
        </div>
        <nav v-for="column in columns" :key="column.label" :aria-label="column.label">
          <h2 class="text-xs font-semibold uppercase tracking-widest text-highlighted">{{ column.label }}</h2>
          <ul class="mt-4 space-y-1">
            <li v-for="link in column.children" :key="link.to">
              <NuxtLink
                :to="link.to"
                class="inline-flex min-h-11 items-center text-sm text-muted transition-colors hover:text-highlighted"
                @click="capture(PostHogEvent.PublicFooterCtaClicked, { location: 'footer', target: link.to, target_label: link.label })"
              >{{ link.label }}</NuxtLink>
            </li>
          </ul>
        </nav>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-4 border-t border-default py-6 text-xs text-dimmed">
        <p>© {{ new Date().getFullYear() }} Kortex</p>
        <p>Clareza para pensar. Espaço para agir.</p>
      </div>
    </UContainer>
  </footer>
</template>
