// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import SessionItem from '../SessionItem.vue'
import { resetInteractiveTooltipRegistry } from '@/components/common/interactive-tooltip-registry.js'

/**
 * The sidebar wires Tooltip through `triggerEl` pointing at the row itself,
 * with the Tooltip instance living *inside* that row. The bare-Tooltip tests
 * cover the mechanism; this covers the actual composition, which is where a
 * panel was seen surviving after the pointer had left the list entirely.
 */

const getSessionSegments = vi.fn(async (_sessionId: string) => ({
  success: true,
  segments: [] as unknown[],
}))

vi.mock('@/platform', () => ({
  platformApi: { getSessionSegments: (id: string) => getSessionSegments(id) },
}))

const ROW_A = { top: 200, bottom: 240, left: 0, right: 200 }
const ROW_B = { top: 240, bottom: 280, left: 0, right: 200 }
const PANEL = { top: 180, bottom: 480, left: 300, right: 620 }

function boxFor(el: Element) {
  if (el.classList.contains('tooltip')) return PANEL
  return el.getAttribute('data-session') === 'b' ? ROW_B : ROW_A
}

function session(id: string) {
  return {
    id,
    name: `Session ${id}`,
    updatedAt: Date.now(),
    depth: 0,
    ancestorsLastChild: [],
    isLastChild: true,
    hasBranches: false,
    branchCount: 0,
    isCollapsed: false,
    isHidden: false,
    previewText: 'hello',
  } as never
}

function mountRow(id: string) {
  const wrapper = mount(SessionItem, {
    props: {
      session: session(id),
      isActive: false,
      isGenerating: false,
      isEditing: false,
      editingName: '',
    },
    global: { stubs: { Button: { template: '<button><slot /></button>' } } },
    attachTo: document.body,
  })
  wrapper.element.setAttribute('data-session', id)
  return wrapper
}

function move(x: number, y: number) {
  document.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y }))
}

function panelCount(): number {
  return document.body.querySelectorAll('.tooltip').length
}

let originalGetRect: typeof Element.prototype.getBoundingClientRect

beforeEach(() => {
  vi.useFakeTimers()
  getSessionSegments.mockResolvedValue({ success: true, segments: [] })
  resetInteractiveTooltipRegistry()
  originalGetRect = Element.prototype.getBoundingClientRect
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const box = boxFor(this)
    return {
      ...box,
      width: box.right - box.left,
      height: box.bottom - box.top,
      x: box.left,
      y: box.top,
      toJSON: () => box,
    } as DOMRect
  }
})

afterEach(() => {
  Element.prototype.getBoundingClientRect = originalGetRect
  vi.useRealTimers()
  document.body.innerHTML = ''
})

async function openRow(wrapper: ReturnType<typeof mountRow>) {
  // rootRef resolves after mount, and Tooltip binds its listeners in a watch
  // on that ref — without letting it settle, nothing is listening yet.
  await nextTick()
  await wrapper.find('.session-item').trigger('mouseenter')
  await vi.advanceTimersByTimeAsync(700)
  await nextTick()
}

describe('SessionItem hover preview', () => {
  it('opens the preview on hovering the row', async () => {
    const a = mountRow('a')
    await openRow(a)

    expect(panelCount()).toBe(1)
    a.unmount()
  })

  it('closes once the pointer slides down out of the list', async () => {
    // The reported bug: pointer leaves the row downward, ends up somewhere
    // else entirely, and the panel stays on screen.
    const a = mountRow('a')
    await openRow(a)
    expect(panelCount()).toBe(1)

    await a.find('.session-item').trigger('mouseleave', { clientX: 100, clientY: 241 })
    move(100, 500)
    await nextTick()
    move(120, 760)
    await nextTick()

    expect(panelCount()).toBe(0)
    a.unmount()
  })

  it('closes when the pointer reaches the row below', async () => {
    const a = mountRow('a')
    const b = mountRow('b')
    await openRow(a)

    await a.find('.session-item').trigger('mouseleave', { clientX: 100, clientY: 241 })
    move(100, 260)
    await nextTick()

    expect(panelCount()).toBe(0)
    a.unmount()
    b.unmount()
  })

  it('never leaves two previews on screen', async () => {
    const a = mountRow('a')
    const b = mountRow('b')

    await openRow(a)
    await b.find('.session-item').trigger('mouseenter')
    await vi.advanceTimersByTimeAsync(700)
    await nextTick()

    expect(panelCount()).toBe(1)
    a.unmount()
    b.unmount()
  })

  it('closes even with no follow-up mousemove after leaving', async () => {
    const a = mountRow('a')
    await openRow(a)

    await a.find('.session-item').trigger('mouseleave', { clientX: 100, clientY: 241 })
    await vi.advanceTimersByTimeAsync(2000)
    await nextTick()

    expect(panelCount()).toBe(0)
    a.unmount()
  })
  it('closes on pointer position alone, even if mouseleave never fires', async () => {
    // The close path used to hang entirely off mouseleave: miss that event and
    // nothing was left watching the panel. Position is what actually decides,
    // so a pointer that is demonstrably elsewhere must close it regardless.
    const a = mountRow('a')
    await openRow(a)
    expect(panelCount()).toBe(1)

    // No mouseleave dispatched at all — only movement away from the row.
    move(100, 600)
    await nextTick()

    expect(panelCount()).toBe(0)
    a.unmount()
  })

  it('closes when the pointer moves onto the next row without a mouseleave', async () => {
    const a = mountRow('a')
    const b = mountRow('b')
    await openRow(a)

    move(100, 260)
    await nextTick()

    expect(panelCount()).toBe(0)
    a.unmount()
    b.unmount()
  })

  it('keeps the panel while the pointer is still on its own row', async () => {
    const a = mountRow('a')
    await openRow(a)

    // Moving within the row must not be mistaken for leaving it.
    move(150, 220)
    await nextTick()

    expect(panelCount()).toBe(1)
    a.unmount()
  })
})
