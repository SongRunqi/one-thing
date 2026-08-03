/**
 * Agent 空间「大脑」面的纯逻辑(D8 观测体系 §4.3)。
 *
 * 这一面的每一句话都是判据的直接产物,而判据写错了看不出来:一个「空闲」和一个
 * 「持 3 张牌等待」在屏幕上都是一行字,只有测试分得开。
 */
import { describe, expect, it } from 'vitest'
import type { CollabAgentActivitySnapshot } from '@shared/ipc'
import {
  AGENT_MIND_INBOX_NOTE,
  buildAgentMindHeadline,
  buildAgentMindView,
} from '../agent-mind'

const ROOMS: Record<string, string> = { 'room-1': '排期房', 'room-2': '设计房' }
/** 翻不出来的房刻意留空 —— 呈现层据此退回 id。 */
const roomName = (id: string): string => ROOMS[id] ?? ''

function activity(patch: Partial<CollabAgentActivitySnapshot> = {}): CollabAgentActivitySnapshot {
  return {
    agentId: 'iris',
    seq: 1,
    at: 10_000,
    mind: { state: 'idle' },
    heldLeases: [],
    inbox: { depth: 0 },
    workers: [],
    deadLetterCount: 0,
    ...patch,
  }
}

const view = (snapshot: CollabAgentActivitySnapshot | null) =>
  buildAgentMindView({ activity: snapshot, resolveRoomName: roomName })

describe('大脑的那一句话', () => {
  it('在想 → 报房名与起点', () => {
    expect(buildAgentMindHeadline(
      activity({ mind: { state: 'thinking', roomSessionId: 'room-1', since: 5_000 } }),
      roomName,
    )).toEqual({ state: 'thinking', text: '在「排期房」思考', since: 5_000 })
  })

  it('房名翻不出来时退回 id —— 一个查得动的 id 好过一片空白', () => {
    expect(buildAgentMindHeadline(
      activity({ mind: { state: 'thinking', roomSessionId: 'room-77', since: 1 } }),
      roomName,
    ).text).toBe('在「room-77」思考')
  })

  /**
   * 这一句是整面最值钱的一句:「系统认为轮到 TA 了,而 TA 还没开始」——
   * 在 D8 之前,这个状态在每一个界面上都被画成「正在说」。
   */
  it('没在想但手上有牌 → 「持 N 张牌等待」,计时从**最早**那张牌起', () => {
    expect(buildAgentMindHeadline(
      activity({
        heldLeases: [
          { roomSessionId: 'room-2', leaseId: 'L2', since: 8_000, executing: false },
          { roomSessionId: 'room-1', leaseId: 'L1', since: 3_000, executing: false },
        ],
      }),
      roomName,
    )).toEqual({ state: 'holding', text: '持 2 张牌等待', since: 3_000 })
  })

  // 判据的次序不是重要性的排序:大脑在想就是在想,哪怕它同时持着别的房的牌。
  it('在想 + 有牌 → 仍然报「在想」', () => {
    expect(buildAgentMindHeadline(
      activity({
        mind: { state: 'thinking', roomSessionId: 'room-1', since: 5_000 },
        heldLeases: [{ roomSessionId: 'room-2', leaseId: 'L2', since: 1_000, executing: false }],
      }),
      roomName,
    ).state).toBe('thinking')
  })

  it('空闲不计时 —— 「空闲了多久」不是一件用户要知道的事', () => {
    expect(buildAgentMindHeadline(activity(), roomName)).toEqual({
      state: 'idle',
      text: '空闲',
      since: 0,
    })
  })
})

describe('整面', () => {
  it('持牌清单带房名与「生成中 / 等大脑」', () => {
    const built = view(activity({
      heldLeases: [
        { roomSessionId: 'room-1', leaseId: 'L1', since: 1_000, executing: true },
        { roomSessionId: 'room-2', leaseId: 'L2', since: 2_000, executing: false },
      ],
    }))
    expect(built.leases.map(row => row.roomName)).toEqual(['排期房', '设计房'])
    expect(built.leases.map(row => row.stateText)).toEqual(['生成中', '等大脑'])
  })

  it('工作卡:短号 + 三态 + 房名', () => {
    const built = view(activity({
      workers: [
        { cardId: 'abcdefgh12345', roomSessionId: 'room-1', status: 'running', since: 1 },
        { cardId: 'zzz', roomSessionId: 'room-9', status: 'interrupted', since: 2 },
      ],
    }))
    expect(built.workers[0]).toMatchObject({
      shortId: '#abcdefgh',
      statusText: '在做',
      roomName: '排期房',
    })
    expect(built.workers[1]).toMatchObject({
      shortId: '#zzz',
      statusText: '被打断',
      roomName: 'room-9',
    })
  })

  /**
   * 保密纪律的**用户可见**那一半:快照本身就不携带正文(契约层钉死),而这句话
   * 是说给人听的 —— 否则一个「积压 12」会让人以为点进去能读到那 12 条内容。
   */
  it('邮箱只给深度与最旧,并且把「不含正文」写在脸上', () => {
    const built = view(activity({ inbox: { depth: 12, oldestAt: 4_000 } }))
    expect(built.inbox).toEqual({ depth: 12, oldestAt: 4_000, note: AGENT_MIND_INBOX_NOTE })
    expect(built.inbox.note).toContain('不含正文')
    expect(JSON.stringify(built)).not.toContain('content')
  })

  it('最旧时刻缺席时给 0(留白),不编一个「刚刚」', () => {
    expect(view(activity({ inbox: { depth: 2 } })).inbox.oldestAt).toBe(0)
  })

  it('死信与上一次开口原样带上', () => {
    const built = view(activity({ deadLetterCount: 3, lastSpokeAt: 9_000 }))
    expect(built.deadLetterCount).toBe(3)
    expect(built.lastSpokeAt).toBe(9_000)
  })

  /**
   * 「读不到」与「空闲」在**别的界面上**是同一个样子(徽标不画),但这一面是专门
   * 来看这个人的 —— 在这儿混起来就等于对着一个可能正在忙的人写「空闲」。
   */
  it('拿不到快照时单独说一句,而不是冒充「空闲」', () => {
    const built = view(null)
    expect(built.missing).not.toBe('')
    expect(built.headline.text).toBe('空闲')
    expect(built.leases).toEqual([])
    expect(built.workers).toEqual([])
  })

  it('有快照时不说那句 —— 一个真的空闲的人不该看见告警', () => {
    expect(view(activity()).missing).toBe('')
  })
})
