/**
 * 连续合并署名(docs/design/im-workbench-layout.md §3 W2)。
 *
 * 取件自 `design/im-stage-d` 的 stage-reading-column.test.ts —— 只搬纯函数那一
 * 段(舞台的阅读列/气泡断言随方案 D 一起作废)。核心那条关系必须留着:连发
 * 时间窗**短于**房间时间胶囊,否则会出现"胶囊落下来了、署名却还连着"的排版。
 */
import { describe, expect, it } from 'vitest'
import {
  SPEAKER_RUN_WINDOW_MS,
  buildSpeakerRunHeads,
  speakerRunKey,
} from '../message/speaker-runs'
import { ROOM_TIME_CAPSULE_GAP_MS } from '../message/room-grouping'

const MINUTE = 60 * 1000

describe('speaker runs (连续消息合并署名)', () => {
  it('窗口取 5 分钟,并且必须短于房间时间胶囊的间隔', () => {
    expect(SPEAKER_RUN_WINDOW_MS).toBe(5 * MINUTE)
    // 胶囊落下来了署名却还连着,是自相矛盾的排版
    expect(SPEAKER_RUN_WINDOW_MS).toBeLessThan(ROOM_TIME_CAPSULE_GAP_MS)
  })

  it('第一条永远是头,同一人窗口内的连发只有头', () => {
    const t = 1_700_000_000_000
    const heads = buildSpeakerRunHeads([
      { role: 'user', timestamp: t },
      { role: 'user', timestamp: t + MINUTE },
      { role: 'user', timestamp: t + 2 * MINUTE },
    ])
    expect([...heads]).toEqual([0])
  })

  it('换人就断', () => {
    const t = 1_700_000_000_000
    const heads = buildSpeakerRunHeads([
      { role: 'user', timestamp: t },
      { role: 'assistant', timestamp: t + 1000 },
      { role: 'user', timestamp: t + 2000 },
    ])
    expect([...heads]).toEqual([0, 1, 2])
  })

  it('同一 role 不同 agent 也算换人', () => {
    const t = 1_700_000_000_000
    expect(speakerRunKey({ role: 'assistant', agentId: 'a' }))
      .not.toBe(speakerRunKey({ role: 'assistant', agentId: 'b' }))
    const heads = buildSpeakerRunHeads([
      { role: 'assistant', agentId: 'a', timestamp: t },
      { role: 'assistant', agentId: 'b', timestamp: t + 1000 },
    ])
    expect([...heads]).toEqual([0, 1])
  })

  it('超过窗口就断,恰好等于窗口不断', () => {
    const t = 1_700_000_000_000
    expect([...buildSpeakerRunHeads([
      { role: 'user', timestamp: t },
      { role: 'user', timestamp: t + SPEAKER_RUN_WINDOW_MS },
    ])]).toEqual([0])
    expect([...buildSpeakerRunHeads([
      { role: 'user', timestamp: t },
      { role: 'user', timestamp: t + SPEAKER_RUN_WINDOW_MS + 1 },
    ])]).toEqual([0, 1])
  })

  it('时间不可知时宁可多印一次署名,也不默默并段', () => {
    expect([...buildSpeakerRunHeads([
      { role: 'user' },
      { role: 'user' },
    ])]).toEqual([0, 1])
  })

  it('空列表返回空集合', () => {
    expect(buildSpeakerRunHeads([]).size).toBe(0)
  })
})
