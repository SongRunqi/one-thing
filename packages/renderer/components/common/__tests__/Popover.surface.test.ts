// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { h, nextTick } from 'vue'
import Popover from '../Popover.vue'
import Dropdown from '../Dropdown.vue'
import { popoverSurfaceClasses } from '../popover-surface'

/**
 * 浮面档位(G1)的两条约束:
 *  1. 缺省档与 `:surface="false"` 的**产出与档位化之前逐字节相同** —— 既有 8 个
 *     消费者一个都不许被这次改动碰到。判据落在根元素的 class 列表上:缺省不加
 *     修饰类,于是 DOM 相同、命中的 CSS 规则(`.app-popover.is-surface`,基规则
 *     一个字未动)也相同。
 *  2. 显式档位只多出一个 `is-surface-<tier>` 修饰类,不动别的。
 */

async function popoverClasses(props: Record<string, unknown> = {}): Promise<string[]> {
  mount(Popover, {
    props: { open: true, anchor: { x: 10, y: 10 }, ...props },
    slots: { default: () => h('span', 'body') },
    attachTo: document.body,
  })
  await nextTick()
  const root = document.querySelector('.app-popover') as HTMLElement | null
  return root ? [...root.classList] : []
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('popoverSurfaceClasses', () => {
  it('drops the surface entirely for false', () => {
    expect(popoverSurfaceClasses(false, 'floating')).toEqual([])
  })

  it('emits no modifier for the default tier (true / undefined / the tier itself)', () => {
    expect(popoverSurfaceClasses(true, 'floating')).toEqual(['is-surface'])
    expect(popoverSurfaceClasses(undefined, 'floating')).toEqual(['is-surface'])
    expect(popoverSurfaceClasses('floating', 'floating')).toEqual(['is-surface'])
    // Dropdown 的缺省档是 menu —— 同一个函数,不同的缺省。
    expect(popoverSurfaceClasses('menu', 'menu')).toEqual(['is-surface'])
  })

  it('emits exactly one modifier for a non-default tier', () => {
    expect(popoverSurfaceClasses('menu', 'floating')).toEqual(['is-surface', 'is-surface-menu'])
    expect(popoverSurfaceClasses('elevated', 'floating')).toEqual(['is-surface', 'is-surface-elevated'])
    expect(popoverSurfaceClasses('floating', 'menu')).toEqual(['is-surface', 'is-surface-floating'])
  })
})

describe('Popover surface tiers', () => {
  it('default renders exactly the pre-tier class list', async () => {
    expect(await popoverClasses()).toEqual(['app-popover', 'is-surface'])
  })

  it('surface=false renders the bare root, as before', async () => {
    expect(await popoverClasses({ surface: false })).toEqual(['app-popover'])
  })

  it('surface="floating" is the default spelled out — same DOM', async () => {
    expect(await popoverClasses({ surface: 'floating' })).toEqual(['app-popover', 'is-surface'])
  })

  it('surface="menu" / "elevated" add one modifier each', async () => {
    expect(await popoverClasses({ surface: 'menu' })).toEqual([
      'app-popover',
      'is-surface',
      'is-surface-menu',
    ])
    document.body.innerHTML = ''
    expect(await popoverClasses({ surface: 'elevated' })).toEqual([
      'app-popover',
      'is-surface',
      'is-surface-elevated',
    ])
  })
})

describe('Dropdown follows Popover, with menu as its default tier', () => {
  async function menuClasses(props: Record<string, unknown> = {}): Promise<string[]> {
    mount(Dropdown, {
      props: { open: true, anchor: { x: 10, y: 10 }, items: [], ...props },
      attachTo: document.body,
    })
    await nextTick()
    const root = document.querySelector('.app-context-menu') as HTMLElement | null
    return root ? [...root.classList] : []
  }

  it('default keeps the historical menu face with no modifier', async () => {
    expect(await menuClasses()).toEqual(['app-context-menu', 'is-surface'])
  })

  it('surface=false still hands the face to the caller', async () => {
    expect(await menuClasses({ surface: false })).toEqual(['app-context-menu'])
  })

  it('a non-default tier adds one modifier', async () => {
    expect(await menuClasses({ surface: 'elevated' })).toEqual([
      'app-context-menu',
      'is-surface',
      'is-surface-elevated',
    ])
  })
})
