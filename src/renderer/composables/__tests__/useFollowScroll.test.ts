import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import {
  FOLLOW_BOTTOM_GAP,
  getNaturalBottomDistance,
  shouldShowScrollToBottomButton,
  useFollowScroll,
} from '../useFollowScroll'

describe('useFollowScroll geometry helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('treats following as the natural scroll bottom', () => {
    const geometry = {
      scrollHeight: 1200 + FOLLOW_BOTTOM_GAP,
      clientHeight: 500,
      scrollTop: 1200 + FOLLOW_BOTTOM_GAP - 500,
    }

    expect(getNaturalBottomDistance(geometry)).toBe(0)
  })

  it('does not show the bottom button when only the visual tail space is present', () => {
    const nearBottom = {
      scrollHeight: 1200 + FOLLOW_BOTTOM_GAP,
      clientHeight: 500,
      scrollTop: 1200 + FOLLOW_BOTTOM_GAP - 500 - 48,
    }

    expect(shouldShowScrollToBottomButton(nearBottom, false)).toBe(false)
  })

  it('shows the bottom button only when genuinely away from the natural bottom', () => {
    const away = {
      scrollHeight: 2000,
      clientHeight: 500,
      scrollTop: 1000,
    }

    expect(shouldShowScrollToBottomButton(away, false)).toBe(true)
    expect(shouldShowScrollToBottomButton(away, true)).toBe(false)
  })

  it('releases session-switch suppression when explicitly snapping to bottom', () => {
    const follow = useFollowScroll({
      scroller: ref(null),
      content: ref(null),
      count: computed(() => 0),
    })

    follow.prepareForSwitch()
    expect(follow.isSuppressed()).toBe(true)

    follow.snapToBottom('test')
    expect(follow.isSuppressed()).toBe(false)
  })

  it('pins to bottom synchronously during content resize while following', () => {
    let resizeCallback: ResizeObserverCallback | null = null
    class FakeResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback
      }

      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)

    const scroller = {
      scrollTop: 500,
      scrollHeight: 1200,
      clientHeight: 500,
    }
    const content = {}

    useFollowScroll({
      scroller: ref(scroller as HTMLElement),
      content: ref(content as HTMLElement),
      count: computed(() => 1),
    })

    scroller.scrollHeight = 1260
    expect(resizeCallback).toBeTypeOf('function')
    const triggerResize = resizeCallback as unknown as ResizeObserverCallback
    triggerResize([] as unknown as ResizeObserverEntry[], {} as ResizeObserver)

    expect(scroller.scrollTop).toBe(760)
  })

  it('pins to bottom synchronously during content mutation while following', () => {
    let mutationCallback: MutationCallback | null = null
    class FakeResizeObserver {
      observe() {}
      disconnect() {}
    }
    class FakeMutationObserver {
      constructor(callback: MutationCallback) {
        mutationCallback = callback
      }

      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    vi.stubGlobal('MutationObserver', FakeMutationObserver)

    const scroller = {
      scrollTop: 500,
      scrollHeight: 1200,
      clientHeight: 500,
    }
    const content = {}

    useFollowScroll({
      scroller: ref(scroller as HTMLElement),
      content: ref(content as HTMLElement),
      count: computed(() => 1),
    })

    scroller.scrollHeight = 1280
    expect(mutationCallback).toBeTypeOf('function')
    const triggerMutation = mutationCallback as unknown as MutationCallback
    triggerMutation([] as unknown as MutationRecord[], {} as MutationObserver)

    expect(scroller.scrollTop).toBe(780)
  })

  it('does not pin layout changes after the user scrolls away from the bottom', () => {
    let resizeCallback: ResizeObserverCallback | null = null
    class FakeResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resizeCallback = callback
      }

      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)

    const scroller = {
      scrollTop: 700,
      scrollHeight: 1200,
      clientHeight: 500,
    }
    const content = {}
    const follow = useFollowScroll({
      scroller: ref(scroller as HTMLElement),
      content: ref(content as HTMLElement),
      count: computed(() => 1),
    })

    follow.onWheel({ deltaY: -1 } as WheelEvent)
    scroller.scrollHeight = 1400
    const triggerResize = resizeCallback as unknown as ResizeObserverCallback
    triggerResize([] as unknown as ResizeObserverEntry[], {} as ResizeObserver)

    expect(follow.isFollowing.value).toBe(false)
    expect(scroller.scrollTop).toBe(700)
  })
})
