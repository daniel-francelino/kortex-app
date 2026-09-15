<script setup lang="ts">
import type { NuxtError } from '#app'
import { pt_br } from '@nuxt/ui/locale'

defineProps({
  error: {
    type: Object as PropType<NuxtError>,
    required: true
  }
})

useHead({
  htmlAttrs: {
    lang: 'pt-BR'
  }
})

useSeoMeta({
  title: 'Page not found',
  description: 'We are sorry but this page could not be found.'
})

</script>

<template>
  <UApp :locale="pt_br">
    <div>
      <AppHeader />

      <UMain>
        <UContainer>
          <UPage>
            <UError :error="error" />
          </UPage>
        </UContainer>
      </UMain>

      <AppFooter />

      <UToaster />
    </div>
  </UApp>
</template>
