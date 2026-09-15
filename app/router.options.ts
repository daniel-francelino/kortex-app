import type { RouterConfig } from '@nuxt/schema'

// Landing-page anchor links (Recursos/Como funciona in the header, footer,
// and the pricing FAQ) navigate to `/#recursos` etc. — without this, Vue
// Router jumps to the section instantly instead of scrolling. The target
// sections already carry `scroll-margin-top` (app/pages/index.vue) to clear
// the sticky header, which Vue Router's element-based scrolling respects on
// its own, so this only needs to turn the jump into a scroll.
export default <RouterConfig>{
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }

    if (to.hash) {
      const reducedMotion = typeof window !== 'undefined'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches

      return {
        el: to.hash,
        behavior: reducedMotion ? 'instant' : 'smooth'
      }
    }

    return { top: 0 }
  }
}
