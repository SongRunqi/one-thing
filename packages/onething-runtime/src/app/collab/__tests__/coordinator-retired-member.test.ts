/**
 * 退休成员的激活拒绝 —— docs/design/agent-domain-model.md §3.2 的「激活链」一行。
 *
 * A2 的核心行为:UI 的「删除」变成退休,而退休的人**留在** `memberAgentIds` 里
 * (数据不动,成员条上照旧是一块墓碑),只是永远沉默。这里盯三件纯逻辑测不到的事:
 *
 *  1. 已经排在队里的激活到了驱动时被丢掉 —— 房间不为它发任何 send-message;
 *  2. 正控:同一条链路上一个在职成员**确实**驱得起来(否则第一条是空断言);
 *  3. 退休的人不能被**拉进**房间,但一间已经装着退休成员的旧房照旧改得动配置
 *     (否则一个成员退休就会把整间房的设置锁死)。
 *
 * 结构与 coordinator-membership.test.ts 同源:同一套 store/events/engine 假件,
 * 唯一的区别是 agents 假件带 status。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeSession {
  id: string
  name: string
  kind?: string
  permissionMode?: string
  room?: { memberAgentIds: string[]; pmAgentId?: string; frozen?: boolean }
  messages: Array<{ id: string; role: string; content: string; source?: string; timestamp: number }>
}

const mocks = vi.hoisted(() => ({
  sessions: new Map<string, unknown>(),
  emitted: [] as Array<{ sessionId: string; event: { type?: string } }>,
  anyListeners: [] as Array<{ sessionId: string; handler: (envelope: unknown) => void }>,
  typeListeners: [] as Array<{ type: string; handler: (envelope: unknown) => void }>,
  workerHost: null as null | Record<string, (...args: never[]) => unknown>,
  // 退休状态在测试中间会被翻动,所以放在 hoisted 里而不是模块常量。
  agents: new Map<string, { id: string; name: string; avatar?: string; status?: string }>(),
  updateSessionCollab: vi.fn((_sessionId: string, _fields: unknown) => true),
}))

vi.mock('@onething/core/storage', () => ({
  readJsonFile: <T>(_path: string, fallback: T) => fallback,
  writeJsonFile: () => {},
}))

vi.mock('../../stores/paths.js', () => ({ getStorePath: () => '/tmp/onething-collab-retired-test' }))

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
    return mocks.updateSessionCollab(sessionId, fields)
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
}))

vi.mock('../willingness-runner.js', () => ({ judgeWillingness: async () => [] }))

vi.mock('../worker.js', () => ({
  forgetCollabRoomWork: () => {},
  initializeCollabWorkers: (host: Record<string, (...args: never[]) => unknown>) => {
    mocks.workerHost = host
  },
  shutdownCollabWorkers: () => {},
  freezeRoomWork: () => {},
  resumeRoomWork: () => {},
  reconcileRoomBoard: () => {},
}))

const coordinator = await import('../coordinator.js')

const ROOM = 'room-1'

function seedRoom(room: FakeSession['room']): FakeSession {
  const session: FakeSession = { id: ROOM, name: '官网改版组', kind: 'room', room, messages: [] }
  mocks.sessions.set(ROOM, session)
  return session
}

function enqueue(agentId: string): void {
  ;(mocks.workerHost as { enqueueRoomActivation: (room: string, agentId: string, reason: string) => void })
    .enqueueRoomActivation(ROOM, agentId, 'task-event')
}

function driveCommands(): Array<{ sessionId: string; event: { type?: string } }> {
  return mocks.emitted.filter(entry => entry.event.type === 'command:send-message')
}

async function flush(): Promise<void> {
  for (let index = 0; index < 8; index++) await Promise.resolve()
}

beforeEach(() => {
  coordinator.shutdownCollabCoordinator()
  mocks.sessions.clear()
  mocks.emitted.length = 0
  mocks.anyListeners = []
  mocks.typeListeners = []
  mocks.workerHost = null
  mocks.updateSessionCollab.mockClear()
  mocks.agents.clear()
  mocks.agents.set('pm', { id: 'pm', name: '阿明', avatar: '📋' })
  mocks.agents.set('fe', { id: 'fe', name: '小李', avatar: '🔧' })
  // 老王已退休:还在花名册上,但不该再被激活。
  mocks.agents.set('gone', { id: 'gone', name: '老王', avatar: '🎨', status: 'retired' })
})

describe('retired members never take the floor', () => {
  it('drops a queued activation for a retired member', async () => {
    seedRoom({ memberAgentIds: ['pm', 'gone'] })
    coordinator.initializeCollabCoordinator()
    expect(mocks.workerHost).toBeTruthy()
    mocks.emitted.length = 0

    enqueue('gone')
    await flush()

    expect(driveCommands()).toEqual([])
    // 数据不动:退休不是把人从房间里删掉。
    expect((mocks.sessions.get(ROOM) as FakeSession).room?.memberAgentIds).toEqual(['pm', 'gone'])
  })

  it('positive control: an active member on the same path does drive', async () => {
    seedRoom({ memberAgentIds: ['pm', 'fe'] })
    coordinator.initializeCollabCoordinator()
    mocks.emitted.length = 0

    enqueue('fe')
    await flush()

    expect(driveCommands()).toHaveLength(1)
  })

  it('a member retired mid-flight stops driving on the very next activation', async () => {
    seedRoom({ memberAgentIds: ['pm', 'fe'] })
    coordinator.initializeCollabCoordinator()
    mocks.emitted.length = 0

    enqueue('fe')
    await flush()
    expect(driveCommands()).toHaveLength(1)

    // 名册不缓存(coordinator 的既有纪律):下一次激活就已经读到新 status。
    mocks.agents.set('fe', { id: 'fe', name: '小李', avatar: '🔧', status: 'retired' })
    mocks.emitted.length = 0
    enqueue('fe')
    await flush()
    expect(driveCommands()).toEqual([])
  })
})

describe('setCollabRoomConfig — retired members', () => {
  it('refuses to pull a retired agent in, and writes nothing', () => {
    seedRoom({ memberAgentIds: ['pm'] })
    expect(coordinator.setCollabRoomConfig(ROOM, { memberAgentIds: ['pm', 'gone'] })).toEqual({
      success: false,
      error: 'Agent is retired: 老王',
    })
    expect(mocks.updateSessionCollab).not.toHaveBeenCalled()
  })

  it('still lets a room that already holds a retired member change its config', () => {
    // 否则一个成员退休就把整间旧房的设置锁死了 —— 而"已在房的 retired 成员留在
    // memberAgentIds"正是本期的数据纪律。
    seedRoom({ memberAgentIds: ['pm', 'gone'] })
    expect(coordinator.setCollabRoomConfig(ROOM, {
      memberAgentIds: ['pm', 'gone', 'fe'],
    })).toEqual({ success: true })
    expect((mocks.sessions.get(ROOM) as FakeSession).room?.memberAgentIds)
      .toEqual(['pm', 'gone', 'fe'])
  })

  it('refuses a retired PM candidate by way of the roster it must belong to', () => {
    seedRoom({ memberAgentIds: ['pm'] })
    expect(coordinator.setCollabRoomConfig(ROOM, { pmAgentId: 'gone' }).error)
      .toBe('PM must be a room member')
  })
})
