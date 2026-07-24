import { afterEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useMessageScrollCoordinator } from '../useMessageScrollCoordinator'

describe('useMessageScrollCoordinator', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  interface MutableScroller {
    scrollTop: number
    scrollHeight: number
    clientHeight: number
  }

  function setupScroller() {
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(performance.now())
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const scroller = {
      scrollTop: 500,
      scrollHeight: 1000,
      clientHeight: 500,
    }

    const coordinator = useMessageScrollCoordinator({
      scroller: ref(scroller as HTMLElement),
      getSessionId: () => 'session-1',
      getMessageRowById: () => null,
    })

    return { coordinator, scroller: scroller as MutableScroller }
  }

  it('keeps semantic tail pinned through layout growth', () => {
    const { coordinator, scroller } = setupScroller()

    coordinator.setTail()
    expect(coordinator.isTail()).toBe(true)
    expect(scroller.scrollTop).toBe(500)

    scroller.scrollHeight = 1300
    coordinator.onLayoutChange()

    expect(scroller.scrollTop).toBe(800)
  })

  it('does not pin layout growth after tail mode is cleared', () => {
    const { coordinator, scroller } = setupScroller()

    coordinator.setTail()
    coordinator.clear()
    scroller.scrollHeight = 1300
    coordinator.onLayoutChange()

    expect(coordinator.isTail()).toBe(false)
    expect(scroller.scrollTop).toBe(500)
  })
})
