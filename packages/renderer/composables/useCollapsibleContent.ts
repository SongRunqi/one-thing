import { ref, watch, nextTick, onMounted, onUnmounted, toValue, type MaybeRefOrGetter, type Ref } from 'vue'

interface UseCollapsibleContentOptions {
  /** The element whose scrollHeight decides whether content overflows. */
  contentRef: Ref<HTMLElement | null>
  /** Overflow tracking is active only while this is true. */
  enabled: MaybeRefOrGetter<boolean>
  /** When streaming flips to false, long content re-collapses. */
  isStreaming: MaybeRefOrGetter<boolean>
  /**
   * Watched so overflow re-checks after content swaps that remount the
   * observed element (e.g. leaving edit mode) — a ResizeObserver keeps
   * watching the detached node in that case.
   */
  content: MaybeRefOrGetter<string>
  maxCollapsedHeight?: number
}

// Collapse-to-height behavior for long message content: tracks whether the
// content overflows a max height and exposes a collapsed/expanded toggle.
export function useCollapsibleContent(options: UseCollapsibleContentOptions) {
  const maxCollapsedHeight = options.maxCollapsedHeight ?? 300
  const isCollapsed = ref(true)
  const isOverflowing = ref(false)
  let resizeObserver: ResizeObserver | null = null

  function checkOverflow() {
    if (!toValue(options.enabled)) {
      isOverflowing.value = false
      return
    }
    const el = options.contentRef.value
    if (!el) return
    isOverflowing.value = el.scrollHeight > maxCollapsedHeight
  }

  function toggleCollapse() {
    isCollapsed.value = !isCollapsed.value
  }

  function setupResizeObserver() {
    if (!toValue(options.enabled)) {
      isOverflowing.value = false
      return
    }
    const el = options.contentRef.value
    if (!el) return

    resizeObserver = new ResizeObserver(() => {
      checkOverflow()
    })
    resizeObserver.observe(el)

    checkOverflow()
  }

  function cleanupResizeObserver() {
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
  }

  // Reset collapse state when streaming ends so long content re-collapses
  watch(
    () => toValue(options.isStreaming),
    (newVal, oldVal) => {
      if (!toValue(options.enabled)) return
      if (!newVal && oldVal) {
        nextTick(() => {
          checkOverflow()
          isCollapsed.value = true
        })
      }
    },
  )

  // Re-check overflow when content changes (streaming chunks, edits, etc.)
  watch(
    () => toValue(options.content),
    () => {
      if (!toValue(options.enabled)) return
      nextTick(() => checkOverflow())
    },
  )

  watch(
    () => toValue(options.enabled),
    (enabled) => {
      cleanupResizeObserver()
      isOverflowing.value = false
      if (enabled) {
        nextTick(() => setupResizeObserver())
      }
    },
  )

  onMounted(() => {
    nextTick(() => setupResizeObserver())
  })

  onUnmounted(() => {
    cleanupResizeObserver()
  })

  return { isCollapsed, isOverflowing, toggleCollapse, maxCollapsedHeight }
}
