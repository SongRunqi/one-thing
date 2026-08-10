// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import Dropdown from '../Dropdown.vue'
import type { ContextMenuItem } from '../context-menu'

/**
 * 浮层子菜单(G3,2026-08-11)。两条约束:
 *
 *  1. **零破坏** —— 不带 `children` 的项渲染出的 DOM 与改动前逐字节相同:
 *     没有 aria-haspopup、没有人字符号、没有第二张面。Dropdown 现有消费者
 *     (ContextMenu 的 6 个调用点 + MessageActions 两处)一个都不带 children。
 *  2. 带了就开**第二层浮层**(不是画在行里的绝对定位面),叶子行才发 `select`。
 */

const PLAIN: ContextMenuItem[] = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta' },
]

const NESTED: ContextMenuItem[] = [
  { id: 'a', label: 'Alpha' },
  { id: 'more', label: 'More', children: [{ id: 'x', label: 'Deep X' }, { id: 'y', label: 'Deep Y' }] },
]

function menus(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('.app-context-menu')]
}

function rows(menu: HTMLElement): HTMLElement[] {
  return [...menu.querySelectorAll<HTMLElement>('.app-context-item')]
}

/** happy-dom 不做布局:给子面板喂一份靠右的 rect,安全三角才有几何可算。 */
function stubRect(el: Element, rect: Partial<DOMRect>): void {
  const full = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, ...rect }
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(full as DOMRect)
}

function open(items: ContextMenuItem[]) {
  return mount(Dropdown, {
    props: { open: true, anchor: { x: 10, y: 10 }, items },
    attachTo: document.body,
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('Dropdown submenu (G3) — zero break for plain items', () => {
  it('renders one menu, no chevron, no aria-haspopup', async () => {
    open(PLAIN)
    await nextTick()
    expect(menus()).toHaveLength(1)
    const [first, second] = rows(menus()[0])
    expect(first.getAttribute('aria-haspopup')).toBeNull()
    expect(first.getAttribute('aria-expanded')).toBeNull()
    expect(first.classList.contains('has-submenu')).toBe(false)
    expect(first.querySelector('.app-context-item-chevron')).toBeNull()
    expect(second.textContent?.trim()).toBe('Beta')
  })

  it('still emits select and closes on a leaf row', async () => {
    const wrapper = open(PLAIN)
    await nextTick()
    rows(menus()[0])[0].click()
    expect(wrapper.emitted('select')?.[0]).toEqual(['a'])
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
  })

  it('hovering a leaf row with no submenu open does nothing at all', async () => {
    const wrapper = open(PLAIN)
    await nextTick()
    await rows(menus()[0])[0].dispatchEvent(new MouseEvent('mouseenter'))
    await nextTick()
    expect(menus()).toHaveLength(1)
    expect(wrapper.emitted('select')).toBeUndefined()
  })
})

describe('Dropdown submenu (G3) — nested items', () => {
  it('marks the parent row and opens a second floating menu on hover', async () => {
    open(NESTED)
    await nextTick()
    const parentRow = rows(menus()[0])[1]
    expect(parentRow.getAttribute('aria-haspopup')).toBe('menu')
    expect(parentRow.getAttribute('aria-expanded')).toBe('false')
    expect(parentRow.querySelector('.app-context-item-chevron')).not.toBeNull()

    parentRow.dispatchEvent(new MouseEvent('mouseenter'))
    await nextTick()
    await nextTick()
    expect(menus()).toHaveLength(2)
    expect(rows(menus()[1]).map(r => r.textContent?.trim())).toEqual(['Deep X', 'Deep Y'])
  })

  it('a parent row is a door, not an action: clicking it opens, never selects', async () => {
    const wrapper = open(NESTED)
    await nextTick()
    rows(menus()[0])[1].click()
    await nextTick()
    await nextTick()
    expect(wrapper.emitted('select')).toBeUndefined()
    expect(menus()).toHaveLength(2)
  })

  it('only leaf rows emit select — the handler never sees the depth', async () => {
    const wrapper = open(NESTED)
    await nextTick()
    rows(menus()[0])[1].dispatchEvent(new MouseEvent('mouseenter'))
    await nextTick()
    await nextTick()
    rows(menus()[1])[1].click()
    await nextTick()
    expect(wrapper.emitted('select')?.[0]).toEqual(['y'])
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
  })

  it('the safe triangle keeps the submenu open while the pointer travels across a sibling row', async () => {
    open(NESTED)
    await nextTick()
    const parentRow = rows(menus()[0])[1]
    parentRow.dispatchEvent(new MouseEvent('mouseenter'))
    await nextTick()
    await nextTick()

    // 子面板在右侧 (200..320, 100..200);指针从父行右缘 (190, 150) 斜着走。
    stubRect(menus()[1], { left: 200, right: 320, top: 100, bottom: 200, width: 120, height: 100 })
    parentRow.dispatchEvent(new MouseEvent('mouseleave', { clientX: 190, clientY: 150 }))

    // 途中扫过上面那一行:落在楔形内,不许把子菜单关掉。
    rows(menus()[0])[0].dispatchEvent(new MouseEvent('mouseenter', { clientX: 195, clientY: 148 }))
    await nextTick()
    expect(menus()).toHaveLength(2)
  })

  it('leaving the wedge closes it immediately — grace is for travel, not for elsewhere', async () => {
    open(NESTED)
    await nextTick()
    const parentRow = rows(menus()[0])[1]
    parentRow.dispatchEvent(new MouseEvent('mouseenter'))
    await nextTick()
    await nextTick()

    stubRect(menus()[1], { left: 200, right: 320, top: 100, bottom: 200, width: 120, height: 100 })
    parentRow.dispatchEvent(new MouseEvent('mouseleave', { clientX: 190, clientY: 150 }))
    // 往左上角走 —— 明显不是去子面板的路。
    rows(menus()[0])[0].dispatchEvent(new MouseEvent('mouseenter', { clientX: 20, clientY: 20 }))
    await nextTick()
    expect(menus()).toHaveLength(1)
  })

  it('stalling inside the wedge eventually gives up', async () => {
    open(NESTED)
    await nextTick()
    const parentRow = rows(menus()[0])[1]
    parentRow.dispatchEvent(new MouseEvent('mouseenter'))
    await nextTick()
    await nextTick()

    stubRect(menus()[1], { left: 200, right: 320, top: 100, bottom: 200, width: 120, height: 100 })
    parentRow.dispatchEvent(new MouseEvent('mouseleave', { clientX: 190, clientY: 150 }))
    vi.advanceTimersByTime(500)
    await nextTick()
    expect(menus()).toHaveLength(1)
  })

  it('closing the parent closes the submenu with it', async () => {
    const wrapper = open(NESTED)
    await nextTick()
    rows(menus()[0])[1].dispatchEvent(new MouseEvent('mouseenter'))
    await nextTick()
    await nextTick()
    expect(menus()).toHaveLength(2)

    await wrapper.setProps({ open: false })
    await nextTick()
    expect(menus()).toHaveLength(0)
  })
})
