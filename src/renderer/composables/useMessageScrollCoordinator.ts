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

export function useMessageScrollCoordinator(options: UseMessageScrollCoordinatorOptions) {
  let mode: MessageScrollMode = { type: 'idle' }
  let restoreFrame: number | null = null

  function getMaxScrollTop(el: HTMLElement): number {
    return Math.max(0, el.scrollHeight - el.clientHeight)
  }

  function writeScrollTop(target: number) {
    const scroller = options.scroller.value
    if (!scroller) return
    if (Math.abs(scroller.scrollTop - target) <= DRIFT_EPSILON_PX) return
    scroller.scrollTop = target
    options.onStateChange?.()
  }

  function clear() {
    mode = { type: 'idle' }
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

  function setTail() {
    mode = { type: 'tail' }
    pinTail()
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
