// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { h, nextTick } from 'vue'
import Dropdown from '../Dropdown.vue'
import type { ContextMenuItem } from '../context-menu'

/**
 * Dropdown 扩容(G4,2026-08-11):`#header` 插槽 + 分组小标题 + 可选双列。
 *
 * 三者共一条纪律 —— 行仍是**平的一串**,栅格画在菜单盒自己身上而不是套一层
 * wrapper。零破坏的判据因此落在 DOM 上:单列 / 无 header / 无 group 时,
 * 菜单盒的类、style、子节点序列与扩容之前逐字节相同。
 */

const PLAIN: ContextMenuItem[] = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta' },
]

function menu(): HTMLElement {
  return document.querySelector('.app-context-menu') as HTMLElement
}

type Slots = { header?: () => unknown, default?: () => unknown }

function open(props: Record<string, unknown> = {}, slots: Slots = {}) {
  return mount(Dropdown, {
    props: { open: true, anchor: { x: 10, y: 10 }, items: PLAIN, ...props },
    slots: slots as never,
    attachTo: document.body,
  })
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('Dropdown layout (G4) — zero break', () => {
  it('leaves the menu box exactly as it was without header / group / columns', async () => {
    open()
    await nextTick()
    const el = menu()
    expect([...el.classList]).toEqual(['app-context-menu', 'is-surface'])
    // minWidth 之外一枚自定义属性都不多。
    expect(el.getAttribute('style')).toBe('min-width: 184px;')
    expect([...el.children].map(c => c.className)).toEqual(['app-context-item', 'app-context-item'])
  })

  it('adds no header node when the slot is absent', async () => {
    open()
    await nextTick()
    expect(menu().querySelector('.app-context-header')).toBeNull()
  })

  it('adds no group caption when no item carries a group', async () => {
    open()
    await nextTick()
    expect(menu().querySelector('.app-context-group-label')).toBeNull()
  })
})

describe('Dropdown layout (G4) — header slot', () => {
  it('renders above the rows and outside the default slot', async () => {
    open({}, { header: () => h('input', { class: 'search' }) })
    await nextTick()
    const children = [...menu().children]
    expect(children[0].className).toBe('app-context-header')
    expect(children[0].querySelector('.search')).not.toBeNull()
    expect(children[1].className).toBe('app-context-item')
  })

  it('is available to consumers that draw their own body too', async () => {
    open({}, {
      header: () => h('span', { class: 'search' }, 'q'),
      default: () => h('div', { class: 'mine' }, 'custom'),
    })
    await nextTick()
    const children = [...menu().children]
    expect(children.map(c => c.className)).toEqual(['app-context-header', 'mine'])
  })
})

describe('Dropdown layout (G4) — groups', () => {
  const GROUPED: ContextMenuItem[] = [
    { id: 'a', label: 'Alpha', group: 'Recent' },
    { id: 'b', label: 'Beta', group: 'Recent' },
    { id: 'c', label: 'Gamma', group: 'All' },
  ]

  it('captions only the first row of each consecutive run', async () => {
    open({ items: GROUPED })
    await nextTick()
    expect([...menu().children].map(c => c.className)).toEqual([
      'app-context-group-label',
      'app-context-item',
      'app-context-item',
      'app-context-group-label',
      'app-context-item',
    ])
    expect([...menu().querySelectorAll('.app-context-group-label')].map(n => n.textContent?.trim()))
      .toEqual(['Recent', 'All'])
  })

  it('never regroups the array — a repeated name later gets its own caption', async () => {
    open({ items: [
      { id: 'a', label: 'A', group: 'One' },
      { id: 'b', label: 'B', group: 'Two' },
      { id: 'c', label: 'C', group: 'One' },
    ] })
    await nextTick()
    expect([...menu().querySelectorAll('.app-context-group-label')].map(n => n.textContent?.trim()))
      .toEqual(['One', 'Two', 'One'])
    // 次序是调用方的,组件不动它。
    expect([...menu().querySelectorAll('.app-context-item')].map(n => n.textContent?.trim()))
      .toEqual(['A', 'B', 'C'])
  })

  it('keeps the rows flat, so roving focus still sees every one of them', async () => {
    open({ items: GROUPED })
    await nextTick()
    expect(menu().querySelectorAll('[role="menuitem"]')).toHaveLength(3)
  })
})

describe('Dropdown layout (G4) — columns', () => {
  it('grids the menu box itself, with no wrapper element', async () => {
    open({ columns: 3 })
    await nextTick()
    const el = menu()
    expect(el.classList.contains('is-columns')).toBe(true)
    expect(el.style.getPropertyValue('--app-context-columns')).toBe('3')
    expect([...el.children].map(c => c.className)).toEqual(['app-context-item', 'app-context-item'])
  })

  it('columns=1 is the untouched single-column DOM', async () => {
    open({ columns: 1 })
    await nextTick()
    expect(menu().classList.contains('is-columns')).toBe(false)
    expect(menu().getAttribute('style')).toBe('min-width: 184px;')
  })
})
