import { ref, watch, onUnmounted, type Ref } from 'vue'

interface UseAutoScrollOptions {
  scrollElement: Ref<HTMLElement | null>
  messageCount: Ref<number>
  scrollVersion: Ref<number>
  isLoading: Ref<boolean>
  scrollToEnd: () => void
}

/**
 * Auto-scroll composable with user-interaction-based state machine.
 *
 * Two states:
 *   FOLLOWING  — auto-scroll active, new chunks scroll to bottom
 *   DETACHED   — auto-scroll disabled, user is reading history
 *
 * Transitions:
 *   FOLLOWING → DETACHED:  user scrolls up (wheel deltaY < 0)
 *   DETACHED → FOLLOWING:  user scrolls down to bottom (wheel + scroll near bottom)
 *                          OR sends a message (scrollToBottom API)
 */
export function useAutoScroll(options: UseAutoScrollOptions) {
  const { scrollElement, messageCount, scrollVersion, isLoading, scrollToEnd } = options

  // ── State ──────────────────────────────────
  const isFollowing = ref(true)
  let suppressed = false
  let userInteracting = false
  let interactionTimer: ReturnType<typeof setTimeout> | null = null
  let pendingScroll: number | null = null

  // Track whether the user's latest wheel gesture is downward.
  // Only a confirmed downward wheel gesture can re-enable following.
  let wheelDirection: 'up' | 'down' | null = null

  // ── Helpers ────────────────────────────────
  function isNearBottom(): boolean {
    const el = scrollElement.value
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 25
  }

  function clearInteractionTimer() {
    if (interactionTimer !== null) {
      clearTimeout(interactionTimer)
      interactionTimer = null
    }
  }

  function startInteractionTimer() {
    clearInteractionTimer()
    interactionTimer = setTimeout(() => {
      userInteracting = false
      // After user stops interacting, check if they ended up at bottom
      // while their last gesture was downward
      if (!isFollowing.value && wheelDirection === 'down' && isNearBottom()) {
        isFollowing.value = true
      }
      wheelDirection = null
    }, 200)
  }

  // ── Input Event Handlers ───────────────────
  function onWheel(e: WheelEvent) {
    if (e.deltaY < 0) {
      // Scrolling UP — detach immediately
      isFollowing.value = false
      wheelDirection = 'up'
    } else if (e.deltaY > 0) {
      wheelDirection = 'down'
    }
    userInteracting = true
    startInteractionTimer()
  }

  function onPointerDown() {
    userInteracting = true
    const onPointerUp = () => {
      document.removeEventListener('pointerup', onPointerUp)
      startInteractionTimer()
    }
    document.addEventListener('pointerup', onPointerUp)
  }

  function onKeyDown(e: KeyboardEvent) {
    const scrollKeys = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']
    if (!scrollKeys.includes(e.key)) return
    if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'Home') {
      isFollowing.value = false
    }
    userInteracting = true
    startInteractionTimer()
  }

  // ── Auto-scroll Watcher ────────────────────
  const stopWatch = watch(
    [scrollVersion, messageCount, isLoading],
    () => {
      if (suppressed || !isFollowing.value || userInteracting) return

      if (pendingScroll === null) {
        pendingScroll = requestAnimationFrame(() => {
          pendingScroll = null
          if (!isFollowing.value || userInteracting || suppressed) return
          if (messageCount.value > 0) {
            scrollToEnd()
          }
        })
      }
    }
  )

  // ── Public API ─────────────────────────────
  function scrollToBottom() {
    isFollowing.value = true
    userInteracting = false
    wheelDirection = null
    clearInteractionTimer()
    scrollToEnd()
  }

  function suppress() {
    suppressed = true
    if (pendingScroll !== null) {
      cancelAnimationFrame(pendingScroll)
      pendingScroll = null
    }
  }

  function unsuppress() {
    suppressed = false
  }

  function restoreState(following: boolean) {
    isFollowing.value = following
  }

  function attach() {
    const el = scrollElement.value
    if (!el) return
    el.addEventListener('wheel', onWheel, { passive: true })
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('keydown', onKeyDown)
  }

  function detach() {
    const el = scrollElement.value
    if (el) {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('keydown', onKeyDown)
    }
    clearInteractionTimer()
    if (pendingScroll !== null) {
      cancelAnimationFrame(pendingScroll)
      pendingScroll = null
    }
    stopWatch()
  }

  onUnmounted(detach)

  return {
    isFollowing,
    get isSuppressed() { return suppressed },
    scrollToBottom,
    suppress,
    unsuppress,
    restoreState,
    attach,
    detach,
  }
}
