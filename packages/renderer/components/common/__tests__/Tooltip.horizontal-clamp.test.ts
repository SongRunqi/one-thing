// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import Tooltip from '../Tooltip.vue'

/**
 * 水平钳制(2026-08-11 回捞轮的报障 10)。
 *
 * top / bottom 两档是**以触发元素为中心**摆的,竖向有翻转兜底,横向此前一条
 * 兜底都没有 —— 靠窗口左右边缘的触发元素上挂一条长提示,面板直接溢出被切。
 * 这里判三件事:
 *   1. 靠左缘:中心被推到 `padding + 半宽`;
 *   2. 靠右缘:中心被推到 `视口宽 - padding - 半宽`;
 *   3. 面板被推了多少,箭头就往回走多少 —— 箭头指的是触发元素,不是面板中线。
 * 中间位置不该被动(零破坏),用第 4 条守住。
 */

function stubRect(el: Element, rect: Partial<DOMRect>): void {
  const full = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, ...rect }
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(full as DOMRect)
}

function panel(): HTMLElement | null {
  return document.querySelector('.tooltip')
}

function arrow(): HTMLElement | null {
  return document.querySelector('.tooltip-arrow')
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

/**
 * happy-dom 不排版:`offsetWidth` 恒为 0,组件那一侧的 `|| 200` 回退于是成了
 * 这里的量尺 —— 半宽 100,padding 8。视口宽取 happy-dom 缺省的 1024。
 */
const HALF = 100
const PADDING = 8

async function showAt(left: number, width: number) {
  const wrapper = mount(Tooltip, {
    props: { delay: 0, position: 'bottom', text: 'a very long tooltip body' },
    slots: { default: () => h('button', 'trigger') },
    attachTo: document.body,
  })
  const host = wrapper.element as HTMLElement
  stubRect(host, {
    top: 300, bottom: 320, left, right: left + width, width, height: 20,
  })
  await wrapper.trigger('mouseenter')
  vi.advanceTimersByTime(1)
  await nextTick()
  await nextTick()
  return wrapper
}

describe('Tooltip horizontal clamp (top / bottom placements)', () => {
  it('near the left edge, pushes the panel right instead of letting it overflow', async () => {
    // 触发元素中心 = 10 —— 面板左半边 100px 会跑到窗口外。
    await showAt(0, 20)
    expect(panel()!.style.left).toBe(`${PADDING + HALF}px`)
  })

  it('near the right edge, pushes the panel left', async () => {
    // 触发元素中心 = 1014,右半边溢出。
    const max = window.innerWidth - PADDING - HALF
    await showAt(window.innerWidth - 20, 20)
    expect(panel()!.style.left).toBe(`${max}px`)
  })

  it('walks the arrow back by exactly the shift, so it still points at the trigger', async () => {
    await showAt(0, 20)
    const anchorCenter = 10
    const shift = PADDING + HALF - anchorCenter
    expect(arrow()!.style.left).toBe(`calc(50% - ${shift}px)`)
  })

  it('leaves a mid-viewport tooltip exactly where it was (zero-break)', async () => {
    await showAt(200, 100)
    expect(panel()!.style.left).toBe('250px')
    expect(arrow()!.style.left).toBe('50%')
  })
})
