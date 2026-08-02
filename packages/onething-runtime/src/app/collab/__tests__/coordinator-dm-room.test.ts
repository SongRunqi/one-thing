/**
 * 单成员 dm 房的协调器行为(docs/design/agent-im-dm.md D6 + P1 死房兜底)。
 *
 * 结构与 coordinator-membership / coordinator-retired-member 同源(同一套
 * store/events/engine 假件),盯四件纯逻辑测不到的事:
 *
 *  1. 免判:用户随便说一句,唯一那位成员被驱动,而**意愿判定一次都没调**;
 *  2. 免的只是判定:冻结门、退休门照常拦下,拦下时房里有话说;
 *  3. 死房兜底:激活消失的每条路径都在房里留一行用户看得见的系统行;
 *  4. 群房零变化:同样的用户消息在普通群里仍然走判定(正控)。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeSession {
  id: string
  name: string
  kind?: string
  agentId?: string
  room?: { memberAgentIds: string[]; dm?: boolean; frozen?: boolean }
  messages: Array<{ id: string; role: string; content: string; source?: string; timestamp: number }>
}

const mocks = vi.hoisted(() => ({
  sessions: new Map<string, unknown>(),
  emitted: [] as Array<{ sessionId: string; event: { type?: string } }>,
  anyListeners: [] as Array<{ sessionId: string; handler: (envelope: unknown) => void }>,
  typeListeners: [] as Array<{ type: string; handler: (envelope: unknown) => void }>,
  agents: new Map<string, { id: string; name: string; status?: string }>(),
  judgeWillingness: vi.fn(async () => [] as Array<{ agentId: string; respond: boolean }>),
}))

vi.mock('@onething/core/storage', () => ({
  readJsonFile: <T>(_path: string, fallback: T) => fallback,
  writeJsonFile: () => {},
}))

vi.mock('../../stores/paths.js', () => ({ getStorePath: () => '/tmp/onething-collab-dm-test' }))

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
  addMessage: (sessionId: string, message: { id: string }) => {
    const session = mocks.sessions.get(sessionId) as FakeSession | undefined
    session?.messages.push(message as FakeSession['messages'][number])
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

const DM_ROOM = 'agent-dm-fe'
const GROUP_ROOM = 'room-1'

function seedDmRoom(overrides: Partial<FakeSession['room']> = {}): FakeSession {
  const session: FakeSession = {
    id: DM_ROOM,
    name: '小李',
    kind: 'room',
    room: { memberAgentIds: ['fe'], dm: true, ...overrides },
    messages: [],
  }
  mocks.sessions.set(DM_ROOM, session)
  return session
}

function seedGroupRoom(): FakeSession {
  const session: FakeSession = {
    id: GROUP_ROOM,
    name: '官网改版组',
    kind: 'room',
    room: { memberAgentIds: ['fe', 'pm'] },
    messages: [],
  }
  mocks.sessions.set(GROUP_ROOM, session)
  return session
}

async function sendUserMessage(sessionId: string, content = '帮我看看首页那个报错'): Promise<void> {
  const message = { id: `msg-${mocks.emitted.length}`, role: 'user', content, timestamp: Date.now() }
  const session = mocks.sessions.get(sessionId) as FakeSession
  session.messages.push(message)
  for (const entry of mocks.typeListeners) {
    if (entry.type === 'message:user-created') entry.handler({ sessionId, event: { message } })
  }
  await flush()
}

function driveCommands(): Array<{ sessionId: string; event: { type?: string; content?: string } }> {
  return mocks.emitted.filter(entry => entry.event.type === 'command:send-message')
}

function systemLines(sessionId: string): string[] {
  return ((mocks.sessions.get(sessionId) as FakeSession | undefined)?.messages ?? [])
    .filter(message => message.role === 'system')
    .map(message => message.content)
}

async function flush(): Promise<void> {
  for (let index = 0; index < 16; index++) await Promise.resolve()
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
  mocks.agents.set('gone', { id: 'gone', name: '老王', status: 'retired' })
})

describe('D6 免判激活', () => {
  it('用户说一句就驱动唯一那位成员,一次意愿判定都不买', async () => {
    seedDmRoom()
    coordinator.initializeCollabCoordinator()
    mocks.emitted.length = 0

    await sendUserMessage(DM_ROOM)

    expect(driveCommands()).toHaveLength(1)
    // 回合跑在该 agent 的常驻执行会话里(per-room 拓扑自动成立)。
    expect(driveCommands()[0].sessionId).toBe(`agent-exec-fe-${DM_ROOM}`)
    // drive 是数据:用户那句话的信封。指令块(以及它里面的 agent 名字)已删。
    expect(String(driveCommands()[0].event.content)).toContain('帮我看看首页那个报错')
    expect(mocks.judgeWillingness).not.toHaveBeenCalled()
  })

  it('群房零变化:同样的消息在群里仍然走意愿判定', async () => {
    seedGroupRoom()
    coordinator.initializeCollabCoordinator()
    mocks.emitted.length = 0

    await sendUserMessage(GROUP_ROOM)

    expect(mocks.judgeWillingness).toHaveBeenCalledTimes(1)
    expect(driveCommands()).toEqual([])
  })
})

describe('免的只是判定,围栏照旧', () => {
  it('冻结的私聊房不驱动,并且明说自己被暂停了', async () => {
    seedDmRoom({ memberAgentIds: ['fe'], frozen: true })
    coordinator.initializeCollabCoordinator()
    mocks.emitted.length = 0

    await sendUserMessage(DM_ROOM)

    expect(driveCommands()).toEqual([])
    expect(systemLines(DM_ROOM)).toEqual(['这间私聊已暂停,TA 暂时不会回复——恢复后再说一声'])
  })

  it('退休的唯一成员不驱动,并且说清楚这间房不会再有回复', async () => {
    seedDmRoom({ memberAgentIds: ['gone'], dm: true })
    coordinator.initializeCollabCoordinator()
    mocks.emitted.length = 0

    await sendUserMessage(DM_ROOM)

    expect(driveCommands()).toEqual([])
    expect(systemLines(DM_ROOM)).toEqual(['老王 已注销,这间私聊不会再有回复'])
  })

  it('唯一成员查无此人:同样不静默', async () => {
    seedDmRoom({ memberAgentIds: ['ghost'], dm: true })
    coordinator.initializeCollabCoordinator()
    mocks.emitted.length = 0

    await sendUserMessage(DM_ROOM)

    expect(driveCommands()).toEqual([])
    expect(systemLines(DM_ROOM)).toEqual(['这位同事已经不在了,这间私聊不会再有回复'])
  })

  it('群房的死房兜底一个字都没有:群里少一个人不等于群坏了', async () => {
    const group = seedGroupRoom()
    group.room = { memberAgentIds: ['gone'] }
    coordinator.initializeCollabCoordinator()
    mocks.emitted.length = 0

    await sendUserMessage(GROUP_ROOM)

    expect(driveCommands()).toEqual([])
    expect(systemLines(GROUP_ROOM)).toEqual([])
  })
})

/**
 * 私聊房的名册不可编辑(架构收敛 C3 §4 / B3)。
 *
 * 界面上这两处本来就是只读的,但那只是**界面**:daemon 与任何程序化调用都直接
 * 落在 `setCollabRoomConfig` 上。防线画在 UI 层等于没画 —— 一个 patch 就能把
 * 一间私聊悄悄变成群,而所有读它的分支(免判激活、union 工具面、dm 版提示词)
 * 仍按私聊在跑。
 */
describe('私聊房拒绝改名册', () => {
  const REFUSAL = '私聊的成员不能改:这间房的成员就是私聊的双方。要和别人聊请另开一间私聊,要多人参与请建群。'

  it('单成员 dm 房:patch 成员被拒,房还是原来那间房', () => {
    seedDmRoom()
    expect(coordinator.setCollabRoomConfig(DM_ROOM, { memberAgentIds: ['fe', 'pm'] }))
      .toEqual({ success: false, error: REFUSAL })
    expect((mocks.sessions.get(DM_ROOM) as FakeSession).room?.memberAgentIds).toEqual(['fe'])
  })

  it('双成员 pair dm 房同样拒绝', () => {
    seedDmRoom({ memberAgentIds: ['fe', 'pm'] })
    expect(coordinator.setCollabRoomConfig(DM_ROOM, { memberAgentIds: ['fe'] }).error).toBe(REFUSAL)
  })

  it('私聊房的**其它**设置照旧改得动 —— 拒的只是名册这一格', () => {
    seedDmRoom()
    expect(coordinator.setCollabRoomConfig(DM_ROOM, { name: '小李(前端)' })).toEqual({ success: true })
  })

  it('正控:同样的 patch 打在群房上是合法的', () => {
    seedGroupRoom()
    expect(coordinator.setCollabRoomConfig(GROUP_ROOM, { memberAgentIds: ['fe'] }))
      .toEqual({ success: true })
  })
})
