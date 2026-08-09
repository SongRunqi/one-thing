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
  computeAnchorOverflow,
  setPluginUiSlots,
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
    const coreCapacities = Object.fromEntries(
      [...coreSource.matchAll(
        /'([^']+)':\s*\{\s*kind:\s*'(\w+)',\s*maxBlocks:\s*(\d+),\s*maxHeight:\s*(\d+)(?:,\s*drawer:\s*(true|false))?(?:,\s*expandedMaxHeight:\s*(\d+))?/g,
      )]
        .map(match => [match[1], {
          kind: match[2],
          maxBlocks: Number(match[3]),
          maxHeight: Number(match[4]),
          // 抽屉两项(F 期)是可选的:没写的锚点在镜像里也不该出现这两个键。
          ...(match[5] ? { drawer: match[5] === 'true' } : {}),
          ...(match[6] ? { expandedMaxHeight: Number(match[6]) } : {}),
        }]),
    )
    expect(UI_ANCHOR_CAPACITY_MIRROR).toEqual(coreCapacities)
    // 五个锚点(D 期后):三个常显块 + 两个触发式。少一个 = 有人开了锚点却
    // 忘了 §9.4 的五处清单里的这一处。
    expect(Object.keys(coreCapacities).sort()).toEqual([
      'chat.status-bar', 'composer.above', 'composer.actions', 'message.actions', 'message.footer',
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
    for (const anchor of ['chat.status-bar', 'message.footer', 'message.actions', 'composer.actions']) {
      expect(UI_ANCHOR_CAPACITY_MIRROR[anchor].drawer).toBeUndefined()
    }
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
