<script setup lang="ts">
import { pt_br } from '@nuxt/ui/locale'

const route = useRoute()
const colorMode = useColorMode()
const { state: preferencesState, applyBrandTheme, applyPublicTheme, applyStoredTheme } = useUserPreferences()
const runtimeConfig = useRuntimeConfig()

const isAppRoute = computed(() => route.path.startsWith('/app'))
const color = computed(() => isAppRoute.value || colorMode.value === 'dark' ? '#020618' : 'white')
const siteUrl = runtimeConfig.public.siteUrl?.replace(/\/$/, '') || 'https://kortex.app'
const defaultOgImage = `${siteUrl}/icons/icon-512x512.png`
const appleSplashLinks = [
  { width: 440, height: 956, ratio: 3, href: '/splash/apple-splash-1320x2868.png' },
  { width: 430, height: 932, ratio: 3, href: '/splash/apple-splash-1290x2796.png' },
  { width: 428, height: 926, ratio: 3, href: '/splash/apple-splash-1284x2778.png' },
  { width: 402, height: 874, ratio: 3, href: '/splash/apple-splash-1206x2622.png' },
  { width: 393, height: 852, ratio: 3, href: '/splash/apple-splash-1179x2556.png' },
  { width: 390, height: 844, ratio: 3, href: '/splash/apple-splash-1170x2532.png' },
  { width: 375, height: 812, ratio: 3, href: '/splash/apple-splash-1125x2436.png' },
  { width: 360, height: 780, ratio: 3, href: '/splash/apple-splash-1080x2340.png' },
  { width: 414, height: 896, ratio: 3, href: '/splash/apple-splash-1242x2688.png' },
  { width: 414, height: 736, ratio: 3, href: '/splash/apple-splash-1242x2208.png' },
  { width: 414, height: 896, ratio: 2, href: '/splash/apple-splash-828x1792.png' },
  { width: 375, height: 667, ratio: 2, href: '/splash/apple-splash-750x1334.png' },
  { width: 320, height: 568, ratio: 2, href: '/splash/apple-splash-640x1136.png' },
  { width: 768, height: 1024, ratio: 2, href: '/splash/apple-splash-1536x2048.png' },
  { width: 834, height: 1112, ratio: 2, href: '/splash/apple-splash-1668x2224.png' },
  { width: 834, height: 1194, ratio: 2, href: '/splash/apple-splash-1668x2388.png' },
  { width: 1024, height: 1366, ratio: 2, href: '/splash/apple-splash-2048x2732.png' }
].flatMap((item) => {
  const portrait = `(device-width: ${item.width}px) and (device-height: ${item.height}px) and (-webkit-device-pixel-ratio: ${item.ratio}) and (orientation: portrait)`
  const landscape = `(device-width: ${item.height}px) and (device-height: ${item.width}px) and (-webkit-device-pixel-ratio: ${item.ratio}) and (orientation: landscape)`

  // Nuxt's head manager (unhead) dedupes <link> tags that share the same
  // rel+href by default — since portrait and landscape here both point at
  // the same image, only the last-registered one (landscape) was ever
  // surviving into the rendered HTML. Phones launch in portrait, so in
  // practice NONE of these splash images ever matched and iOS fell back to
  // a blank background. An explicit unique `key` per tag stops the dedupe.
  return [
    { rel: 'apple-touch-startup-image' as const, href: item.href, media: portrait, key: `apple-splash-${item.width}x${item.height}-${item.ratio}x-portrait` },
    { rel: 'apple-touch-startup-image' as const, href: item.href, media: landscape, key: `apple-splash-${item.width}x${item.height}-${item.ratio}x-landscape` }
  ]
})

watch(
  () => [
    route.path,
    preferencesState.value.loaded,
    preferencesState.value.primary_color,
    preferencesState.value.neutral_color,
    preferencesState.value.color_mode
  ],
  () => {
    if (!isAppRoute.value) {
      applyPublicTheme()
      return
    }

    if (!preferencesState.value.loaded) {
      applyBrandTheme()
      return
    }

    applyStoredTheme()
  },
  { immediate: true }
)

useHead({
  meta: [
    { charset: 'utf-8' },
    { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover' },
    { key: 'theme-color', name: 'theme-color', content: color },
    { name: 'apple-mobile-web-app-capable', content: 'yes' },
    { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
    { name: 'apple-mobile-web-app-title', content: 'Kortex' },
    { name: 'mobile-web-app-capable', content: 'yes' },
    { name: 'format-detection', content: 'telephone=no' }
  ],
  link: [
    { rel: 'icon', type: 'image/svg+xml', href: '/icons/kortex-icon.svg' },
    { rel: 'alternate icon', type: 'image/png', href: '/icons/icon-192x192.png' },
    { rel: 'shortcut icon', href: '/favicon.ico' },
    { rel: 'apple-touch-icon', href: '/icons/apple-touch-icon.png' },
    { rel: 'mask-icon', href: '/icons/kortex-mono.svg', color: '#12E39A' },
    ...appleSplashLinks
  ],
  style: [
    {
      key: 'critical-app-background',
      innerHTML: 'html,body,#__nuxt{min-height:100%;background:#020618;color-scheme:dark;}'
    }
  ],
  script: [
    {
      key: 'standalone-runtime-class',
      innerHTML: 'try{if(window.matchMedia?.("(display-mode: standalone)")?.matches||window.navigator?.standalone===true){document.documentElement.classList.add("pwa-standalone")}}catch(e){}'
    }
  ],
  htmlAttrs: {
    lang: 'pt-BR'
  }
})

useSeoMeta({
  titleTemplate: '%s - Kortex',
  applicationName: 'Kortex',
  appleMobileWebAppTitle: 'Kortex',
  author: 'Kortex',
  ogSiteName: 'Kortex',
  ogImage: defaultOgImage,
  twitterImage: defaultOgImage,
  twitterCard: 'summary_large_image',
  twitterSite: '@kortexapp'
})

const { data: navigation } = await useAsyncData('navigation', () => queryCollectionNavigation('docs'), {
  transform: data => data.find(item => item.path === '/docs')?.children || []
})
const { data: files } = useLazyAsyncData('search', () => queryCollectionSearchSections('docs'), {
  server: false
})

const links = [{
  label: 'Documentação',
  icon: 'i-lucide-book',
  to: '/docs/getting-started'
}, {
  label: 'Planos',
  icon: 'i-lucide-credit-card',
  to: '/pricing'
}, {
  label: 'Blog',
  icon: 'i-lucide-pencil',
  to: '/blog'
}, {
  label: 'Novidades',
  icon: 'i-lucide-history',
  to: '/changelog'
}]

provide('navigation', navigation)
</script>

<template>
  <UApp :locale="pt_br">
    <AppLaunchSplash />

    <NuxtLoadingIndicator
      color="linear-gradient(90deg, #12E39A 0%, #5EF2BF 45%, #12E39A 100%)"
      error-color="#fb7185"
      :height="3"
    />

    <ClientOnly>
      <ViewportMetrics />
      <CapacitorInit />
    </ClientOnly>

    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>

    <ClientOnly>
      <LazyUContentSearch
        :files="files"
        shortcut="meta_k"
        :navigation="navigation"
        :links="links"
        :fuse="{ resultLimit: 42 }"
      />
    </ClientOnly>
  </UApp>
</template>
