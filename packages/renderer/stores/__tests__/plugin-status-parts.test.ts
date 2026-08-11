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

/**
 * 计时的两个可选位(2026-08-11,SDK 外部会话的后台任务可见性)。
 *
 * `startedAt` 是起始墙钟(渲染侧自算走秒),`durationMs` 一出现就表示已结算。
 * 这一组钉的是它们**真的活着穿过归约层** —— 早先这里是原地重建字面量,新字段
 * 会在"更新"那一支被静静吃掉,于是状态条只在第一次投递时会走秒。
 */
describe('plugin-status 的计时位', () => {
  it('新建时带上 startedAt', () => {
    const parts: ContentPart[] = []
    applyPluginStatus(parts, { pluginId: 'cc', id: 'bg', label: '运行中', startedAt: 1_000 })
    expect(parts).toEqual([
      { type: 'plugin-status', pluginId: 'cc', id: 'bg', label: '运行中', startedAt: 1_000 },
    ])
  })

  it('更新同一格时 startedAt 不被吃掉 —— 否则计时会跳回零', () => {
    const parts: ContentPart[] = []
    applyPluginStatus(parts, { pluginId: 'cc', id: 'bg', label: '运行中', startedAt: 1_000 })
    applyPluginStatus(parts, { pluginId: 'cc', id: 'bg', label: '运行中 · 2 个任务', startedAt: 1_000 })

    expect(parts).toHaveLength(1)
    expect(parts[0]).toMatchObject({ label: '运行中 · 2 个任务', startedAt: 1_000 })
  })

  it('只改 durationMs 也算改动 —— 只比 label 会把定格那一条丢掉', () => {
    const parts: ContentPart[] = []
    applyPluginStatus(parts, { pluginId: 'cc', id: 'bg', label: '收尾', startedAt: 1_000 })
    // 文案一个字没变,但这一条是收场:必须落到格子上。
    expect(applyPluginStatus(parts, {
      pluginId: 'cc', id: 'bg', label: '收尾', startedAt: 1_000, durationMs: 4_200,
    })).toBe(true)
    expect(parts[0]).toMatchObject({ durationMs: 4_200 })
  })

  it('完全相同的一条仍然不重复投递', () => {
    const parts: ContentPart[] = []
    applyPluginStatus(parts, { pluginId: 'cc', id: 'bg', label: '运行中', startedAt: 1_000 })
    expect(applyPluginStatus(parts, {
      pluginId: 'cc', id: 'bg', label: '运行中', startedAt: 1_000,
    })).toBe(false)
  })

  it('没带计时位时不留下 undefined 键', () => {
    const parts: ContentPart[] = []
    applyPluginStatus(parts, status('p', 'x', 'l'))
    expect('startedAt' in parts[0]).toBe(false)
    expect('durationMs' in parts[0]).toBe(false)
  })

  it('已结算的那条不再是 transient —— 定格的总耗时活过回合收尾', () => {
    const running: ContentPart = { type: 'plugin-status', pluginId: 'cc', id: 'bg', label: '运行中', startedAt: 1 }
    const settled: ContentPart = { type: 'plugin-status', pluginId: 'cc', id: 'bg', label: '已完成', startedAt: 1, durationMs: 9 }

    expect(isStreamScopedTransientPart(running)).toBe(true)
    expect(isTransientPart(running)).toBe(true)
    // 它说的不再是"某人正在忙",而是"这件事跑了多久" —— 和工具卡上那个冻结
    // 时长同类的既成事实。用户恰恰是在回合结束之后才回头问这个。
    expect(isStreamScopedTransientPart(settled)).toBe(false)
    expect(isTransientPart(settled)).toBe(false)
    // 占位型的判据一个字没动。
    expect(isPlaceholderTransientPart(settled)).toBe(false)
  })

  it('回合收尾:在跑的被扫掉,已结算的留下', () => {
    const parts: ContentPart[] = [
      { type: 'text', content: 'hello', turnIndex: 0 },
      { type: 'plugin-status', pluginId: 'cc', id: 'bg', label: '已完成', startedAt: 1, durationMs: 9 },
      { type: 'plugin-status', pluginId: 'p', id: 'x', label: '还在跑' },
      { type: 'waiting', turnIndex: 0 },
    ]
    removeTransientIndicators(parts)
    expect(parts).toEqual([
      { type: 'text', content: 'hello', turnIndex: 0 },
      { type: 'plugin-status', pluginId: 'cc', id: 'bg', label: '已完成', startedAt: 1, durationMs: 9 },
    ])
  })
})
