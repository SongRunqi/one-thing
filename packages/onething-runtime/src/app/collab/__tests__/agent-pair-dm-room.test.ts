/**
 * 双成员 dm 房的协调器行为(docs/design/agent-im-dm.md D6/§3.3,IM P3)。
 *
 * 结构与 `coordinator-dm-room.test.ts` 同源(同一套 store/events/engine 假件),
 * 盯三件纯逻辑测不到的事:
 *
 *  1. 免判的**接线**:一位成员的 say 收尾之后,对面那位被驱动,而意愿判定一次
 *     都没买 —— 纯规则只证明了决策,这里证明它真的接在级联上;
 *  2. 用户插话**不**免判:旁观者说一句仍然走既有意愿判定(§3.3 差异点 1);
 *  3. 链长闸默认值:双成员房没配就是 6,群房仍是 32,显式配置照旧压过默认。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeMessage {
  id: string
  role: string
  content: string
  agentId?: string
  source?: string
  timestamp: number
}

interface FakeSession {
  id: string
  name: string
  kind?: string
  agentId?: string
  collab?: { roomSessionId?: string }
  room?: { memberAgentIds: string[]; dm?: boolean; frozen?: boolean; budgets?: { maxChain?: number } }
  messages: FakeMessage[]
}

const mocks = vi.hoisted(() => ({
  sessions: new Map<string, unknown>(),
  emitted: [] as Array<{ sessionId: string; event: { type?: string; content?: string } }>,
  anyListeners: [] as Array<{ sessionId: string; handler: (envelope: unknown) => void }>,
  typeListeners: [] as Array<{ type: string; handler: (envelope: unknown) => void }>,
  agents: new Map<string, { id: string; name: string; status?: string }>(),
  judgeWillingness: vi.fn(async () => [] as Array<{ agentId: string; respond: boolean }>),
}))

vi.mock('@onething/core/storage', () => ({
  readJsonFile: <T>(_path: string, fallback: T) => fallback,
  writeJsonFile: () => {},
}))

vi.mock('../../stores/paths.js', () => ({ getStorePath: () => '/tmp/onething-collab-pair-dm-test' }))

vi.mock('../../usage/index.js', () => ({
  getUsageLedger: () => ({ readRecordsInRange: async () => [] }),
}))

vi.mock('../../store.js', () => ({
  // drive 现在要渲染用户署名(v3 V1),因此读一次设置里的身份。
  getSettings: () => ({}),
  updateSessionWorkingDirectory: vi.fn(),
  onSessionsDeleted: () => () => {},
  getSession: (id: string) => mocks.sessions.get(id),
  getSessionsList: () => [...mocks.sessions.values()],
  addMessage: (sessionId: string, message: FakeMessage) => {
    const session = mocks.sessions.get(sessionId) as FakeSession | undefined
    session?.messages.push(message)
  },
  createSession: (id: string, name: string) => {
    const session = { id, name, messages: [] } as unknown as FakeSession
    mocks.sessions.set(id, session)
    return session
  },
  createSessionWithoutFocus: (id: string, name: string) => {
    const session = { id, name, messages: [] } as unknown as FakeSession
    mocks.sessions.set(id, session)
    return session
  },
  getCurrentSessionId: () => undefined,
  setCurrentSessionId: vi.fn(),
  updateSessionArchived: vi.fn(),
  updateSessionAgent: vi.fn(),
  updateMessageMentions: () => true,
  updateMessageReplyTo: () => true,
  updateSessionCollab: (
    sessionId: string,
    fields: { room?: FakeSession['room']; kind?: string | null; collab?: unknown },
  ) => {
    const session = mocks.sessions.get(sessionId) as FakeSession | undefined
    if (session && fields.room) session.room = fields.room
    if (session && fields.kind !== undefined) {
      (session as { kind?: string }).kind = fields.kind ?? undefined
    }
    if (session && fields.collab !== undefined) {
      (session as { collab?: unknown }).collab = fields.collab ?? undefined
    }
    return true
  },
  updateSessionPermissionMode: vi.fn(),
  renameSession: vi.fn(),
}))

vi.mock('../../events/index.js', () => ({
  getEventBus: () => ({
    emit: async (sessionId: string, event: { type?: string }) => {
      mocks.emitted.push({ sessionId, event })
      for (const entry of mocks.anyListeners) {
        if (entry.sessionId === sessionId) entry.handler({ sessionId, event })
      }
      for (const entry of mocks.typeListeners) {
        if (entry.type === event.type) entry.handler({ sessionId, event })
      }
    },
    onAny: (sessionId: string, handler: (envelope: unknown) => void) => {
      const entry = { sessionId, handler }
      mocks.anyListeners.push(entry)
      return () => {
        mocks.anyListeners = mocks.anyListeners.filter(candidate => candidate !== entry)
      }
    },
    onAnySession: (type: string, handler: (envelope: unknown) => void) => {
      const entry = { type, handler }
      mocks.typeListeners.push(entry)
      return () => {
        mocks.typeListeners = mocks.typeListeners.filter(candidate => candidate !== entry)
      }
    },
  }),
}))

vi.mock('../../engine/index.js', () => ({
  getStreamEngineSafe: () => ({
    hasCommandTarget: () => true,
    getController: () => undefined,
    getChannel: () => 'ipc',
    abort: vi.fn(),
  }),
}))

vi.mock('../../agents/index.js', () => ({
  findAgent: (id: string) => mocks.agents.get(id) ?? null,
}))

vi.mock('../board-store.js', () => ({
  forgetCollabBoardRoom: () => {},
  loadCollabBoard: () => ({ version: 1, tasks: [] }),
  shutdownCollabBoardBroadcasts: () => {},
  getCollabSelfTaskFacts: () => [],
}))

vi.mock('../willingness-runner.js', () => ({
  judgeWillingness: (...args: unknown[]) => mocks.judgeWillingness(...(args as [])),
}))

vi.mock('../worker.js', () => ({
  forgetCollabRoomWork: () => {},
  initializeCollabWorkers: () => {},
  shutdownCollabWorkers: () => {},
  freezeRoomWork: () => {},
  resumeRoomWork: () => {},
  reconcileRoomBoard: () => {},
}))

const coordinator = await import('../coordinator.js')
const roomRuntime = await import('../room-runtime.js')
const {
  COLLAB_DEFAULT_MAX_CHAIN,
  COLLAB_DM_PAIR_MAX_CHAIN,
  COLLAB_SAY_SOURCE,
} = await import('@onething/runtime/collab')

const PAIR_ROOM = 'agent-dm-room-fe--pm'
const GROUP_ROOM = 'room-1'

function seedPairRoom(overrides: Partial<FakeSession['room']> = {}): FakeSession {
  const session: FakeSession = {
    id: PAIR_ROOM,
    name: '小李 ⇄ 阿明',
    kind: 'room',
    room: { memberAgentIds: ['fe', 'pm'], dm: true, ...overrides },
    messages: [],
  }
  mocks.sessions.set(PAIR_ROOM, session)
  return session
}

async function sendUserMessage(sessionId: string, content: string): Promise<void> {
  const message = { id: `msg-${mocks.emitted.length}`, role: 'user', content, timestamp: Date.now() }
  const session = mocks.sessions.get(sessionId) as FakeSession
  session.messages.push(message)
  for (const entry of mocks.typeListeners) {
    if (entry.type === 'message:user-created') entry.handler({ sessionId, event: { message } })
  }
  await flush()
}

/** 一位成员的回合收尾:它说了一句(say 落进房里),然后流正常结束。 */
async function finishTurnWithSay(agentId: string, content: string): Promise<void> {
  const room = mocks.sessions.get(PAIR_ROOM) as FakeSession
  room.messages.push({
    id: `say-${room.messages.length}`,
    role: 'assistant',
    agentId,
    content,
    source: COLLAB_SAY_SOURCE,
    timestamp: Date.now(),
  })
  const agentSessionId = `agent-exec-${agentId}-${PAIR_ROOM}`
  for (const entry of [...mocks.anyListeners]) {
    if (entry.sessionId === agentSessionId) {
      entry.handler({ sessionId: agentSessionId, event: { type: 'stream:complete' } })
    }
  }
  await flush()
}

function driveTargets(): string[] {
  return mocks.emitted
    .filter(entry => entry.event.type === 'command:send-message')
    .map(entry => entry.sessionId)
}

async function flush(): Promise<void> {
  for (let index = 0; index < 32; index++) await Promise.resolve()
}

beforeEach(() => {
  coordinator.shutdownCollabCoordinator()
  mocks.sessions.clear()
  mocks.emitted.length = 0
  mocks.anyListeners = []
  mocks.typeListeners = []
  mocks.judgeWillingness.mockClear()
  mocks.agents.clear()
  mocks.agents.set('fe', { id: 'fe', name: '小李' })
  mocks.agents.set('pm', { id: 'pm', name: '阿明' })
})

describe('D6 免判激活(双成员房)', () => {
  it('一位成员说完话,对面那位直接被驱动,一次意愿判定都不买', async () => {
    seedPairRoom()
    coordinator.initializeCollabCoordinator()
    mocks.emitted.length = 0

    // 用户点名把小李拉起来。这一步走的是既有 @ 语义 + 既有意愿判定(阿明被问
    // 了一次"要不要接话"),免判不管用户说话 —— 所以判定计数在这里清零,下面
    // 数的才是**免判那一步**买了几次。
    await sendUserMessage(PAIR_ROOM, '@小李 你和阿明对一下接口')
    expect(driveTargets()).toEqual([`agent-exec-fe-${PAIR_ROOM}`])
    mocks.judgeWillingness.mockClear()

    // 小李说了一句 —— 这就是免判要接的地方。
    await finishTurnWithSay('fe', '阿明,分页参数你那边怎么定的?')

    expect(driveTargets()).toEqual([
      `agent-exec-fe-${PAIR_ROOM}`,
      `agent-exec-pm-${PAIR_ROOM}`,
    ])
    expect(mocks.judgeWillingness).not.toHaveBeenCalled()
  })

  it('用户插话不免判:旁观者说一句仍然走意愿判定', async () => {
    seedPairRoom()
    coordinator.initializeCollabCoordinator()
    mocks.emitted.length = 0

    await sendUserMessage(PAIR_ROOM, '你们聊,我看看')

    expect(driveTargets()).toEqual([])
    expect(mocks.judgeWillingness).toHaveBeenCalledTimes(1)
  })
})

describe('§3.3 链长闸默认值', () => {
  const chainFor = (room: FakeSession['room']) =>
    roomRuntime.maxChainFor({
      id: 'x',
      kind: 'room',
      room,
      messages: [],
    } as unknown as Parameters<typeof roomRuntime.maxChainFor>[0])

  it('双成员 dm 房没配过 → 6(客套乒乓的机械止损)', () => {
    expect(chainFor({ memberAgentIds: ['fe', 'pm'], dm: true })).toBe(COLLAB_DM_PAIR_MAX_CHAIN)
    expect(COLLAB_DM_PAIR_MAX_CHAIN).toBe(6)
  })

  it('群房与单成员私聊房零变化 → 仍是默认 32', () => {
    expect(chainFor({ memberAgentIds: ['fe', 'pm'] })).toBe(COLLAB_DEFAULT_MAX_CHAIN)
    expect(chainFor({ memberAgentIds: ['fe'], dm: true })).toBe(COLLAB_DEFAULT_MAX_CHAIN)
  })

  it('显式配置压过默认值,0 仍是"不限"', () => {
    expect(chainFor({ memberAgentIds: ['fe', 'pm'], dm: true, budgets: { maxChain: 20 } })).toBe(20)
    expect(chainFor({ memberAgentIds: ['fe', 'pm'], dm: true, budgets: { maxChain: 0 } }))
      .toBe(Number.POSITIVE_INFINITY)
  })
})

describe('群房零变化(正控)', () => {
  it('普通群里 agent 说完话仍然走意愿判定,没有人被免判拉起来', async () => {
    mocks.sessions.set(GROUP_ROOM, {
      id: GROUP_ROOM,
      name: '官网改版组',
      kind: 'room',
      room: { memberAgentIds: ['fe', 'pm'] },
      messages: [],
    } satisfies FakeSession)
    coordinator.initializeCollabCoordinator()
    mocks.emitted.length = 0

    await sendUserMessage(GROUP_ROOM, '@小李 你看一下')
    expect(driveTargets()).toEqual([`agent-exec-fe-${GROUP_ROOM}`])

    const room = mocks.sessions.get(GROUP_ROOM) as FakeSession
    room.messages.push({
      id: 'say-group',
      role: 'assistant',
      agentId: 'fe',
      content: '看完了,是分页参数的问题',
      source: COLLAB_SAY_SOURCE,
      timestamp: Date.now(),
    })
    for (const entry of [...mocks.anyListeners]) {
      if (entry.sessionId === `agent-exec-fe-${GROUP_ROOM}`) {
        entry.handler({ sessionId: `agent-exec-fe-${GROUP_ROOM}`, event: { type: 'stream:complete' } })
      }
    }
    await flush()

    // 阿明没有被免判拉起来:群里"要不要接话"仍然由它自己判定(这里判定返回不接)。
    expect(driveTargets()).toEqual([`agent-exec-fe-${GROUP_ROOM}`])
    expect(mocks.judgeWillingness).toHaveBeenCalled()
  })
})
