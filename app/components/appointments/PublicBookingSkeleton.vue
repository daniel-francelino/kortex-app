<script setup lang="ts">
// Placeholder shown by agendar/[token].vue and [username]/[slug].vue while
// the public scheduling page's data is still loading. With `lazy: true` on
// those pages' useAsyncData, the component now mounts immediately instead of
// blocking behind Nuxt's default (blank) Suspense fallback — this fills that
// gap. Deliberately a loose Tailwind approximation of PublicBookingFlow.vue's
// `.booking-page/.booking-shell/.booking-card` shape rather than sharing its
// scoped styles, so this stays a plain, dependency-free skeleton.
</script>

<template>
  <div class="flex min-h-dvh items-start justify-center px-4 py-8 sm:items-center sm:px-6 sm:py-16">
    <div class="w-full max-w-[1040px]">
      <div class="overflow-hidden rounded-lg border border-default bg-default">
        <USkeleton class="h-40 w-full rounded-none" />
        <div class="grid grid-cols-1 md:grid-cols-[280px_minmax(0,1fr)]">
          <!-- Summary column -->
          <div class="space-y-3 border-b border-default p-6 md:border-b-0 md:border-r">
            <USkeleton class="size-6 rounded-full" />
            <USkeleton class="h-3.5 w-24" />
            <USkeleton class="h-5 w-40" />
            <USkeleton class="h-3.5 w-full" />
            <USkeleton class="h-3.5 w-5/6" />
            <div class="space-y-3 pt-4">
              <USkeleton class="h-3.5 w-28" />
              <USkeleton class="h-3.5 w-32" />
              <USkeleton class="h-3.5 w-24" />
            </div>
          </div>
          <!-- Calendar + times columns -->
          <div class="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_280px]">
            <div class="space-y-3 p-5">
              <USkeleton class="h-5 w-32" />
              <USkeleton class="h-64 w-full rounded-lg" />
            </div>
            <div class="space-y-2 border-t border-default p-5 sm:border-l sm:border-t-0">
              <USkeleton class="mb-3 h-5 w-20" />
              <USkeleton v-for="i in 6" :key="i" class="h-10 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
