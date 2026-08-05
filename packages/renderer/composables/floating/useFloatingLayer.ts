/**
 * `useFloatingLayer()` — the one positioning kernel for every floating layer.
 *
 * Rule (docs/design/ui-system.md §1): business components do not write floating
 * mechanics. Positioning, Teleport, z-index, Esc/outside-click and focus return
 * live here; the component supplies content. `position: fixed` + Teleport to
 * body is the ONLY mode — a layer that lives inside a scroll container gets
 * clipped, and every hand-rolled panel in this repo eventually learned that.
 *
 * Distilled from the three mature implementations it replaces:
 *   - Tooltip.vue      — capture-phase scroll tracking (the scroller is an
 *                        ancestor of the trigger, its scroll does not bubble)
 *                        and re-measuring after mount instead of guessing.
 *   - Select.vue       — anchor rect re-read on resize/scroll, width matching.
 *   - Table.vue        — viewport clamping of a menu opened near an edge.
 *
 * Extension points, deliberately left open for the hover family that P1 does
 * NOT fold in (`common/safe-triangle.ts`, `common/interactive-tooltip-registry.ts`
 * stay Tooltip-private for now):
 *   - `onPositioned(result, ctx)` fires after every placement with the resolved
 *     side — that is exactly what `buildSafeTriangle(point, panelRect, side)`
 *     needs to aim its wedge, so an interactive-hover layer can be built on top
 *     without reaching into the kernel.
 *   - `closeOn.outside` is intentionally a pointer *position* question; a hover
 *     variant plugs in by leaving it off and driving `hide()` from its own
 *     pointer arbiter (see Tooltip's `handlePointerMove`).
 */
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  shallowRef,
  toValue,
  watch,
  type CSSProperties,
  type MaybeRefOrGetter,
  type Ref,
} from 'vue'
import {
  computePosition,
  DEFAULT_MARGIN,
  DEFAULT_OFFSET,
  DEFAULT_PLACEMENT,
  type AnchorRect,
  type ComputedPosition,
  type FloatingPlacement,
} from './compute-position'
import { createFocusReturn, trapTabKey } from './useFocusTrap'

/** Right-click / caret anchors: a point, not an element. */
export interface VirtualAnchor {
  x: number
  y: number
}

export type FloatingAnchor =
  | HTMLElement
  | VirtualAnchor
  | { $el?: unknown }
  | null
  | undefined

/**
 * Stops of the z-index ladder (docs/design/ui-system.md §3). Business code never
 * writes a number; it picks a stop and, if it must sit above a sibling in the
 * same stop, an offset (`n ≤ 30`).
 */
export type FloatingZLayer =
  | 'sticky'
  | 'dropdown'
  | 'sidebar'
  | 'overlay'
  | 'modal'
  | 'tooltip'
  | 'toast'
  | 'max'

export interface FloatingCloseOn {
  esc?: boolean
  outside?: boolean
  scroll?: boolean
}

export type FloatingCloseReason = 'esc' | 'outside' | 'scroll'

export interface UseFloatingLayerOptions {
  /** Element or virtual point the layer hangs off. */
  anchor: MaybeRefOrGetter<FloatingAnchor>
  placement?: MaybeRefOrGetter<FloatingPlacement>
  offset?: MaybeRefOrGetter<number>
  flip?: MaybeRefOrGetter<boolean>
  clamp?: MaybeRefOrGetter<boolean>
  /** Viewport gutter kept around the layer. */
  margin?: MaybeRefOrGetter<number>
  /** Track scroll/resize/size changes while open. Default true. */
  autoUpdate?: boolean
  zLayer?: MaybeRefOrGetter<FloatingZLayer>
  /** Relative order inside the stop: `calc(var(--z-x) + n)`, n ≤ 30. */
  zOffset?: MaybeRefOrGetter<number>
  /**
   * Escape hatch for "follow the host's stacking level": pass a full z-index
   * expression (e.g. `'calc(var(--z-modal) + 20)'`) when the layer must beat
   * whatever it was opened from — a Select inside a Dialog, a context menu over
   * a modal. This is the mechanised form of the two exceptions recorded in
   * docs/design/ui-system.md §3.
   */
  baseZ?: MaybeRefOrGetter<string | undefined>
  /** Fixed width for the layer; `'anchor'` matches the anchor's width. */
  width?: MaybeRefOrGetter<number | string | 'anchor' | undefined>
  closeOn?: MaybeRefOrGetter<FloatingCloseOn | undefined>
  /** Keep Tab inside the layer (Dialog, P2). */
  trapFocus?: MaybeRefOrGetter<boolean>
  /** Give focus back to whatever had it when the layer opened. */
  returnFocus?: MaybeRefOrGetter<boolean>
  /** External open state (a Popover's `v-model:open`); omit to own one. */
  open?: Ref<boolean>
  onPositioned?: (position: ComputedPosition, context: { floating: HTMLElement }) => void
  /** Vetoable close request from esc/outside/scroll; return false to keep open. */
  onRequestClose?: (reason: FloatingCloseReason) => boolean | void
}

export interface FloatingLayerHandle {
  open: Ref<boolean>
  show: () => void
  hide: () => void
  toggle: () => void
  /** Bind with `:ref="setFloatingEl"` on the layer's root element. */
  setFloatingEl: (el: unknown) => void
  floatingEl: Ref<HTMLElement | null>
  floatingStyle: Ref<CSSProperties>
  /** The resolved z-index expression, for siblings that must sit just under it. */
  zIndex: Ref<string>
  /** Placement actually in use (post-flip); null until first measurement. */
  placement: Ref<FloatingPlacement | null>
  position: Ref<ComputedPosition | null>
  /** Re-measure and re-place now. */
  update: () => void
}

/** Unwraps a template ref that may hold a component instance instead of an element. */
function resolveElement(value: unknown): HTMLElement | null {
  if (!value) return null
  if (value instanceof HTMLElement) return value
  const el = (value as { $el?: unknown }).$el
  return el instanceof HTMLElement ? el : null
}

function isVirtualAnchor(value: unknown): value is VirtualAnchor {
  return !!value && typeof value === 'object'
    && typeof (value as VirtualAnchor).x === 'number'
    && typeof (value as VirtualAnchor).y === 'number'
}

export function useFloatingLayer(options: UseFloatingLayerOptions): FloatingLayerHandle {
  const open = options.open ?? ref(false)
  const floatingEl = ref<HTMLElement | null>(null)
  const position = shallowRef<ComputedPosition | null>(null)
  // Shared with Dialog via `composables/floating/useFocusTrap` — one trap, two
  // consumers, so the Tab arithmetic cannot drift between them.
  const focusReturn = createFocusReturn()
  let resizeObserver: ResizeObserver | null = null

  const closeOn = computed<FloatingCloseOn>(() => toValue(options.closeOn) ?? {})

  const zIndex = computed(() => {
    const explicit = toValue(options.baseZ)
    if (explicit) return explicit
    const layer = toValue(options.zLayer) ?? 'dropdown'
    const offset = toValue(options.zOffset) ?? 0
    return offset ? `calc(var(--z-${layer}) + ${offset})` : `var(--z-${layer})`
  })

  function anchorElement(): HTMLElement | null {
    const value = toValue(options.anchor)
    return resolveElement(value)
  }

  function anchorRect(): AnchorRect | null {
    const value = toValue(options.anchor)
    const el = resolveElement(value)
    if (el) {
      const rect = el.getBoundingClientRect()
      return { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
    }
    if (isVirtualAnchor(value)) return { x: value.x, y: value.y, width: 0, height: 0 }
    return null
  }

  const floatingStyle = computed<CSSProperties>(() => {
    const pos = position.value
    const style: CSSProperties = {
      position: 'fixed',
      top: `${pos?.y ?? 0}px`,
      left: `${pos?.x ?? 0}px`,
      zIndex: zIndex.value,
    }
    // One frame at the wrong coordinates reads as a jump; measurement happens on
    // the same tick the layer mounts, so nothing is ever visibly hidden.
    if (!pos) style.visibility = 'hidden'

    const width = toValue(options.width)
    if (width === 'anchor') {
      const el = anchorElement()
      if (el) style.width = `${Math.round(el.getBoundingClientRect().width)}px`
    } else if (typeof width === 'number') {
      style.width = `${width}px`
    } else if (typeof width === 'string') {
      style.width = width
    }
    return style
  })

  const placement = computed(() => position.value?.placement ?? null)

  /** Same placement twice in a row must not look like a change (see `update`). */
  function samePosition(a: ComputedPosition | null, b: ComputedPosition): boolean {
    return !!a
      && a.x === b.x && a.y === b.y
      && a.placement === b.placement
      && a.flipped === b.flipped
      && a.clampedX === b.clampedX && a.clampedY === b.clampedY
  }

  function update() {
    const el = floatingEl.value
    const rect = anchorRect()
    if (!el || !rect) return
    // offsetWidth/Height, not getBoundingClientRect: an enter transition that
    // scales the layer would otherwise be measured mid-animation and placed
    // against a box that is about to change size.
    const size = { width: el.offsetWidth, height: el.offsetHeight }
    const next = computePosition(rect, size, {
      width: window.innerWidth,
      height: window.innerHeight,
    }, {
      placement: toValue(options.placement) ?? DEFAULT_PLACEMENT,
      offset: toValue(options.offset) ?? DEFAULT_OFFSET,
      flip: toValue(options.flip) ?? true,
      clamp: toValue(options.clamp) ?? true,
      margin: toValue(options.margin) ?? DEFAULT_MARGIN,
    })
    // `position` is a shallowRef, so writing a fresh object always re-renders —
    // and the re-render re-runs the `:ref` function, which schedules another
    // update. Value-equality here is what breaks that microtask ring; without
    // it an open layer spins forever and starves timers (it hung four renderer
    // test files stone dead before the event loop ever got a turn).
    if (samePosition(position.value, next)) return
    position.value = next
    options.onPositioned?.(next, { floating: el })
  }

  function setFloatingEl(el: unknown) {
    const next = resolveElement(el)
    // Vue invokes a function `ref` on every patch of its vnode, not only when
    // the element changes — re-entering the whole setup here is both wasted
    // work and the other half of the loop described in `update`.
    if (next === floatingEl.value) return
    floatingEl.value = next
    observeSize()
    if (next && open.value) void nextTick(update)
  }

  function requestClose(reason: FloatingCloseReason) {
    if (options.onRequestClose?.(reason) === false) return
    hide()
  }

  function eventHitsLayer(event: Event): boolean {
    const path = typeof event.composedPath === 'function' ? event.composedPath() : []
    const floating = floatingEl.value
    const anchor = anchorElement()
    if (path.length > 0) {
      return path.some(node => node === floating || node === anchor)
    }
    const target = event.target as Node | null
    if (!target) return false
    return !!(floating?.contains(target) || anchor?.contains(target))
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && closeOn.value.esc) {
      event.stopPropagation()
      requestClose('esc')
      return
    }
    if (event.key === 'Tab' && toValue(options.trapFocus)) {
      const el = floatingEl.value
      if (el) trapTabKey(el, event)
    }
  }

  function onPointerDown(event: PointerEvent | MouseEvent) {
    if (!closeOn.value.outside) return
    if (eventHitsLayer(event)) return
    requestClose('outside')
  }

  function onScroll(event: Event) {
    // A layer that scrolls its own body must not dismiss itself.
    if (eventHitsLayer(event)) return
    if (closeOn.value.scroll) {
      requestClose('scroll')
      return
    }
    if (options.autoUpdate !== false) update()
  }

  function onWheel(event: WheelEvent) {
    if (!closeOn.value.scroll) return
    if (eventHitsLayer(event)) return
    requestClose('scroll')
  }

  function onResize() {
    if (options.autoUpdate !== false) update()
  }

  function observeSize() {
    resizeObserver?.disconnect()
    resizeObserver = null
    if (!open.value || options.autoUpdate === false) return
    if (typeof ResizeObserver === 'undefined') return
    resizeObserver = new ResizeObserver(() => update())
    if (floatingEl.value) resizeObserver.observe(floatingEl.value)
    const anchor = anchorElement()
    if (anchor) resizeObserver.observe(anchor)
  }

  function bind() {
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('contextmenu', onPointerDown, true)
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    document.addEventListener('wheel', onWheel, { capture: true, passive: true })
    window.addEventListener('keydown', onKeydown, true)
    window.addEventListener('resize', onResize, { passive: true })
    observeSize()
  }

  function unbind() {
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('contextmenu', onPointerDown, true)
    document.removeEventListener('scroll', onScroll, true)
    document.removeEventListener('wheel', onWheel, true)
    window.removeEventListener('keydown', onKeydown, true)
    window.removeEventListener('resize', onResize)
    resizeObserver?.disconnect()
    resizeObserver = null
  }

  function show() {
    if (open.value) return
    open.value = true
  }

  function hide() {
    if (!open.value) return
    open.value = false
  }

  function toggle() {
    if (open.value) hide()
    else show()
  }

  watch(open, (isOpen) => {
    if (isOpen) {
      focusReturn.capture()
      bind()
      void nextTick(update)
      return
    }
    unbind()
    position.value = null
    if (toValue(options.returnFocus)) focusReturn.restore()
    else focusReturn.clear()
  }, { immediate: true })

  // The anchor can be swapped while open (a virtual anchor moving to the next
  // right-click, a trigger row re-rendering); re-place instead of stranding.
  watch(() => {
    const value = toValue(options.anchor)
    return isVirtualAnchor(value) ? `${value.x},${value.y}` : value
  }, () => {
    if (open.value) void nextTick(update)
  })

  onBeforeUnmount(unbind)

  return {
    open,
    show,
    hide,
    toggle,
    setFloatingEl,
    floatingEl,
    floatingStyle,
    zIndex,
    placement,
    position,
    update,
  }
}
