/**
 * ui-anchor-registry 的纪律:
 *  1. **全局规范顺序** —— 跨插件按 pluginId 字典序,插件内保持 manifest 声明
 *     顺序(稳定排序)。排列/截断/主题冲突三处共用这同一份顺序,它有唯一出处。
 *  2. **unsupported 过滤** —— 未知锚点的块留在注册表里(设置页要能说出来),
 *     但挂点选择器只出可渲染的块。
 */
import { describe, expect, it } from 'vitest'
import {
  setPluginUiSlots,
  uiSlotSurface,
  useAnchorUiSlots,
  usePluginUiSlots,
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
})
