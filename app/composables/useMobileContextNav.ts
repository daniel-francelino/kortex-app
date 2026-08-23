import type { Ref } from 'vue'

export interface MobileContextNavItem {
  value: string
  label: string
  icon: string
  /** When set, tapping this item navigates here instead of switching the active tab. */
  to?: string
}

interface MobileContextNavState {
  owner: string | null
  active: string | null
  items: MobileContextNavItem[]
}

export function useMobileContextNav() {
  const state = useState<MobileContextNavState>('mobile-context-nav', () => ({
    owner: null,
    active: null,
    items: []
  }))

  const items = computed(() => state.value.items)
  const active = computed(() => state.value.active)
  const hasItems = computed(() => state.value.items.length > 0)

  function setMobileContextNav(owner: string, items: MobileContextNavItem[], active: string) {
    state.value = {
      owner,
      active,
      items
    }
  }

  function selectMobileContextNav(value: string) {
    if (!state.value.items.some(item => item.value === value)) return
    state.value = {
      ...state.value,
      active: value
    }
  }

  function clearMobileContextNav(owner?: string) {
    if (owner && state.value.owner !== owner) return
    state.value = {
      owner: null,
      active: null,
      items: []
    }
  }

  function registerMobileContextNav(owner: string, items: MobileContextNavItem[], activeRef: Ref<string>) {
    watch(activeRef, (activeValue) => {
      setMobileContextNav(owner, items, activeValue)
    }, { immediate: true })

    watch(active, (activeValue) => {
      if (state.value.owner !== owner) return
      if (!activeValue || !items.some(item => item.value === activeValue)) return
      if (activeRef.value === activeValue) return
      activeRef.value = activeValue
    })

    onBeforeUnmount(() => {
      clearMobileContextNav(owner)
    })
  }

  return {
    active,
    clearMobileContextNav,
    hasItems,
    items,
    registerMobileContextNav,
    selectMobileContextNav,
    setMobileContextNav
  }
}
