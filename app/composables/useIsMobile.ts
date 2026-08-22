// The UButton/UInput `size` prop has no CSS-only responsive equivalent (it's
// a JS prop, not a class), so components that need a bigger touch target on
// mobile and a compact size on desktop have to read this breakpoint in
// script — same threshold as the sidebar collapse in app/layouts/app.vue.
export function useIsMobile() {
  return useMediaQuery('(max-width: 1023px)')
}
