/**
 * ui-anchor-registry 的纪律:
 *  1. **全局规范顺序** —— 跨插件按 pluginId 字典序,插件内保持 manifest 声明
 *     顺序(稳定排序)。排列/截断/主题冲突三处共用这同一份顺序,它有唯一出处。
 *  2. **unsupported 过滤** —— 未知锚点的块留在注册表里(设置页要能说出来),
 *     但挂点选择器只出可渲染的块。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  UI_ANCHOR_CAPACITY_MIRROR,
  UI_SLOT_DEFAULT_SIDE,
  computeAnchorOverflow,
  isSidedAnchor,
  isUiSlotTruncated,
  setPluginUiSlots,
  uiSlotSideOf,
  uiSlotSurface,
  useAnchorUiSlots,
  usePluginUiSlots,
  useVisibleAnchorUiSlots,
  type PluginContributedUiSlot,
} from '../ui-anchor-registry'

function slot(overrides: Partial<PluginContributedUiSlot>): PluginContributedUiSlot {
  return {
    pluginId: 'a-plugin',
    pluginName: 'A Plugin',
    anchor: 'composer.above',
    slotId: 'one',
    label: 'One',
    loaded: true,
    unsupported: false,
    ...overrides,
  }
}

describe('ui-anchor-registry', () => {
  it('跨插件按 pluginId 字典序,插件内保持 manifest 声明顺序', () => {
    setPluginUiSlots([
      slot({ pluginId: 'zeta', slotId: 'z1' }),
      slot({ pluginId: 'alpha', slotId: 'second' }),
      slot({ pluginId: 'alpha', slotId: 'first' }),
      slot({ pluginId: 'beta', slotId: 'b1' }),
    ])
    expect(usePluginUiSlots().value.map(entry => `${entry.pluginId}/${entry.slotId}`)).toEqual([
      'alpha/second', // 字典序只看 pluginId;alpha 内部保持声明顺序(second 先声明)
      'alpha/first',
      'beta/b1',
      'zeta/z1',
    ])
  })

  it('同样的输入两次设置,顺序逐字节一致(确定性)', () => {
    const input = [
      slot({ pluginId: 'zeta', slotId: 'z1' }),
      slot({ pluginId: 'alpha', slotId: 'a1' }),
      slot({ pluginId: 'beta', slotId: 'b1' }),
    ]
    setPluginUiSlots(input)
    const first = usePluginUiSlots().value.map(entry => `${entry.pluginId}/${entry.slotId}`)
    setPluginUiSlots([...input].reverse())
    const second = usePluginUiSlots().value.map(entry => `${entry.pluginId}/${entry.slotId}`)
    expect(second).toEqual(first)
  })

  it('挂点选择器按锚点过滤,且 unsupported 的块不可渲染', () => {
    setPluginUiSlots([
      slot({ slotId: 'known' }),
      slot({ slotId: 'unknown', anchor: 'composer.below', unsupported: true }),
      slot({ slotId: 'other-anchor', anchor: 'chat.status-bar' }),
    ])
    expect(useAnchorUiSlots('composer.above').value.map(entry => entry.slotId)).toEqual(['known'])
    expect(useAnchorUiSlots('chat.status-bar').value.map(entry => entry.slotId)).toEqual(['other-anchor'])
    // unsupported 仍留在总表里(设置页消费)
    expect(usePluginUiSlots().value.some(entry => entry.slotId === 'unknown')).toBe(true)
  })

  it('surface 地址与 core 同规:ui:<anchor>:<id>', () => {
    expect(uiSlotSurface('composer.above', 'plan-status')).toBe('ui:composer.above:plan-status')
  })

  it('容量镜像与 core 的 UI_ANCHOR_CAPACITY 逐字节一致(两处不许各抄各的)', () => {
    // renderer 不能吃 core,容量语义靠镜像 + 本用例钉住。改了 core 的容量表,
    // 这里当场红。
    const coreSource = readFileSync(
      fileURLToPath(new URL('../../../core/plugins/ui-anchor.ts', import.meta.url)),
      'utf8',
    )
    // 逐条抠出 `'<anchor>': { … }` 的对象体再按键解析。**不按字段顺序匹配**:
    // 容量表的可选字段是逐期长出来的(drawer/expandedMaxHeight/maxWidth/sided),
    // 一条把顺序写死的正则会在下一期悄悄漏掉新字段 —— 漏掉 = 这条守卫失效而
    // 不报错,正是它要防的那件事。`rootHint` 是给插件的提示,不进镜像。
    const MIRRORED_KEYS = ['kind', 'maxBlocks', 'maxHeight', 'drawer', 'expandedMaxHeight', 'maxWidth', 'sided']
    const coreCapacities = Object.fromEntries(
      [...coreSource.matchAll(/'([\w.-]+)':\s*\{([^}]*)\}/g)]
        // 容量表之外的对象字面量(UI_ANCHORS 的值是裸字符串,匹配不上)自然不进。
        .filter(match => /kind:\s*'/.test(match[2]))
        .map((match) => {
          const body = match[2]
          const entry: Record<string, unknown> = {}
          for (const key of MIRRORED_KEYS) {
            const found = body.match(new RegExp(`\\b${key}:\\s*('(\\w+)'|true|false|\\d+)`))
            if (!found) continue
            const raw = found[1]
            if (raw === 'true' || raw === 'false') entry[key] = raw === 'true'
            else if (found[2] !== undefined) entry[key] = found[2]
            else entry[key] = Number(raw)
          }
          return [match[1], entry]
        }),
    )
    expect(UI_ANCHOR_CAPACITY_MIRROR).toEqual(coreCapacities)
    // 七个锚点(I 期后):五个常显块 + 两个触发式。少一个 = 有人开了锚点却
    // 忘了 §9.4 的五处清单里的这一处。
    expect(Object.keys(coreCapacities).sort()).toEqual([
      'chat.status-bar', 'composer.above', 'composer.actions', 'composer.aside',
      'composer.below', 'message.actions', 'message.footer',
    ])
  })

  it('kind 轴:trigger 锚点的容量说的是"几个入口",maxHeight 说的是弹层内容高度', () => {
    expect(UI_ANCHOR_CAPACITY_MIRROR['message.actions']).toEqual({
      kind: 'trigger', maxBlocks: 3, maxHeight: 320,
    })
    expect(UI_ANCHOR_CAPACITY_MIRROR['composer.actions']).toEqual({
      kind: 'trigger', maxBlocks: 3, maxHeight: 320,
    })
    // 既有三个锚点的 kind 是 block —— 语义不许被 D 期改写(append-only)。
    for (const anchor of ['composer.above', 'chat.status-bar', 'message.footer']) {
      expect(UI_ANCHOR_CAPACITY_MIRROR[anchor].kind).toBe('block')
    }
  })

  it('抽屉能力只在 composer.above 上开(其余锚点镜像里没有这两个键)', () => {
    expect(UI_ANCHOR_CAPACITY_MIRROR['composer.above'].drawer).toBe(true)
    expect(UI_ANCHOR_CAPACITY_MIRROR['composer.above'].expandedMaxHeight).toBe(240)
    for (const anchor of [
      'chat.status-bar', 'message.footer', 'message.actions', 'composer.actions',
      'composer.aside', 'composer.below',
    ]) {
      expect(UI_ANCHOR_CAPACITY_MIRROR[anchor].drawer).toBeUndefined()
    }
  })

  // ── I 期:分侧锚点 composer.aside ────────────

  it('分侧只在 composer.aside 上开;缺省侧是 right,未知值也归缺省', () => {
    expect(isSidedAnchor('composer.aside')).toBe(true)
    expect(UI_SLOT_DEFAULT_SIDE).toBe('right')
    for (const anchor of [
      'composer.above', 'chat.status-bar', 'message.footer', 'message.actions',
      'composer.actions', 'composer.below',
    ]) {
      expect(isSidedAnchor(anchor)).toBe(false)
      // 不分侧的锚点上问"哪一侧" = 没有这个概念,不是"缺省 right"。
      expect(uiSlotSideOf(slot({ anchor, side: 'left' }))).toBeUndefined()
    }
    expect(uiSlotSideOf(slot({ anchor: 'composer.aside', side: 'left' }))).toBe('left')
    expect(uiSlotSideOf(slot({ anchor: 'composer.aside', side: 'right' }))).toBe('right')
    expect(uiSlotSideOf(slot({ anchor: 'composer.aside' }))).toBe('right')
    expect(uiSlotSideOf(slot({ anchor: 'composer.aside', side: 'top' }))).toBe('right')
  })

  it('两翼是两个独立席位池:每侧 1 块,同侧第二条才被截断', () => {
    setPluginUiSlots([
      slot({ pluginId: 'a', slotId: 'l1', anchor: 'composer.aside', side: 'left' }),
      slot({ pluginId: 'b', slotId: 'r1', anchor: 'composer.aside', side: 'right' }),
      // 未声明 = 缺省侧 right —— 于是它是**右侧的第二条**,该被截断。
      slot({ pluginId: 'c', slotId: 'r2', anchor: 'composer.aside' }),
      slot({ pluginId: 'd', slotId: 'l2', anchor: 'composer.aside', side: 'left' }),
    ])
    expect(useVisibleAnchorUiSlots('composer.aside', 'left').value.map(entry => entry.slotId))
      .toEqual(['l1'])
    expect(useVisibleAnchorUiSlots('composer.aside', 'right').value.map(entry => entry.slotId))
      .toEqual(['r1'])
    // 左右各裁各的:右侧那一块没有把左侧的挤掉,截断集合是两侧之和。
    expect(computeAnchorOverflow('composer.aside').truncated.map(entry => entry.slotId).sort())
      .toEqual(['l2', 'r2'])
    // 设置页的"锚点已满"读的是同一份裁决(不带 side 地问)。
    expect(isUiSlotTruncated('c', 'composer.aside', 'r2')).toBe(true)
    expect(isUiSlotTruncated('a', 'composer.aside', 'l1')).toBe(false)
  })

  it('composer.below 是普通常显块:2 块 / 24px,不分侧不抽屉', () => {
    expect(UI_ANCHOR_CAPACITY_MIRROR['composer.below'])
      .toEqual({ kind: 'block', maxBlocks: 2, maxHeight: 24 })
    setPluginUiSlots([
      slot({ pluginId: 'a', slotId: 'a1', anchor: 'composer.below' }),
      slot({ pluginId: 'b', slotId: 'b1', anchor: 'composer.below' }),
      slot({ pluginId: 'c', slotId: 'c1', anchor: 'composer.below' }),
    ])
    expect(useVisibleAnchorUiSlots('composer.below').value.map(entry => entry.pluginId))
      .toEqual(['a', 'b'])
    expect(computeAnchorOverflow('composer.below').truncated.map(entry => entry.pluginId))
      .toEqual(['c'])
  })

  it('触发式锚点同样吃容量截断与 unsupported 过滤(与常显块一套裁决)', () => {
    setPluginUiSlots([
      slot({ pluginId: 'a', slotId: 'a1', anchor: 'message.actions' }),
      slot({ pluginId: 'b', slotId: 'b1', anchor: 'message.actions' }),
      slot({ pluginId: 'c', slotId: 'c1', anchor: 'message.actions' }),
      slot({ pluginId: 'd', slotId: 'd1', anchor: 'message.actions' }),
      slot({ pluginId: 'e', slotId: 'e1', anchor: 'message.actions', unsupported: true }),
    ])
    expect(useVisibleAnchorUiSlots('message.actions').value.map(entry => entry.pluginId))
      .toEqual(['a', 'b', 'c'])
    expect(computeAnchorOverflow('message.actions').truncated.map(entry => entry.pluginId))
      .toEqual(['d'])
  })
})
