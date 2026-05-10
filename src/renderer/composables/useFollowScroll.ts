/**
 * Native chat follow scrolling.
 *
 * "Following" has one source of truth: the browser's natural scroll bottom
 * (`scrollHeight - clientHeight`). Visual space above the composer is real
 * tail padding in the message list, not an artificial anchor correction.
 */

import { getCurrentInstance, nextTick, onUnmounted, ref, watch, type ComputedRef, type Ref } from 'vue'
import { isTraceEnabled, traceEvent } from '@/utils/stream-scroll-trace'

export const FOLLOW_BOTTOM_GAP = 64

const BOTTOM_EPSILON_PX = 0.75
const USER_DETACH_REATTACH_LOCK_MS = 700
export const SHOW_SCROLL_TO_BOTTOM_DISTANCE_PX = 160

const raf =
  typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : (callback: FrameRequestCallback) =>
        globalThis.setTimeout(() => callback(performance.now()), 16) as unknown as number
const caf =
  typeof cancelAnimationFrame === 'function'
    ? cancelAnimationFrame
    : (frame: number) => globalThis.clearTimeout(frame)

export interface ScrollGeometry {
  scrollHeight: number
  scrollTop: number
  clientHeight: number
}

export function getNaturalBottomDistance(geometry: ScrollGeometry): number {
  return Math.max(0, geometry.scrollHeight - geometry.clientHeight) - geometry.scrollTop
}

export function shouldShowScrollToBottomButton(
  geometry: ScrollGeometry,
  isFollowing: boolean,
): boolean {
  return !isFollowing && getNaturalBottomDistance(geometry) > SHOW_SCROLL_TO_BOTTOM_DISTANCE_PX
}

export interface FollowSnapshot {
  firstVisibleIndex: number
  offsetWithinMessage: number
  isFollowing: boolean
}

export interface UseFollowScrollOptions {
  scroller: Ref<HTMLElement | null>
  content: Ref<HTMLElement | null>
  count: ComputedRef<number>
}

export function useFollowScroll(opts: UseFollowScrollOptions) {
  const isFollowing = ref(true)
  let suppressed = false
  let followFrame: number | null = null
  let followBurstFrames = 0
  let reattachLockedUntil = 0
  let lastUserScrollDirection: 'up' | 'down' | null = null
  let contentResizeObserver: ResizeObserver | null = null
  let contentMutationObserver: MutationObserver | null = null
  let lastObservedScrollHeight = 0

  function getMaxScrollTop(el: HTMLElement): number {
    return Math.max(0, el.scrollHeight - el.clientHeight)
  }

  function traceScroll(
    source: string,
    data: {
      action?: string
      beforeScrollTop?: number | null
      afterScrollTop?: number | null
      targetScrollTop?: number | null
      extra?: string
    } = {},
  ) {
    if (!isTraceEnabled()) return
    traceEvent(source, () => opts.scroller.value, {
      isFollowing: isFollowing.value,
      isSuppressed: suppressed,
      virtualizerTotalSize: null,
      ...data,
    })
  }

  function writeScrollTop(el: HTMLElement, target: number, source: string, action: string) {
    const before = el.scrollTop
    el.scrollTop = target
    traceScroll(source, {
      action,
      beforeScrollTop: before,
      afterScrollTop: el.scrollTop,
      targetScrollTop: target,
    })
  }

  function pinToBottom(source = 'pinToBottom') {
    if (!isFollowing.value || suppressed) return
    const el = opts.scroller.value
    if (!el) return
    const target = getMaxScrollTop(el)
    if (Math.abs(target - el.scrollTop) <= BOTTOM_EPSILON_PX) return
    writeScrollTop(el, target, source, 'write:natural-bottom')
  }

  function schedulePinToBottom(source = 'schedulePinToBottom') {
    if (followFrame !== null) return
    followFrame = raf(() => {
      followFrame = null
      pinToBottom(source)
      if (followBurstFrames > 0) {
        followBurstFrames--
        schedulePinToBottom(`${source}:burst`)
      }
    })
  }

  function pinToBottomThroughLayout(source = 'pinToBottomThroughLayout') {
    // ResizeObserver fires after layout and before paint. Pinning immediately
    // here avoids the single visible frame where content has grown but the
    // scroll position still points at the old bottom.
    pinToBottom(source)
    if (followBurstFrames < 2) followBurstFrames = 2
    schedulePinToBottom(`${source}:settle`)
  }

  function pinToBottomAfterMutation(source = 'MutationObserver:content') {
    const el = opts.scroller.value
    if (!el) return
    const scrollHeight = el.scrollHeight
    if (scrollHeight === lastObservedScrollHeight) return
    lastObservedScrollHeight = scrollHeight
    pinToBottomThroughLayout(source)
  }

  function cancelScheduledPin() {
    if (followFrame === null) return
    caf(followFrame)
    followFrame = null
  }

  function snapToBottom(source = 'snapToBottom') {
    suppressed = false
    isFollowing.value = true
    reattachLockedUntil = 0
    lastUserScrollDirection = 'down'
    cancelScheduledPin()
    followBurstFrames = 4
    nextTick(() => {
      pinToBottom(`${source}:tick`)
      schedulePinToBottom(source)
    })
  }

  function nudgeToAnchor(source = 'nudgeToAnchor') {
    pinToBottomThroughLayout(source)
  }

  function allowOneScroll() {
    traceScroll('allowOneScroll', { action: 'noop:native-scroll' })
  }

  function checkReattach() {
    const el = opts.scroller.value
    if (!el) return

    const distance = getNaturalBottomDistance(el)
    if (isFollowing.value) {
      if (distance > BOTTOM_EPSILON_PX && !suppressed) {
        schedulePinToBottom('scroll:follow-drift')
      }
      return
    }

    const canAutoReattach =
      performance.now() >= reattachLockedUntil &&
      lastUserScrollDirection === 'down' &&
      distance <= BOTTOM_EPSILON_PX

    if (canAutoReattach) {
      isFollowing.value = true
      reattachLockedUntil = 0
      schedulePinToBottom('scroll:reattach-natural-bottom')
    }
  }

  function onWheel(e: WheelEvent) {
    if (e.deltaY === 0) return
    lastUserScrollDirection = e.deltaY < 0 ? 'up' : 'down'

    if (e.deltaY < 0) {
      reattachLockedUntil = performance.now() + USER_DETACH_REATTACH_LOCK_MS
      if (isFollowing.value) {
        isFollowing.value = false
        cancelScheduledPin()
        traceScroll('wheel:detach', { action: 'state:following-false' })
      }
    }
  }

  watch(
    opts.content,
    (el) => {
      contentResizeObserver?.disconnect()
      contentResizeObserver = null
      contentMutationObserver?.disconnect()
      contentMutationObserver = null
      if (!el || typeof ResizeObserver === 'undefined') return
      lastObservedScrollHeight = opts.scroller.value?.scrollHeight ?? 0
      contentResizeObserver = new ResizeObserver(() => pinToBottomThroughLayout('ResizeObserver:content'))
      contentResizeObserver.observe(el)
      if (typeof MutationObserver !== 'undefined') {
        contentMutationObserver = new MutationObserver(() => pinToBottomAfterMutation('MutationObserver:content'))
        contentMutationObserver.observe(el, {
          childList: true,
          subtree: true,
          characterData: true,
        })
      }
    },
    { immediate: true },
  )

  const cleanup = () => {
    cancelScheduledPin()
    contentResizeObserver?.disconnect()
    contentResizeObserver = null
    contentMutationObserver?.disconnect()
    contentMutationObserver = null
  }

  if (getCurrentInstance()) {
    onUnmounted(cleanup)
  }

  function getMessageElements(): HTMLElement[] {
    const content = opts.content.value
    if (!content) return []
    return Array.from(content.querySelectorAll<HTMLElement>('[data-index]'))
  }

  function captureSnapshot(): FollowSnapshot {
    const scroller = opts.scroller.value
    if (!scroller) {
      return { firstVisibleIndex: 0, offsetWithinMessage: 0, isFollowing: isFollowing.value }
    }

    const anchor = scroller.scrollTop
    let firstVisibleIndex = 0
    let offsetWithinMessage = 0
    for (const el of getMessageElements()) {
      const index = Number(el.dataset.index)
      const top = el.offsetTop
      const bottom = top + el.offsetHeight
      if (bottom >= anchor) {
        firstVisibleIndex = Number.isFinite(index) ? index : 0
        offsetWithinMessage = Math.max(0, anchor - top)
        break
      }
    }
    return { firstVisibleIndex, offsetWithinMessage, isFollowing: isFollowing.value }
  }

  function prepareForSwitch() {
    suppressed = true
    cancelScheduledPin()
  }

  function restoreSnapshot(
    snap: FollowSnapshot,
    onBeforeFollowingJump?: () => void,
  ) {
    isFollowing.value = snap.isFollowing
    reattachLockedUntil = 0
    lastUserScrollDirection = snap.isFollowing ? 'down' : null
    nextTick(() => {
      const scroller = opts.scroller.value
      if (!scroller) {
        suppressed = false
        return
      }

      if (snap.isFollowing && opts.count.value > 0) {
        suppressed = false
        onBeforeFollowingJump?.()
        snapToBottom('restoreSnapshot:following')
        return
      }

      const target = opts.content.value?.querySelector<HTMLElement>(`[data-index="${snap.firstVisibleIndex}"]`)
      if (target) {
        writeScrollTop(
          scroller,
          target.offsetTop + Math.max(0, snap.offsetWithinMessage),
          'restoreSnapshot:offsetWithinMessage',
          'write:restore-offset',
        )
      }
      suppressed = false
    })
  }

  return {
    isFollowing,
    isSwitching: () => suppressed,
    isSuppressed: () => suppressed,
    snapToBottom,
    nudgeToAnchor,
    allowOneScroll,
    onWheel,
    checkReattach,
    prepareForSwitch,
    restoreSnapshot,
    captureSnapshot,
  }
}
