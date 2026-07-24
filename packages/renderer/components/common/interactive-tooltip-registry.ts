/**
 * Shared registry of interactive hover panels.
 *
 * The safe triangle (./safe-triangle.ts) answers "is the pointer travelling to
 * this panel", but geometry alone cannot answer "has the pointer arrived
 * somewhere that should take over". In a vertical list those two questions
 * disagree: the row below the one you left sits squarely inside the wedge, so
 * the old panel stays up on its way out while the new row opens its own — two
 * panels on screen at once, describing different sessions.
 *
 * Panels therefore need to know about each other, which is what this is for.
 * Two rules, both "whatever the pointer is on now wins":
 *
 * - moving onto another registered trigger closes the current panel at once,
 *   overriding the wedge;
 * - a panel about to appear closes any other that is still open.
 */

export interface InteractiveTooltip {
  /** Current trigger element; resolved lazily because refs settle after mount. */
  trigger: () => HTMLElement | null
  hide: () => void
}

const registry = new Set<InteractiveTooltip>()

export function registerInteractiveTooltip(entry: InteractiveTooltip): void {
  registry.add(entry)
}

export function unregisterInteractiveTooltip(entry: InteractiveTooltip): void {
  registry.delete(entry)
}

function containsPoint(element: HTMLElement, point: { x: number; y: number }): boolean {
  const rect = element.getBoundingClientRect()
  // A detached or hidden trigger measures as a zero box at the origin, which
  // would otherwise swallow any pointer near the top-left corner.
  if (rect.width === 0 && rect.height === 0) return false
  return (
    point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  )
}

/** Is the pointer over some other panel's trigger? */
export function isPointOnAnotherTrigger(
  point: { x: number; y: number },
  self: InteractiveTooltip,
): boolean {
  for (const entry of registry) {
    if (entry === self) continue
    const element = entry.trigger()
    if (element && containsPoint(element, point)) return true
  }
  return false
}

/** Closes every other open panel, so only one is ever on screen. */
export function hideOtherInteractiveTooltips(self: InteractiveTooltip): void {
  for (const entry of registry) {
    if (entry !== self) entry.hide()
  }
}

/** Test seam — the registry is module state shared across instances. */
export function resetInteractiveTooltipRegistry(): void {
  registry.clear()
}
