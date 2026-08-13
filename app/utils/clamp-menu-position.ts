export type MenuPoint = { x: number, y: number }
export type ClampMenuAnchor = 'top-left' | 'bottom-center'

/**
 * Nudges a fixed-position floating menu back inside the viewport, given its
 * already-rendered element — sizes here are content-dependent (item count,
 * text length), so measuring the real element beats guessing a fixed
 * width/height ahead of time. Call this from `nextTick()` right after
 * setting the naive/anchor-based position, once the menu has painted at
 * that position and its real size is measurable.
 *
 * - 'top-left' menus (slash, mention, wikilink, emoji, link preview) grow
 *   right/down from `pos` — clamped so no edge goes past the viewport.
 * - 'bottom-center' (the text-selection bubble menu) is horizontally
 *   centered on `pos.x` and grows upward from `pos.y` via a CSS transform —
 *   clamped on both axes, without touching that transform.
 */
export function clampMenuPosition(
  pos: MenuPoint,
  menuEl: HTMLElement | null | undefined,
  anchor: ClampMenuAnchor = 'top-left',
  margin = 8
): MenuPoint {
  if (!menuEl) return pos

  const rect = menuEl.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight

  if (anchor === 'bottom-center') {
    const halfWidth = rect.width / 2
    let x = pos.x
    if (x - halfWidth < margin) x = halfWidth + margin
    if (x + halfWidth > viewportWidth - margin) x = viewportWidth - margin - halfWidth

    // The menu renders above pos.y (translateY(-100%) in CSS) — if there
    // isn't enough room above, push pos.y down just enough that the
    // rendered top of the menu stays on screen.
    let y = pos.y
    const minY = margin + rect.height
    if (y < minY) y = minY

    return { x, y }
  }

  let x = pos.x
  let y = pos.y

  if (x + rect.width > viewportWidth - margin) x = Math.max(margin, viewportWidth - margin - rect.width)
  if (x < margin) x = margin

  if (y + rect.height > viewportHeight - margin) y = Math.max(margin, viewportHeight - margin - rect.height)
  if (y < margin) y = margin

  return { x, y }
}
