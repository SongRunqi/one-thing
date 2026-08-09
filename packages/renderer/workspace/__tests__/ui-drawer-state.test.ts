// @vitest-environment happy-dom
/**
 * 抽屉三态(F 期)的状态机纪律。
 *
 * 钉住的东西:
 *  1. **默认档是半收** —— 用户没动过的抽屉与 F 期之前长得一模一样;
 *  2. **三态持久**(localStorage,键带 `onething:drawer-state:` 前缀),
 *     且**记得收起前那一档** —— 点 S 带的 chip 回到的是它,不是默认档;
 *  3. **全收不占 composer.above 的容量** —— 它已经退位,第 4 块该顶上来;
 *  4. **拆除清态** —— 插件禁用/卸载后档不许留着(内存 + localStorage 双清)。
 *
 * 状态住在注册表里而不是组件里:抽屉壳(composer.above 挂点)与全收 chip
 * (S 带挂点)是两个组件,同一份档只能有一个出处。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DRAWER_STATE_STORAGE_PREFIX,
  UI_DRAWER_DEFAULT_STATE,
  computeAnchorOverflow,
  drawerMaxHeight,
  drawerStateKey,
  drawerStateOf,
  isDrawerSlot,
  restoreDrawer,
  setDrawerState,
  setPluginUiSlots,
  useCollapsedDrawerSlots,
  useVisibleAnchorUiSlots,
  type PluginContributedUiSlot,
} from '../ui-anchor-registry'

function slot(overrides: Partial<PluginContributedUiSlot> = {}): PluginContributedUiSlot {
  return {
    pluginId: 'plan-status',
    pluginName: 'Plan status',
    anchor: 'composer.above',
    slotId: 'plan-status',
    label: 'Plan 执行状态',
    loaded: true,
    unsupported: false,
    drawer: true,
    ...overrides,
  }
}

/**
 * 自备存储。Node 22 的 globalThis 上有一个没开 `--localstorage-file` 的空壳
 * localStorage(方法全是 undefined),happy-dom 环境下它照样在 —— 直接用会
 * 当场 TypeError。测试里换成一个真会存东西的替身,与生产同一个接口。
 */
function createFakeStorage(seed: Record<string, string> = {}) {
  const map = new Map<string, string>(Object.entries(seed))
  return {
    get length() { return map.size },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value) },
    removeItem: (key: string) => { map.delete(key) },
    clear: () => { map.clear() },
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createFakeStorage())
  // 清单先空一轮:上一个用例的档随之被拆除面清掉(与生产同一条路)。
  setPluginUiSlots([])
})

describe('抽屉三态', () => {
  it('默认是半收 —— 没动过的抽屉就是 F 期之前的老形态', () => {
    setPluginUiSlots([slot()])
    expect(UI_DRAWER_DEFAULT_STATE).toBe('peek')
    expect(drawerStateOf('plan-status', 'composer.above', 'plan-status')).toBe('peek')
    expect(drawerMaxHeight('composer.above', 'peek')).toBe(32)
    expect(drawerMaxHeight('composer.above', 'expanded')).toBe(240)
  })

  it('切档落 localStorage,键按 (pluginId, anchor, id)', () => {
    setPluginUiSlots([slot()])
    setDrawerState('plan-status', 'composer.above', 'plan-status', 'expanded')
    expect(drawerStateOf('plan-status', 'composer.above', 'plan-status')).toBe('expanded')

    const key = DRAWER_STATE_STORAGE_PREFIX + drawerStateKey('plan-status', 'composer.above', 'plan-status')
    expect(JSON.parse(localStorage.getItem(key) || '{}').state).toBe('expanded')
  })

  it('全收记住收起前那一档,恢复回的是它而不是默认档', () => {
    setPluginUiSlots([slot()])
    setDrawerState('plan-status', 'composer.above', 'plan-status', 'expanded')
    setDrawerState('plan-status', 'composer.above', 'plan-status', 'collapsed')
    expect(drawerStateOf('plan-status', 'composer.above', 'plan-status')).toBe('collapsed')

    restoreDrawer('plan-status', 'composer.above', 'plan-status')
    expect(drawerStateOf('plan-status', 'composer.above', 'plan-status')).toBe('expanded')
  })

  it('从半收全收:恢复回半收(记忆不被"再收一次"抹成默认)', () => {
    setPluginUiSlots([slot()])
    setDrawerState('plan-status', 'composer.above', 'plan-status', 'collapsed')
    // 连着再收一次不许把 restore 冲成 collapsed(否则恢复无处可去)。
    setDrawerState('plan-status', 'composer.above', 'plan-status', 'collapsed')
    restoreDrawer('plan-status', 'composer.above', 'plan-status')
    expect(drawerStateOf('plan-status', 'composer.above', 'plan-status')).toBe('peek')
  })

  it('全收的块退出 composer.above:不渲染、不占容量,第 4 块顶上来', () => {
    setPluginUiSlots([
      slot({ pluginId: 'a', slotId: 'a1' }),
      slot({ pluginId: 'b', slotId: 'b1', drawer: false }),
      slot({ pluginId: 'c', slotId: 'c1', drawer: false }),
      slot({ pluginId: 'd', slotId: 'd1', drawer: false }), // maxBlocks = 3
    ])
    expect(useVisibleAnchorUiSlots('composer.above').value.map(entry => entry.pluginId))
      .toEqual(['a', 'b', 'c'])
    expect(computeAnchorOverflow('composer.above').truncated.map(entry => entry.pluginId)).toEqual(['d'])

    setDrawerState('a', 'composer.above', 'a1', 'collapsed')
    expect(useVisibleAnchorUiSlots('composer.above').value.map(entry => entry.pluginId))
      .toEqual(['b', 'c', 'd'])
    expect(computeAnchorOverflow('composer.above').truncated).toEqual([])
  })

  it('全收清单只出健康的抽屉块(失败块/非抽屉块/未知锚点不进 S 带)', () => {
    setPluginUiSlots([
      slot({ pluginId: 'a', slotId: 'a1' }),
      slot({ pluginId: 'broken', slotId: 'b1', loaded: false }),
      slot({ pluginId: 'plain', slotId: 'p1', drawer: false }),
    ])
    setDrawerState('a', 'composer.above', 'a1', 'collapsed')
    setDrawerState('broken', 'composer.above', 'b1', 'collapsed')
    setDrawerState('plain', 'composer.above', 'p1', 'collapsed')

    expect(useCollapsedDrawerSlots().value.map(entry => entry.pluginId)).toEqual(['a'])
  })

  it('drawer 声明只在开了抽屉能力的锚点上算数(别的锚点上读成 false)', () => {
    // 投影层已经裁决过(core 的 isEffectiveUiDrawerSlot),这里是 renderer 侧
    // 的第二道闸:即使有人把 drawer:true 塞进别的锚点,镜像也不认。
    expect(isDrawerSlot(slot())).toBe(true)
    expect(isDrawerSlot(slot({ anchor: 'chat.status-bar' }))).toBe(false)
    expect(isDrawerSlot(slot({ drawer: false }))).toBe(false)
    expect(isDrawerSlot(slot({ drawer: undefined }))).toBe(false)
  })

  it('拆除:插件从清单消失后档被清掉(内存 + localStorage)', () => {
    setPluginUiSlots([slot()])
    setDrawerState('plan-status', 'composer.above', 'plan-status', 'collapsed')
    const key = DRAWER_STATE_STORAGE_PREFIX + drawerStateKey('plan-status', 'composer.above', 'plan-status')
    expect(localStorage.getItem(key)).not.toBeNull()

    // 禁用/卸载 = 投影重推,这一块不在清单里了。
    setPluginUiSlots([])
    expect(localStorage.getItem(key)).toBeNull()
    // 装回来时是默认档,不是"莫名其妙已经收着"。
    setPluginUiSlots([slot()])
    expect(drawerStateOf('plan-status', 'composer.above', 'plan-status')).toBe('peek')
  })

  it('重启后档还在:模块加载时从 localStorage 装载一次', async () => {
    const key = DRAWER_STATE_STORAGE_PREFIX + drawerStateKey('plan-status', 'composer.above', 'plan-status')
    vi.stubGlobal('localStorage', createFakeStorage({
      [key]: JSON.stringify({ state: 'collapsed', restore: 'expanded' }),
      // 坏记录当它不存在,不许让整次装载(以及 UI)起不来。
      [`${DRAWER_STATE_STORAGE_PREFIX}broken`]: '{not json',
      'unrelated:key': 'x',
    }))
    vi.resetModules()

    const fresh = await import('../ui-anchor-registry')
    expect(fresh.drawerStateOf('plan-status', 'composer.above', 'plan-status')).toBe('collapsed')
    fresh.restoreDrawer('plan-status', 'composer.above', 'plan-status')
    expect(fresh.drawerStateOf('plan-status', 'composer.above', 'plan-status')).toBe('expanded')
  })

  it('别的块还在时不误伤:只清消失的那一条', () => {
    setPluginUiSlots([slot({ pluginId: 'a', slotId: 'a1' }), slot({ pluginId: 'b', slotId: 'b1' })])
    setDrawerState('a', 'composer.above', 'a1', 'expanded')
    setDrawerState('b', 'composer.above', 'b1', 'collapsed')

    setPluginUiSlots([slot({ pluginId: 'a', slotId: 'a1' })])
    expect(drawerStateOf('a', 'composer.above', 'a1')).toBe('expanded')
    expect(drawerStateOf('b', 'composer.above', 'b1')).toBe('peek')
  })
})
