import { onUnmounted, type Ref } from 'vue'

export type MessageScrollMode =
  | { type: 'idle' }
  | { type: 'tail' }
  | {
      type: 'anchor'
      sessionId: string
      messageId: string
      offsetWithinMessage: number
      until: number
    }

interface UseMessageScrollCoordinatorOptions {
  scroller: Ref<HTMLElement | null>
  getSessionId: () => string | undefined
  getMessageRowById: (messageId: string) => HTMLElement | null
  onStateChange?: () => void
}

const DRIFT_EPSILON_PX = 2
const DEFAULT_ANCHOR_DURATION_MS = 2400
const DEFAULT_SMOOTH_SCROLL_MS = 260

interface ScrollWriteOptions {
  behavior?: ScrollBehavior
  durationMs?: number
}

export function useMessageScrollCoordinator(options: UseMessageScrollCoordinatorOptions) {
  let mode: MessageScrollMode = { type: 'idle' }
  let restoreFrame: number | null = null
  let smoothFrame: number | null = null
  let smoothToken = 0

  function getMaxScrollTop(el: HTMLElement): number {
    return Math.max(0, el.scrollHeight - el.clientHeight)
  }

  function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  function cancelSmoothScroll() {
    smoothToken++
    if (smoothFrame !== null) {
      cancelAnimationFrame(smoothFrame)
      smoothFrame = null
    }
  }

  function applyScrollTop(target: number) {
    const scroller = options.scroller.value
    if (!scroller) return
    if (Math.abs(scroller.scrollTop - target) <= DRIFT_EPSILON_PX) return
    scroller.scrollTop = target
    options.onStateChange?.()
  }

  function easeOutCubic(t: number): number {
    return 1 - Math.pow(1 - t, 3)
  }

  function animateScrollTop(target: number, durationMs = DEFAULT_SMOOTH_SCROLL_MS) {
    const scroller = options.scroller.value
    if (!scroller || prefersReducedMotion()) {
      applyScrollTop(target)
      return
    }

    cancelSmoothScroll()
    const token = smoothToken
    const startTop = scroller.scrollTop
    const distance = target - startTop
    if (Math.abs(distance) <= DRIFT_EPSILON_PX) return

    const startedAt = performance.now()
    const tick = (now: number) => {
      if (token !== smoothToken) return
      const progress = Math.min(1, (now - startedAt) / Math.max(1, durationMs))
      applyScrollTop(startTop + distance * easeOutCubic(progress))
      if (progress < 1) {
        smoothFrame = requestAnimationFrame(tick)
      } else {
        smoothFrame = null
        applyScrollTop(target)
      }
    }

    smoothFrame = requestAnimationFrame(tick)
  }

  function writeScrollTop(target: number, writeOptions: ScrollWriteOptions = {}) {
    if (writeOptions.behavior === 'smooth') {
      animateScrollTop(target, writeOptions.durationMs)
      return
    }
    cancelSmoothScroll()
    applyScrollTop(target)
  }

  function clear() {
    mode = { type: 'idle' }
    cancelSmoothScroll()
    if (restoreFrame !== null) {
      cancelAnimationFrame(restoreFrame)
      restoreFrame = null
    }
  }

  function isAnchored(): boolean {
    if (mode.type !== 'anchor') return false
    if (mode.sessionId !== options.getSessionId() || performance.now() > mode.until) {
      clear()
      return false
    }
    return true
  }

  function restoreAnchorNow() {
    if (!isAnchored() || mode.type !== 'anchor') return
    const scroller = options.scroller.value
    const row = options.getMessageRowById(mode.messageId)
    if (!scroller || !row) return

    const target = row.offsetTop + mode.offsetWithinMessage
    const drift = target - scroller.scrollTop
    if (Math.abs(drift) <= DRIFT_EPSILON_PX) {
      options.onStateChange?.()
      return
    }

    writeScrollTop(target)
  }

  function scheduleRestoreAnchor() {
    if (!isAnchored()) return
    if (restoreFrame !== null) return
    restoreFrame = requestAnimationFrame(() => {
      restoreFrame = null
      restoreAnchorNow()
    })
  }

  function pinTail() {
    const scroller = options.scroller.value
    if (!scroller) return
    writeScrollTop(getMaxScrollTop(scroller))
  }

  function setTail(writeOptions: ScrollWriteOptions = {}) {
    mode = { type: 'tail' }
    const scroller = options.scroller.value
    if (!scroller) return
    writeScrollTop(getMaxScrollTop(scroller), writeOptions)
    requestAnimationFrame(() => {
      if (mode.type === 'tail') pinTail()
    })
  }

  function setAnchor(messageId: string, offsetWithinMessage: number, durationMs = DEFAULT_ANCHOR_DURATION_MS) {
    const sessionId = options.getSessionId()
    if (!sessionId) return
    mode = {
      type: 'anchor',
      sessionId,
      messageId,
      offsetWithinMessage,
      until: performance.now() + durationMs,
    }
    restoreAnchorNow()
    requestAnimationFrame(() => {
      restoreAnchorNow()
      requestAnimationFrame(restoreAnchorNow)
    })
  }

  function onLayoutChange() {
    if (mode.type === 'tail') {
      pinTail()
      return
    }
    if (mode.type === 'anchor') {
      scheduleRestoreAnchor()
    }
  }

  onUnmounted(clear)

  return {
    clear,
    isAnchored,
    onLayoutChange,
    setAnchor,
    setTail,
    writeScrollTop,
  }
}
