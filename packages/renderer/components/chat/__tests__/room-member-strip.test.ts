import { describe, expect, it } from 'vitest'
import type { CollabAgentActivitySnapshot } from '@shared/ipc'
import {
  ROOM_MEMBER_FALLBACK_AVATAR,
  buildAddableRoomAgents,
  buildRoomMemberEntries,
  formatRoomMemberPresence,
  formatRoomMemberTooltip,
  planRoomMemberAdd,
  planRoomMemberRemoval,
  resolveRoomMemberPresence,
  type RoomStripAgent,
} from '../room-member-strip'

const AGENTS: RoomStripAgent[] = [
  { id: 'pm', name: '阿明', title: '产品经理', avatar: '📋' },
  { id: 'fe', name: '小李', title: '前端工程师', avatar: '🔧' },
  { id: 'research', name: '小研', avatar: '🔎' },
  { id: 'default', name: '默认', isDefault: true },
  { id: 'gone', name: '老王', title: '设计师', avatar: '🎨', status: 'retired' },
  { id: 'dj', name: 'DJ', avatar: '🎧', kind: 'service' },
]

describe('buildRoomMemberEntries', () => {
  it('keeps roster order and marks the lead', () => {
    const entries = buildRoomMemberEntries({
      memberAgentIds: ['fe', 'pm'],
      agents: AGENTS,
      pmAgentId: 'pm',
    })
    expect(entries.map(entry => entry.id)).toEqual(['fe', 'pm'])
    expect(entries.map(entry => entry.avatar)).toEqual(['🔧', '📋'])
    expect(entries.map(entry => entry.isPm)).toEqual([false, true])
  })

  it('shows a member whose agent is gone as a tombstone rather than a raw id', () => {
    // Hiding it would make "remove that stale member" impossible from the strip;
    // showing the id would print a uuid where a name belongs (域模型 M4).
    const [entry] = buildRoomMemberEntries({ memberAgentIds: ['ghost'], agents: AGENTS })
    expect(entry).toMatchObject({
      id: 'ghost',
      name: '已注销',
      avatar: ROOM_MEMBER_FALLBACK_AVATAR,
      isRetired: true,
      isPm: false,
    })
  })

  it('keeps a retired member under its own name, flagged as a tombstone', () => {
    // 退休不是删除(§3.2):名字照旧,只是灰显 +「已注销」。
    const [entry] = buildRoomMemberEntries({ memberAgentIds: ['gone'], agents: AGENTS })
    expect(entry).toMatchObject({
      id: 'gone',
      name: '老王',
      title: '设计师',
      avatar: '🎨',
      isRetired: true,
    })
  })

  it('leaves an active member unflagged', () => {
    const [entry] = buildRoomMemberEntries({ memberAgentIds: ['fe'], agents: AGENTS })
    expect(entry.isRetired).toBe(false)
  })

  it('falls back to the neutral stamp for an agent with no emoji', () => {
    const [entry] = buildRoomMemberEntries({
      memberAgentIds: ['x'],
      agents: [{ id: 'x', name: '无脸' }],
    })
    expect(entry.avatar).toBe(ROOM_MEMBER_FALLBACK_AVATAR)
  })

  it('never marks a lead when the room has none', () => {
    const entries = buildRoomMemberEntries({ memberAgentIds: ['fe'], agents: AGENTS, pmAgentId: '' })
    expect(entries[0].isPm).toBe(false)
  })
})

describe('formatRoomMemberTooltip', () => {
  it('reads 名字 · 职务, dropping an absent title', () => {
    const [withTitle, withoutTitle] = buildRoomMemberEntries({
      memberAgentIds: ['fe', 'research'],
      agents: AGENTS,
    })
    expect(formatRoomMemberTooltip(withTitle)).toBe('小李 · 前端工程师')
    expect(formatRoomMemberTooltip(withoutTitle)).toBe('小研')
  })

  it('names the lead', () => {
    const [entry] = buildRoomMemberEntries({ memberAgentIds: ['pm'], agents: AGENTS, pmAgentId: 'pm' })
    expect(formatRoomMemberTooltip(entry)).toBe('阿明 · 产品经理 · 负责人')
  })

  it('says 已注销 on a retired member, and carries the id when the name is gone', () => {
    const [retired] = buildRoomMemberEntries({ memberAgentIds: ['gone'], agents: AGENTS })
    expect(formatRoomMemberTooltip(retired)).toBe('老王 · 设计师 · 已注销')

    // 查无此人:名字已不可考,id 是唯一能对上号的东西。
    const [ghost] = buildRoomMemberEntries({ memberAgentIds: ['ghost'], agents: AGENTS })
    expect(formatRoomMemberTooltip(ghost)).toBe('已注销 · ghost')
  })
})

describe('buildAddableRoomAgents', () => {
  it('offers active colleagues only: no default persona, no service, no retired', () => {
    // 社交面(域模型 M2/§3.2):service(DJ)与已退休(老王)都不出现在 ＋ 里。
    expect(buildAddableRoomAgents({ memberAgentIds: ['fe'], agents: AGENTS }).map(a => a.id))
      .toEqual(['pm', 'research'])
  })

  it('offers nobody once everyone is in', () => {
    expect(buildAddableRoomAgents({
      memberAgentIds: ['pm', 'fe', 'research'],
      agents: AGENTS,
    })).toEqual([])
  })
})

describe('planRoomMemberAdd', () => {
  it('appends the new member and stays idempotent', () => {
    expect(planRoomMemberAdd(['fe'], 'pm')).toEqual(['fe', 'pm'])
    expect(planRoomMemberAdd(['fe'], 'fe')).toBeNull()
    expect(planRoomMemberAdd(['fe'], '')).toBeNull()
  })
})

describe('planRoomMemberRemoval', () => {
  it('drops the member and leaves the lead alone', () => {
    expect(planRoomMemberRemoval({
      memberAgentIds: ['pm', 'fe'],
      pmAgentId: 'pm',
      agentId: 'fe',
    })).toEqual({ plan: { memberAgentIds: ['pm'] } })
  })

  it('vacates the lead seat when the lead is the one leaving', () => {
    expect(planRoomMemberRemoval({
      memberAgentIds: ['pm', 'fe'],
      pmAgentId: 'pm',
      agentId: 'pm',
    })).toEqual({ plan: { memberAgentIds: ['fe'], pmAgentId: null } })
  })

  it('refuses to empty the room, with a reason to show', () => {
    // The app layer rejects this too (W6) — catching it here means the user
    // gets a line of ink instead of a round trip that fails.
    expect(planRoomMemberRemoval({ memberAgentIds: ['fe'], agentId: 'fe' }))
      .toEqual({ error: '房间至少需要一名成员' })
  })

  it('refuses somebody who is not in the room', () => {
    expect(planRoomMemberRemoval({ memberAgentIds: ['fe', 'pm'], agentId: 'ghost' }))
      .toEqual({ error: 'TA 已经不在这个群里' })
  })
})


/* ── 四态徽标(D8 观测体系 §4.4)──────────────────────────────────────────── */

function activity(patch: Partial<CollabAgentActivitySnapshot> = {}): CollabAgentActivitySnapshot {
  return {
    agentId: 'fe',
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

const lease = (executing: boolean, roomSessionId = 'room-1') => ({
  roomSessionId,
  leaseId: `${roomSessionId}#L1`,
  since: 1_000,
  executing,
})

const worker = (status: 'running' | 'done' | 'interrupted') => ({
  cardId: 'card-1',
  roomSessionId: 'room-1',
  status,
  since: 1_000,
})

describe('resolveRoomMemberPresence — 四态', () => {
  it('大脑在想 = 生成中', () => {
    expect(resolveRoomMemberPresence(activity({
      mind: { state: 'thinking', roomSessionId: 'room-1', since: 1 },
    }))).toBe('generating')
  })

  it('大脑那一格拿不到时退回牌上的登记簿标志', () => {
    expect(resolveRoomMemberPresence(activity({ heldLeases: [lease(true)] }))).toBe('generating')
  })

  /**
   * 这一格是整套徽标存在的理由:v3 里牌发出去之后要先躺进那个 agent 的信箱,
   * 而那颗大脑此刻可能正在别的房里想。旧口径(看板 doing 卡)根本表达不了它。
   */
  it('有牌但没在生成 = 持牌等大脑,不与生成中混成一格', () => {
    expect(resolveRoomMemberPresence(activity({ heldLeases: [lease(false)] }))).toBe('holding')
  })

  it('没牌但有在做的卡 = 干活中', () => {
    expect(resolveRoomMemberPresence(activity({ workers: [worker('running')] }))).toBe('working')
  })

  it('做完 / 被打断的卡不算在干活 —— 一张三天前做完的卡不该让人永远亮着', () => {
    expect(resolveRoomMemberPresence(activity({ workers: [worker('done')] }))).toBe('idle')
    expect(resolveRoomMemberPresence(activity({ workers: [worker('interrupted')] }))).toBe('idle')
  })

  it('次序即优先级:在写字 > 拿着牌 > 在干活', () => {
    expect(resolveRoomMemberPresence(activity({
      mind: { state: 'thinking', roomSessionId: 'room-1', since: 1 },
      heldLeases: [lease(false)],
      workers: [worker('running')],
    }))).toBe('generating')
    expect(resolveRoomMemberPresence(activity({
      heldLeases: [lease(false)],
      workers: [worker('running')],
    }))).toBe('holding')
  })

  it('读不到 = 空闲(徽标上两者本来就是同一个样子:都不画)', () => {
    expect(resolveRoomMemberPresence(null)).toBe('idle')
    expect(resolveRoomMemberPresence(undefined)).toBe('idle')
    expect(resolveRoomMemberPresence(activity())).toBe('idle')
  })
})

describe('formatRoomMemberPresence — tooltip 里那半句「在哪儿」', () => {
  const roomName = (id: string): string => (id === 'room-9' ? '排期房' : '')

  // 「TA 怎么不理我」的答案往往正是「TA 在别的房忙着」。
  it('生成中带上房名', () => {
    expect(formatRoomMemberPresence(activity({
      mind: { state: 'thinking', roomSessionId: 'room-9', since: 1 },
    }), roomName)).toBe('在「排期房」生成中')
  })

  it('房名翻不出来时退回 id', () => {
    expect(formatRoomMemberPresence(activity({
      mind: { state: 'thinking', roomSessionId: 'room-77', since: 1 },
    }), roomName)).toBe('在「room-77」生成中')
  })

  it('持牌报张数,干活报卡数', () => {
    expect(formatRoomMemberPresence(activity({
      heldLeases: [lease(false, 'room-1'), lease(false, 'room-2')],
    }), roomName)).toBe('持 2 张牌,等大脑')
    expect(formatRoomMemberPresence(activity({
      workers: [worker('running'), worker('done')],
    }), roomName)).toBe('在干活(1 张卡)')
  })

  it('空闲不出词 —— 徽标不画,tooltip 也不该多一截', () => {
    expect(formatRoomMemberPresence(activity(), roomName)).toBe('')
    expect(formatRoomMemberPresence(null, roomName)).toBe('')
  })
})
