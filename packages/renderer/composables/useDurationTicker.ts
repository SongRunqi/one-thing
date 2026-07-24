import { onScopeDispose, ref, type Ref } from 'vue'

/**
 * Shared 100ms clock for live duration displays. One interval serves every
 * subscriber (refcounted), and 100ms matches the 0.1s display precision of
 * formatToolDuration — ticking faster buys nothing visually.
 */
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null
let subscribers = 0
const TICK_MS = 100

export function useDurationTicker(): Ref<number> {
  subscribers++
  if (!timer) {
    now.value = Date.now()
    timer = setInterval(() => {
      now.value = Date.now()
    }, TICK_MS)
  }
  onScopeDispose(() => {
    subscribers--
    if (subscribers <= 0 && timer) {
      clearInterval(timer)
      timer = null
    }
  })
  return now
}
