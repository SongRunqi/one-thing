import { ref, watch, onUnmounted, type Ref } from 'vue'

interface UseAutoScrollOptions {
  scrollElement: Ref<HTMLElement | null>
  messageCount: Ref<number>
  scrollVersion: Ref<number>
  isLoading: Ref<boolean>
  scrollToEnd: () => void // caller provides the virtualizer scrollToIndex call
}

/**
 * Auto-scroll composable with user-interaction-based state machine.
 *
 * Two states:
 *   FOLLOWING  — auto-scroll active, new chunks scroll to bottom
 *   DETACHED   — auto-scroll disabled, user is reading history
 *
 * Transitions:
 *   FOLLOWING → DETACHED:  user scrolls up (wheel / pointer / keyboard)
 *   DETACHED → FOLLOWING:  user scrolls to bottom, clicks button, or sends message
 *
 * Race-free because user input events (wheel, pointerdown, keydown) fire synchronously
 * as macrotasks BEFORE any scheduled rAF callback, so the `userInteracting` flag is
 * always set by the time the auto-scroll rAF executes.
 */
export function useAutoScroll(options: UseAutoScrollOptions) {
  const { scrollElement, messageCount, scrollVersion, isLoading, scrollToEnd } = options

  // ── State ──────────────────────────────────
  const isFollowing = ref(true)
  let suppressed = false           // session switch guard
  let userInteracting = false      // physical interaction in progress
  let interactionTimer: ReturnType<typeof setTimeout> | null = null
  let pendingScroll: number | null = null

  // ── Helpers ────────────────────────────────
  function isNearBottom(): boolean {
    const el = scrollElement.value
    if (!el) return true
    return el.scrollHeight - el.scrollTop - el.clientHeight < 50
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
      // If user naturally scrolled back to bottom, resume following
      if (!isFollowing.value && isNearBottom()) {
        isFollowing.value = true
      }
    }, 150)
  }

  // ── Input Event Handlers ───────────────────
  function onWheel(e: WheelEvent) {
    if (e.deltaY < 0) {
      // Scrolling UP — detach immediately
      isFollowing.value = false
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

      // Coalesce multiple chunk updates into a single rAF scroll
      if (pendingScroll === null) {
        pendingScroll = requestAnimationFrame(() => {
          pendingScroll = null
          // Re-check — user events may have fired since the watcher scheduled this rAF
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
    /** True when auto-scroll is suppressed (e.g. during session switch) */
    get isSuppressed() { return suppressed },
    scrollToBottom,
    suppress,
    unsuppress,
    restoreState,
    attach,
    detach,
  }
}
