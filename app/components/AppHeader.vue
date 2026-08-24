<script setup lang="ts">
import { PostHogEvent } from '~/types/analytics'

const route = useRoute()
const { capture } = usePostHog()

function trackNavigation(label: string, target: string, location: 'header' | 'header-mobile') {
  capture(PostHogEvent.PublicNavigationClicked, {
    location,
    target,
    target_label: label
  })
}

const items = computed(() => [{
  label: 'Documentação',
  to: '/docs',
  active: route.path.startsWith('/docs'),
  onSelect: () => trackNavigation('Documentation', '/docs', 'header')
}, {
  label: 'Planos',
  to: '/pricing',
  onSelect: () => trackNavigation('Pricing', '/pricing', 'header')
}, {
  label: 'Blog',
  to: '/blog',
  onSelect: () => trackNavigation('Blog', '/blog', 'header')
}, {
  label: 'Novidades',
  to: '/changelog',
  onSelect: () => trackNavigation('Changelog', '/changelog', 'header')
}])
</script>

<template>
  <UHeader>
    <template #left>
      <NuxtLink
        to="/"
        aria-label="Kortex"
        class="flex items-center"
      >
        <AppLogo />
      </NuxtLink>
    </template>

    <UNavigationMenu
      :items="items"
      variant="link"
    />

    <template #right>
      <UButton
        label="Entrar"
        color="neutral"
        variant="outline"
        to="/login"
        class="hidden lg:inline-flex"
        @click="trackNavigation('Login', '/login', 'header')"
      />

      <UButton
        label="Criar conta"
        color="neutral"
        trailing-icon="i-lucide-arrow-right"
        to="/signup"
        @click="trackNavigation('Signup', '/signup', 'header')"
      />
    </template>

    <template #body>
      <UNavigationMenu
        :items="items"
        orientation="vertical"
        class="-mx-2.5"
      />

      <USeparator class="my-6" />

      <UButton
        label="Entrar"
        color="neutral"
        variant="subtle"
        to="/login"
        block
        class="mb-3"
        @click="trackNavigation('Login', '/login', 'header-mobile')"
      />
      <UButton
        label="Criar conta"
        color="neutral"
        to="/signup"
        block
        @click="trackNavigation('Signup', '/signup', 'header-mobile')"
      />
    </template>
  </UHeader>
</template>
