export default defineNuxtRouteMiddleware((to) => {
  // Public marketing pages are dark-only by brand design. Route meta is
  // read by @nuxtjs/color-mode's own SSR + no-flash inline script, so the
  // header (and everything else) renders correctly on the very first paint
  // — unlike setting `colorMode.preference` reactively from app.vue, which
  // only takes effect after hydration and loses the race against the
  // module's own "unknown preference" correction on first visit.
  if (!to.path.startsWith('/app')) {
    to.meta.colorMode = 'dark'
  }
})
