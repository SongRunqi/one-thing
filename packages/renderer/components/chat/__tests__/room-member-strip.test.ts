import { describe, expect, it } from 'vitest'
import {
  ROOM_MEMBER_FALLBACK_AVATAR,
  buildAddableRoomAgents,
  buildRoomMemberEntries,
  formatRoomMemberTooltip,
  planRoomMemberAdd,
  planRoomMemberRemoval,
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
