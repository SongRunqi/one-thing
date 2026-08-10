// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import Tooltip from '../Tooltip.vue'

/**
 * 虚拟锚点(G2,2026-08-11)的两条约束,与 Popover 档位(G1)同一套判法:
 *
 *  1. **零破坏** —— 不传 `virtual-anchor` 时,49 个存量消费者走的仍是"量触发元素
 *     的 rect"那一条路;判据落在算出来的坐标上(它是 updatePosition 唯一的产出)。
 *  2. 传了就只换**测量矩形**:hover 绑定、安全三角、"还在触发元素上吗"三处一律
 *     继续用真元素 —— 零尺寸矩形在这三处会答错。
 */

/** happy-dom 不做布局,坐标全是 0;逐个元素喂一份假 rect。 */
function stubRect(el: Element, rect: Partial<DOMRect>): void {
  const full = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, ...rect }
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(full as DOMRect)
}

function panel(): HTMLElement | null {
  return document.querySelector('.tooltip')
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

async function showTooltip(props: Record<string, unknown>) {
  const wrapper = mount(Tooltip, {
    props: { delay: 0, position: 'bottom', ...props },
    slots: { default: () => h('button', 'trigger') },
    attachTo: document.body,
  })
  const host = wrapper.element as HTMLElement
  // 触发元素:一个 100×20 的框,左上角在 (200, 300)。
  stubRect(host, { top: 300, bottom: 320, left: 200, right: 300, width: 100, height: 20 })
  await wrapper.trigger('mouseenter')
  vi.advanceTimersByTime(1)
  await nextTick()
  await nextTick()
  return wrapper
}

describe('Tooltip virtual anchor (G2)', () => {
  it('without one, measures the trigger element — the pre-G2 path', async () => {
    await showTooltip({})
    const el = panel()
    expect(el).not.toBeNull()
    // bottom 档:top = rect.bottom + 8,left = 水平中点。
    expect(el!.style.top).toBe('328px')
    expect(el!.style.left).toBe('250px')
  })

  it('with one, measures the POINT instead — the trigger rect is not consulted', async () => {
    await showTooltip({ virtualAnchor: { x: 640, y: 480 } })
    const el = panel()
    expect(el).not.toBeNull()
    // 零尺寸矩形:bottom 档的 top = y + 8,left = x + 0/2。
    expect(el!.style.top).toBe('488px')
    expect(el!.style.left).toBe('640px')
  })

  it('follows a moving point while up (a cursor over a chart)', async () => {
    const wrapper = await showTooltip({ virtualAnchor: { x: 640, y: 480 } })
    await wrapper.setProps({ virtualAnchor: { x: 645, y: 500 } })
    await nextTick()
    expect(panel()!.style.top).toBe('508px')
    expect(panel()!.style.left).toBe('645px')
  })

  it('keeps hovering bound to the element — a point cannot be hovered', async () => {
    // 没有 mouseenter 就没有面板,即使坐标已经给了:虚拟锚点只管"在哪",
    // "要不要"仍归触发元素。
    mount(Tooltip, {
      props: { delay: 0, virtualAnchor: { x: 10, y: 10 } },
      slots: { default: () => h('button', 'trigger') },
      attachTo: document.body,
    })
    vi.advanceTimersByTime(50)
    await nextTick()
    expect(panel()).toBeNull()
  })
})
