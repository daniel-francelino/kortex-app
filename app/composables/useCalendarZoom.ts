import { createSharedComposable } from '@vueuse/core'
import { DEFAULT_HOUR_HEIGHT, MAX_HOUR_HEIGHT, MIN_HOUR_HEIGHT } from './useCalendarLayout'

const STORAGE_KEY = 'sb-calendar-hour-height'

// Shared (not per-instance) so the zoom level you set in Day view is still
// there when you switch to Week view, matching how Google Calendar's own
// zoom feels persistent across its views rather than resetting each time.
function _useCalendarZoom() {
  const hourHeight = ref(DEFAULT_HOUR_HEIGHT)

  if (import.meta.client) {
    const saved = Number(localStorage.getItem(STORAGE_KEY))
    if (saved >= MIN_HOUR_HEIGHT && saved <= MAX_HOUR_HEIGHT) {
      hourHeight.value = saved
    }
  }

  watch(hourHeight, (value) => {
    if (import.meta.client) localStorage.setItem(STORAGE_KEY, String(Math.round(value)))
  })

  function setHourHeight(value: number) {
    hourHeight.value = Math.min(MAX_HOUR_HEIGHT, Math.max(MIN_HOUR_HEIGHT, value))
  }

  return { hourHeight, setHourHeight }
}

export const useCalendarZoom = createSharedComposable(_useCalendarZoom)

interface PinchZoomOptions {
  /** The scrollable time-grid element (`[data-scroll-body]`) — pinch is
   * anchored around your fingers by adjusting its scrollTop as hourHeight changes. */
  scrollEl: Ref<HTMLElement | null>
  hourHeight: Ref<number>
  setHourHeight: (value: number) => void
}

/** Two-finger pinch-to-zoom for the Day/Week time grid, mirroring the same
 * hand-rolled Pointer Events approach already used for drag-and-drop in
 * these views (rather than pulling in a gesture library for one gesture). */
export function usePinchZoom(options: PinchZoomOptions) {
  const pointers = new Map<number, { x: number, y: number }>()
  let pinching = false
  let startDistance = 0
  let startHourHeight = DEFAULT_HOUR_HEIGHT
  let startScrollTop = 0
  let centroidY = 0

  function distance(a: { x: number, y: number }, b: { x: number, y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  function onPointerDown(e: PointerEvent) {
    if (e.pointerType !== 'touch') return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()] as [{ x: number, y: number }, { x: number, y: number }]
      startDistance = distance(a, b)
      startHourHeight = options.hourHeight.value
      const el = options.scrollEl.value
      startScrollTop = el?.scrollTop ?? 0
      const rect = el?.getBoundingClientRect()
      centroidY = rect ? (a.y + b.y) / 2 - rect.top : 0
      pinching = true
    }
  }

  function onPointerMove(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (!pinching || pointers.size < 2 || startDistance <= 0) return

    e.preventDefault()

    const [a, b] = [...pointers.values()] as [{ x: number, y: number }, { x: number, y: number }]
    const ratio = distance(a, b) / startDistance
    // Same time-of-day stays under your fingers instead of the grid
    // jumping to scrollTop 0 as hourHeight changes.
    const minutesAtCentroid = ((startScrollTop + centroidY) / startHourHeight) * 60
    options.setHourHeight(startHourHeight * ratio)

    const el = options.scrollEl.value
    if (el) el.scrollTop = (minutesAtCentroid / 60) * options.hourHeight.value - centroidY
  }

  function endPointer(e: PointerEvent) {
    pointers.delete(e.pointerId)
    if (pointers.size < 2) pinching = false
  }

  function attach(el: HTMLElement) {
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove, { passive: false })
    el.addEventListener('pointerup', endPointer)
    el.addEventListener('pointercancel', endPointer)
  }

  function detach(el: HTMLElement) {
    el.removeEventListener('pointerdown', onPointerDown)
    el.removeEventListener('pointermove', onPointerMove)
    el.removeEventListener('pointerup', endPointer)
    el.removeEventListener('pointercancel', endPointer)
  }

  return { attach, detach }
}
