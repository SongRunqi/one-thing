/**
 * 托管私聊房的 get-or-create(docs/design/agent-im-dm.md D1)——store 边界上的事。
 *
 * 只有 app 层测得到的四件事:
 *  1. 幂等:同一个 agent 永远同一间房(id 是派生的,建一次就不再建);
 *  2. 形态:kind='room' + dm 标记 + 单成员,而且**不 archived**(私聊是台面上的
 *     对话,不是执行会话那种基础设施);
 *  3. 校验:查无此人 / service / 退休一律不开房(A1+A2 纪律);
 *  4. current-session 指针在建房后被还原(建房不该抢走用户正在看的标签页)。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeSession {
  id: string
  name: string
  kind?: string
  agentId?: string
  isArchived?: boolean
  room?: { memberAgentIds?: string[]; dm?: boolean; frozen?: boolean }
  messages: unknown[]
}

const AGENTS: Record<string, { id: string; name: string; kind?: string; status?: string }> = {
  fe: { id: 'fe', name: '小李' },
  dj: { id: 'dj', name: '电台 DJ', kind: 'service' },
  gone: { id: 'gone', name: '老王', status: 'retired' },
}

const mocks = vi.hoisted(() => ({
  sessions: new Map<string, unknown>(),
  currentSessionId: 'chat-user-was-here',
  created: [] as string[],
  renamed: [] as Array<{ id: string; name: string }>,
}))

vi.mock('../../store.js', () => ({
  getSession: (id: string) => mocks.sessions.get(id),
  createSession: (id: string, name: string) => {
    const session: FakeSession = { id, name, messages: [] }
    mocks.sessions.set(id, session)
    mocks.created.push(id)
    // 真实 store 会把指针挪到新会话上 —— 这正是调用方要还原它的原因。
    mocks.currentSessionId = id
    return session
  },
  getCurrentSessionId: () => mocks.currentSessionId,
  setCurrentSessionId: (id: string) => { mocks.currentSessionId = id },
  updateSessionAgent: (id: string, agentId: string) => {
    const session = mocks.sessions.get(id) as FakeSession | undefined
    if (!session) return false
    session.agentId = agentId
    return true
  },
  updateSessionCollab: (
    id: string,
    fields: { kind?: string | null; room?: FakeSession['room'] | null },
  ) => {
    const session = mocks.sessions.get(id) as FakeSession | undefined
    if (!session) return false
    if (fields.kind !== undefined) session.kind = fields.kind ?? undefined
    if (fields.room !== undefined) session.room = fields.room ?? undefined
    return true
  },
  renameSession: (id: string, name: string) => {
    const session = mocks.sessions.get(id) as FakeSession | undefined
    if (session) session.name = name
    mocks.renamed.push({ id, name })
  },
  updateSessionArchived: vi.fn(),
}))

vi.mock('../../agents/index.js', () => ({ findAgent: (id: string) => AGENTS[id] ?? null }))

const { ensureUserDmRoom } = await import('../user-dm-room.js')

const DM_ROOM = 'agent-dm-fe'

function room(): FakeSession {
  return mocks.sessions.get(DM_ROOM) as FakeSession
}

beforeEach(() => {
  mocks.sessions.clear()
  mocks.created.length = 0
  mocks.renamed.length = 0
  mocks.currentSessionId = 'chat-user-was-here'
})

describe('ensureUserDmRoom', () => {
  it('建出一间单成员 dm 房,房名就是 agent 的名字,而且不藏起来', () => {
    expect(ensureUserDmRoom('fe')).toBe(DM_ROOM)
    expect(room()).toMatchObject({
      id: DM_ROOM,
      name: '小李',
      kind: 'room',
      agentId: 'fe',
      room: { memberAgentIds: ['fe'], dm: true },
    })
    // 执行会话要 archived,私聊不要 —— 它就是用户点开的那场对话。
    expect(room().isArchived).toBeUndefined()
  })

  it('幂等:同一个 agent 永远同一间房,第二次只是读', () => {
    expect(ensureUserDmRoom('fe')).toBe(DM_ROOM)
    expect(ensureUserDmRoom('fe')).toBe(DM_ROOM)
    expect(ensureUserDmRoom('fe')).toBe(DM_ROOM)
    expect(mocks.created).toEqual([DM_ROOM])
    expect(mocks.renamed).toEqual([])
  })

  it('还原 current-session 指针:建房不抢用户正在看的标签页', () => {
    ensureUserDmRoom('fe')
    expect(mocks.currentSessionId).toBe('chat-user-was-here')
  })

  it('agent 改名后,下一次 ensure 让房名跟随', () => {
    ensureUserDmRoom('fe')
    AGENTS.fe = { id: 'fe', name: '李工' }
    try {
      expect(ensureUserDmRoom('fe')).toBe(DM_ROOM)
      expect(room().name).toBe('李工')
      expect(mocks.renamed).toEqual([{ id: DM_ROOM, name: '李工' }])
    } finally {
      AGENTS.fe = { id: 'fe', name: '小李' }
    }
  })

  it('形态被弄坏了(手工改过 kind/成员)就补回来,不重建会话', () => {
    ensureUserDmRoom('fe')
    room().kind = undefined
    room().room = { memberAgentIds: [] }
    expect(ensureUserDmRoom('fe')).toBe(DM_ROOM)
    expect(room()).toMatchObject({ kind: 'room', room: { memberAgentIds: ['fe'], dm: true } })
    expect(mocks.created).toEqual([DM_ROOM])
  })

  it('查无此人 / service / 已退休:一律不开房', () => {
    expect(ensureUserDmRoom('ghost')).toBeNull()
    expect(ensureUserDmRoom('dj')).toBeNull()
    expect(ensureUserDmRoom('gone')).toBeNull()
    expect(ensureUserDmRoom('')).toBeNull()
    expect(ensureUserDmRoom('   ')).toBeNull()
    expect(mocks.created).toEqual([])
  })
})
