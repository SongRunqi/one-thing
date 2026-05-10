type HydrationTask = () => void

const hydrationQueue: HydrationTask[] = []
let hydrationScheduled = false

const requestIdle =
  typeof window !== 'undefined' && 'requestIdleCallback' in window
    ? (callback: () => void) => window.requestIdleCallback(callback, { timeout: 240 })
    : (callback: () => void) => window.setTimeout(callback, 32)

export function enqueueMarkdownHydration(task: HydrationTask) {
  hydrationQueue.push(task)
  scheduleHydrationQueue()
}

function scheduleHydrationQueue() {
  if (hydrationScheduled) return
  hydrationScheduled = true
  requestIdle(() => {
    hydrationScheduled = false
    const task = hydrationQueue.shift()
    task?.()
    if (hydrationQueue.length > 0) {
      requestAnimationFrame(scheduleHydrationQueue)
    }
  })
}
