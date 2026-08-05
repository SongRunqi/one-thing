// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { clearToasts, toast, toasts } from '@/composables/useToast'
import { destroyUiOverlayHost } from '@/services/ui-overlay-host'

/**
 * The queue's job: keep the newest message visible, retire each one on its own
 * clock, and stop that clock while the pointer is reading them.
 *
 * The host is not mounted by hand — `toast.*()` self-mounts it
 * (services/ui-overlay-host), which is what makes it callable from a store
 * action or a plain `.ts` service.
 */

function items() {
  return Array.from(document.querySelectorAll('.app-toast')) as HTMLElement[]
}

function stack() {
  return document.querySelector('.app-toast-host') as HTMLElement | null
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  clearToasts()
  destroyUiOverlayHost()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('useToast', () => {
  it('renders queued toasts with their type class', async () => {
    toast.success('saved')
    toast.error('boom')
    await nextTick()

    expect(items()).toHaveLength(2)
    expect(items()[0].classList.contains('success')).toBe(true)
    expect(items()[1].classList.contains('error')).toBe(true)
    expect(items()[1].textContent).toContain('boom')
  })

  it('keeps at most four and drops the oldest', async () => {
    for (let i = 1; i <= 6; i++) toast.info(`n${i}`)
    await nextTick()

    expect(toasts.value.map(item => item.message)).toEqual(['n3', 'n4', 'n5', 'n6'])
  })

  it('retires a toast once its duration elapses', async () => {
    toast.info('bye', { duration: 300 })
    await nextTick()
    expect(items()).toHaveLength(1)

    vi.advanceTimersByTime(200)
    await nextTick()
    expect(toasts.value).toHaveLength(1)

    vi.advanceTimersByTime(200)
    await nextTick()
    expect(toasts.value).toHaveLength(0)
  })

  it('pauses the clock while the pointer is over the stack', async () => {
    toast.info('hold', { duration: 300 })
    await nextTick()

    stack()!.dispatchEvent(new Event('pointerenter'))
    vi.advanceTimersByTime(2000)
    await nextTick()
    expect(toasts.value).toHaveLength(1)

    stack()!.dispatchEvent(new Event('pointerleave'))
    vi.advanceTimersByTime(400)
    await nextTick()
    expect(toasts.value).toHaveLength(0)
  })

  it('never retires a toast with duration 0; a click dismisses it', async () => {
    toast.error('sticky', { duration: 0 })
    await nextTick()

    vi.advanceTimersByTime(60_000)
    await nextTick()
    expect(toasts.value).toHaveLength(1)

    items()[0].click()
    await nextTick()
    expect(toasts.value).toHaveLength(0)
  })

  it('renders nothing once the queue drains', async () => {
    toast.info('gone', { duration: 100 })
    await nextTick()
    expect(stack()).not.toBeNull()

    vi.advanceTimersByTime(200)
    await nextTick()
    expect(stack()).toBeNull()
  })
})
