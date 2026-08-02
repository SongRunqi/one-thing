/**
 * agent ↔ agent 私聊房的 get-or-create(docs/design/agent-im-dm.md D3)——
 * store 边界上的事,结构与 `user-dm-room.test.ts` 同源。
 *
 * 只有 app 层测得到的五件事:
 *  1. 幂等:同一对 agent 永远同一间房,**谁发起都一样**(id 字典序派生);
 *  2. 形态:kind='room' + dm 标记 + 双成员(字典序),而且不 archived;
 *  3. 房名「A ⇄ B」,任一方改名后下一次 ensure 跟随;
 *  4. 校验:任一侧查无此人 / service / 退休一律不开房;自己和自己也不开;
 *  5. current-session 指针在建房后被还原(建房的是一个 agent 的回合,更不该
 *     抢走用户正在看的标签页)。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeSession {
  id: string
  name: string
  kind?: string
  agentId?: string
  isArchived?: boolean
  room?: { memberAgentIds?: string[]; dm?: boolean; frozen?: boolean; budgets?: unknown }
  messages: unknown[]
}

const AGENTS: Record<string, { id: string; name: string; kind?: string; status?: string }> = {
  fe: { id: 'fe', name: '小李' },
  pm: { id: 'pm', name: '阿明' },
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
  // drive 现在要渲染用户署名(v3 V1),因此读一次设置里的身份。
  getSettings: () => ({}),
  getSession: (id: string) => mocks.sessions.get(id),
  createSession: (id: string, name: string) => {
    const session: FakeSession = { id, name, messages: [] }
    mocks.sessions.set(id, session)
    mocks.created.push(id)
    mocks.currentSessionId = id
    return session
  },
  getCurrentSessionId: () => mocks.currentSessionId,
  setCurrentSessionId: (id: string) => { mocks.currentSessionId = id },
  updateSessionAgent: vi.fn(),
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

const { ensureAgentDmRoom } = await import('../agent-dm-room.js')

const PAIR_ROOM = 'agent-dm-room-fe--pm'

function room(): FakeSession {
  return mocks.sessions.get(PAIR_ROOM) as FakeSession
}

beforeEach(() => {
  mocks.sessions.clear()
  mocks.created.length = 0
  mocks.renamed.length = 0
  mocks.currentSessionId = 'chat-user-was-here'
  AGENTS.fe = { id: 'fe', name: '小李' }
  AGENTS.pm = { id: 'pm', name: '阿明' }
})

describe('ensureAgentDmRoom', () => {
  it('建出一间双成员 dm 房,房名「A ⇄ B」,而且不藏起来', () => {
    expect(ensureAgentDmRoom('fe', 'pm')).toBe(PAIR_ROOM)
    expect(room()).toMatchObject({
      id: PAIR_ROOM,
      name: '小李 ⇄ 阿明',
      kind: 'room',
      room: { memberAgentIds: ['fe', 'pm'], dm: true },
    })
    // 用户可旁观可插话(D4 透明制)——藏起来的房间等于暗通道。
    expect(room().isArchived).toBeUndefined()
  })

  it('幂等:谁发起都是同一间房,第二次只是读', () => {
    expect(ensureAgentDmRoom('fe', 'pm')).toBe(PAIR_ROOM)
    expect(ensureAgentDmRoom('pm', 'fe')).toBe(PAIR_ROOM)
    expect(ensureAgentDmRoom('  pm  ', ' fe ')).toBe(PAIR_ROOM)
    expect(mocks.created).toEqual([PAIR_ROOM])
    expect(mocks.renamed).toEqual([])
  })

  it('成员按字典序落库,与 id 的派生顺序同源', () => {
    ensureAgentDmRoom('pm', 'fe')
    expect(room().room?.memberAgentIds).toEqual(['fe', 'pm'])
  })

  it('还原 current-session 指针:建房不抢用户正在看的标签页', () => {
    ensureAgentDmRoom('fe', 'pm')
    expect(mocks.currentSessionId).toBe('chat-user-was-here')
  })

  it('任一方改名后,下一次 ensure 让房名跟随', () => {
    ensureAgentDmRoom('fe', 'pm')
    AGENTS.pm = { id: 'pm', name: '明哥' }
    expect(ensureAgentDmRoom('fe', 'pm')).toBe(PAIR_ROOM)
    expect(room().name).toBe('小李 ⇄ 明哥')
    expect(mocks.renamed).toEqual([{ id: PAIR_ROOM, name: '小李 ⇄ 明哥' }])
  })

  it('形态被弄坏了就补回来,不重建会话,也不动预算这类既有配置', () => {
    ensureAgentDmRoom('fe', 'pm')
    room().kind = undefined
    room().room = { memberAgentIds: ['fe'], budgets: { maxChain: 9 } }
    expect(ensureAgentDmRoom('fe', 'pm')).toBe(PAIR_ROOM)
    expect(room()).toMatchObject({
      kind: 'room',
      room: { memberAgentIds: ['fe', 'pm'], dm: true, budgets: { maxChain: 9 } },
    })
    expect(mocks.created).toEqual([PAIR_ROOM])
  })

  it('自己和自己没有私聊房', () => {
    expect(ensureAgentDmRoom('fe', 'fe')).toBeNull()
    expect(ensureAgentDmRoom('fe', '  fe  ')).toBeNull()
    expect(mocks.created).toEqual([])
  })

  it('任一侧查无此人 / service / 已退休:一律不开房', () => {
    expect(ensureAgentDmRoom('fe', 'ghost')).toBeNull()
    expect(ensureAgentDmRoom('ghost', 'fe')).toBeNull()
    expect(ensureAgentDmRoom('fe', 'dj')).toBeNull()
    expect(ensureAgentDmRoom('dj', 'fe')).toBeNull()
    expect(ensureAgentDmRoom('fe', 'gone')).toBeNull()
    expect(ensureAgentDmRoom('gone', 'fe')).toBeNull()
    expect(ensureAgentDmRoom('fe', '')).toBeNull()
    expect(ensureAgentDmRoom('', 'pm')).toBeNull()
    expect(mocks.created).toEqual([])
  })
})
