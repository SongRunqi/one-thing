/**
 * R6 渲染侧:插件流状态在 contentParts 上的归约。
 *
 * 命题两条:
 *  - 它是一个按 `(pluginId, id)` 寻址的**格子**,不是追加的消息;
 *  - 它是 transient 的 —— 流结束时被扫掉,真内容到达时不挡路。
 */
import { describe, expect, it } from 'vitest'
import {
  appendOrMergeText,
  applyPluginStatus,
  popTrailingTransient,
  removeTransientIndicators,
  pushWaiting,
} from '../helpers/content-parts'
import { isTransientPart } from '@shared/ipc/chat'
import type { ContentPart } from '@/types'

const status = (pluginId: string, id: string, label: string) => ({ pluginId, id, label })

describe('plugin-status content part', () => {
  it('updates in place instead of stacking when the same id comes again', () => {
    const parts: ContentPart[] = []
    expect(applyPluginStatus(parts, status('log-monitor', 'scan', 'Scanning 1/40'))).toBe(true)
    expect(applyPluginStatus(parts, status('log-monitor', 'scan', 'Scanning 2/40'))).toBe(true)
    expect(applyPluginStatus(parts, status('log-monitor', 'scan', 'Scanning 3/40'))).toBe(true)

    // 一个每秒汇报进度的插件不该堆出几百行。
    expect(parts).toEqual([
      { type: 'plugin-status', pluginId: 'log-monitor', id: 'scan', label: 'Scanning 3/40' },
    ])
  })

  it('reports no change when the label is identical (no needless re-render)', () => {
    const parts: ContentPart[] = []
    applyPluginStatus(parts, status('p', 'x', 'same'))
    expect(applyPluginStatus(parts, status('p', 'x', 'same'))).toBe(false)
  })

  it('keeps different plugins and different ids in separate cells', () => {
    const parts: ContentPart[] = []
    applyPluginStatus(parts, status('a', 'x', 'A x'))
    applyPluginStatus(parts, status('b', 'x', 'B x'))
    applyPluginStatus(parts, status('a', 'y', 'A y'))
    expect(parts).toHaveLength(3)
  })

  it('removes the matching cell on a cleared part, and ignores an unknown one', () => {
    const parts: ContentPart[] = []
    applyPluginStatus(parts, status('p', 'x', 'l'))
    expect(applyPluginStatus(parts, { ...status('p', 'x', 'l'), cleared: true })).toBe(true)
    expect(parts).toEqual([])
    // 重复的撤下是无操作 —— 不该报告"改动了"从而触发一次空重渲染。
    expect(applyPluginStatus(parts, { ...status('p', 'x', 'l'), cleared: true })).toBe(false)
  })

  it('does not displace the waiting indicator — they say different things', () => {
    const parts: ContentPart[] = []
    pushWaiting(parts, 0)
    applyPluginStatus(parts, status('p', 'x', 'Plugin busy'))

    // waiting = 在等模型;plugin-status = 某个插件在忙。顶掉前者会让用户以为
    // 模型已经回来了。
    expect(parts.map(part => part.type)).toEqual(['waiting', 'plugin-status'])
  })

  it('counts as transient in both mirrors', () => {
    const part: ContentPart = { type: 'plugin-status', pluginId: 'p', id: 'x', label: 'l' }
    // shared 侧
    expect(isTransientPart(part)).toBe(true)
    // renderer 侧(两份镜像必须同时认它,否则一端扫得掉另一端扫不掉)
    const parts: ContentPart[] = [part]
    expect(removeTransientIndicators(parts)).toBe(true)
    expect(parts).toEqual([])
  })

  it('is popped by the trailing-transient rule when real text arrives last', () => {
    const parts: ContentPart[] = []
    applyPluginStatus(parts, status('p', 'x', 'Working'))
    popTrailingTransient(parts)
    appendOrMergeText(parts, 'answer', 0)

    expect(parts).toEqual([{ type: 'text', content: 'answer', turnIndex: 0 }])
  })

  it('is swept together with the other transient indicators at stream end', () => {
    const parts: ContentPart[] = [
      { type: 'text', content: 'hello', turnIndex: 0 },
      { type: 'plugin-status', pluginId: 'p', id: 'x', label: 'l' },
      { type: 'waiting', turnIndex: 0 },
    ]
    removeTransientIndicators(parts)
    expect(parts).toEqual([{ type: 'text', content: 'hello', turnIndex: 0 }])
  })
})
