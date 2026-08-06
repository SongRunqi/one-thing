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
import {
  isPlaceholderTransientPart,
  isStreamScopedTransientPart,
  isTransientPart,
} from '@shared/ipc/chat'
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

  it('marks a cleared cell in place instead of splicing it out', () => {
    const parts: ContentPart[] = [{ type: 'text', content: 'before', turnIndex: 0 }]
    applyPluginStatus(parts, status('p', 'x', 'l'))
    parts.push({ type: 'text', content: 'after', turnIndex: 0 })

    expect(applyPluginStatus(parts, { ...status('p', 'x', 'l'), cleared: true })).toBe(true)

    // **不 splice**:流式期间 contentParts 只追加,渲染层的 key 依赖 sourceIndex
    // 稳定;中途摘一项会让它后面所有正文的 key 平移,Vue 把它们全部重挂。
    expect(parts).toHaveLength(3)
    expect(parts[1]).toMatchObject({ type: 'plugin-status', cleared: true })
    expect(parts[2]).toMatchObject({ type: 'text', content: 'after' })

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

  it('is stream-scoped transient, not placeholder transient', () => {
    const status: ContentPart = { type: 'plugin-status', pluginId: 'p', id: 'x', label: 'l' }
    const waiting: ContentPart = { type: 'waiting', turnIndex: 0 }

    expect(isStreamScopedTransientPart(status)).toBe(true)
    expect(isPlaceholderTransientPart(status)).toBe(false)
    expect(isPlaceholderTransientPart(waiting)).toBe(true)
    // 流结束时两类一起收走。
    expect(isTransientPart(status)).toBe(true)
    expect(isTransientPart(waiting)).toBe(true)

    const parts: ContentPart[] = [status]
    expect(removeTransientIndicators(parts)).toBe(true)
    expect(parts).toEqual([])
  })

  it('survives streamed text — it is stream-scoped, not a placeholder', () => {
    const parts: ContentPart[] = []
    applyPluginStatus(parts, status('p', 'x', 'Working'))
    popTrailingTransient(parts)
    appendOrMergeText(parts, 'answer', 0)

    // 这条用例上一版把**错误行为**钉住了(断言状态被正文顶掉)。真实后果:
    // 模型吐出第一个 token 状态就消失,插件还在干活;它下一次 show 同 id 又把
    // 状态推回来 —— 于是按 delta 的频率闪烁。而且弹掉之后宿主账本仍持有记录,
    // 后续 clear 在渲染侧成了 no-op。
    expect(parts).toEqual([
      { type: 'plugin-status', pluginId: 'p', id: 'x', label: 'Working' },
      { type: 'text', content: 'answer', turnIndex: 0 },
    ])
  })

  it('still lets a placeholder indicator be popped by real content', () => {
    const parts: ContentPart[] = []
    pushWaiting(parts, 0)
    popTrailingTransient(parts)
    appendOrMergeText(parts, 'answer', 0)
    // 占位型的语义不变 —— 拆分不是把所有 transient 都变成常驻。
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
