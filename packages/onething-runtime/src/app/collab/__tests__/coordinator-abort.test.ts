/**
 * R0 — abort 语义收敛 (docs/design/collab-repair-roadmap-2026-07-28.md).
 *
 * W18 moved the room turn into the agent's execution session and left every
 * "stop" behind, still pointing at the room session where no stream has lived
 * since. Two holes came out of that, and both are only visible from the app
 * layer (the pure logic never knew which session carries a stream):
 *
 *  - P0-1 总闸失灵: freezing aborted the ROOM session — a no-op — while the
 *    turn kept streaming, so the brake stopped nothing the user could see.
 *  - P0-2 超时留僵尸: `waitForRoomTurn` giving up left the request running,
 *    burning full-context round-trips for up to ten minutes against a turn
 *    nobody was listening to (worker.ts fixed the same hole on the work path).
 *
 * Plus P2-1: activations discarded by the freeze stayed 'queued' in the durable
 * record, so boot reconciliation put them back — the room resumed a
 * conversation the user had explicitly stopped.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeMessage {
  id: string
  role: string
  content: string
  agentId?: string
  source?: string
  timestamp: number
  mentions?: Array<{ agentId: string; label: string }>
  replyTo?: { messageId: string; authorLabel: string; excerpt: string }
}

interface FakeSession {
  id: string
  name: string
  kind?: string
  agentId?: string
  isArchived?: boolean
  permissionMode?: string
  collab?: { roomSessionId?: string }
  room?: {
    memberAgentIds: string[]
    pmAgentId?: string
    frozen?: boolean
    budgets?: { maxConcurrentTurns?: number }
  }
  messages: FakeMessage[]
}

interface StateRecord {
  id: string
  agentId: string
  stage: string
  sourceMessageId?: string
}

const AGENTS: Record<string, { id: string; name: string }> = {
  pm: { id: 'pm', name: '阿明' },
  fe: { id: 'fe', name: '小李' },
}

const mocks = vi.hoisted(() => ({
  sessions: new Map<string, unknown>(),
  emitted: [] as Array<{ sessionId: string; event: Record<string, unknown> }>,
  anyListeners: [] as Array<{ sessionId: string; handler: (envelope: unknown) => void }>,
  typeListeners: [] as Array<{ type: string; handler: (envelope: unknown) => void }>,
  /** Every session id the engine was asked to abort, in order. */
  aborted: [] as string[],
  /** The last state.json written — the durable record under test. */
  stateFile: null as unknown,
  /** Called for every drive; the default engine never answers. */
  driveHandler: null as null | ((sessionId: string) => void),
  frozenWorkRooms: [] as string[],
}))

vi.mock('@onething/core/storage', () => ({
  // One room per test, so one state file is enough to model the disk.
  readJsonFile: <T>(_path: string, fallback: T) => (mocks.stateFile as T) ?? fallback,
  writeJsonFile: (_path: string, data: unknown) => {
    mocks.stateFile = JSON.parse(JSON.stringify(data))
  },
}))

vi.mock('../../stores/paths.js', () => ({ getStorePath: () => '/tmp/onething-collab-abort-test' }))

vi.mock('../../usage/index.js', () => ({
  getUsageLedger: () => ({ readRecordsInRange: async () => [] }),
}))

vi.mock('../../store.js', () => ({
  // drive 现在要渲染用户署名(v3 V1),因此读一次设置里的身份。
  getSettings: () => ({}),
  updateSessionWorkingDirectory: vi.fn(),
  // P2-10: the coordinator registers a room-disposal listener at startup.
  onSessionsDeleted: () => () => {},
  getSession: (id: string) => mocks.sessions.get(id),
  getSessionsList: () => [...mocks.sessions.values()],
  addMessage: (sessionId: string, message: FakeMessage) => {
    (mocks.sessions.get(sessionId) as FakeSession | undefined)?.messages.push(message)
  },
  updateMessageReplyTo: () => true,
  updateMessageMentions: () => true,
  createSession: (id: string, name: string) => {
    const session: FakeSession = { id, name, messages: [] }
    mocks.sessions.set(id, session)
    return session
  },
  createSessionWithoutFocus: (id: string, name: string) => {
    const session: FakeSession = { id, name, messages: [] }
    mocks.sessions.set(id, session)
    return session
  },
  getCurrentSessionId: () => undefined,
  setCurrentSessionId: vi.fn(),
  updateSessionArchived: (id: string, archived: boolean) => {
    const session = mocks.sessions.get(id) as FakeSession | undefined
    if (session) session.isArchived = archived
  },
  updateSessionAgent: (id: string, agentId: string) => {
    const session = mocks.sessions.get(id) as FakeSession | undefined
    if (!session) return false
    session.agentId = agentId
    return true
  },
  updateSessionCollab: (
    id: string,
    fields: {
      kind?: string | null
      collab?: { roomSessionId?: string } | null
      room?: FakeSession['room']
    },
  ) => {
    const session = mocks.sessions.get(id) as FakeSession | undefined
    if (!session) return false
    if (fields.kind !== undefined) session.kind = fields.kind ?? undefined
    if (fields.collab !== undefined) session.collab = fields.collab ?? undefined
    if (fields.room !== undefined) session.room = fields.room
    return true
  },
  updateSessionPermissionMode: vi.fn(() => true),
  renameSession: vi.fn(),
}))

vi.mock('../../events/index.js', () => ({
  getEventBus: () => ({
    emit: async (sessionId: string, event: Record<string, unknown>) => {
      mocks.emitted.push({ sessionId, event })
      for (const entry of [...mocks.anyListeners]) {
        if (entry.sessionId === sessionId) entry.handler({ sessionId, event })
      }
      for (const entry of [...mocks.typeListeners]) {
        if (entry.type === event.type) entry.handler({ sessionId, event })
      }
      if (event.type === 'command:send-message') mocks.driveHandler?.(sessionId)
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
    abort: (sessionId: string) => { mocks.aborted.push(sessionId) },
  }),
}))

vi.mock('../../agents/index.js', () => ({ findAgent: (id: string) => AGENTS[id] ?? null }))

vi.mock('../board-store.js', () => ({
  forgetCollabBoardRoom: () => {},
  loadCollabBoard: () => ({ version: 1, tasks: [] }),
  shutdownCollabBoardBroadcasts: () => {},
}))

vi.mock('../willingness-runner.js', () => ({ judgeWillingness: async () => [] }))

vi.mock('../worker.js', () => ({
  forgetCollabRoomWork: () => {},
  initializeCollabWorkers: () => {},
  shutdownCollabWorkers: () => {},
  freezeRoomWork: (roomSessionId: string) => { mocks.frozenWorkRooms.push(roomSessionId) },
  resumeRoomWork: () => {},
  reconcileRoomBoard: () => {},
}))

const coordinator = await import('../coordinator.js')

const ROOM = 'room-1'
/** W18: 小李's execution session — where its turns actually run. */
const AGENT_SESSION = 'agent-exec-fe-room-1'
let nextId = 0

function room(): FakeSession {
  return mocks.sessions.get(ROOM) as FakeSession
}

function push(message: Omit<FakeMessage, 'id' | 'timestamp'> & { id?: string }): FakeMessage {
  const full: FakeMessage = { id: message.id ?? `m-${++nextId}`, timestamp: Date.now(), ...message }
  room().messages.push(full)
  return full
}

function drives(): Array<{ sessionId: string; event: Record<string, unknown> }> {
  return mocks.emitted.filter(entry => entry.event.type === 'command:send-message')
}

function persistedRecords(): StateRecord[] {
  return ((mocks.stateFile as { activations?: StateRecord[] } | null)?.activations ?? [])
}

async function flush(): Promise<void> {
  for (let round = 0; round < 8; round++) {
    for (let index = 0; index < 20; index++) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

/** Deliver a user message the way the ingress gate does. */
async function sendUserMessage(content: string): Promise<FakeMessage> {
  const message = push({ role: 'user', content })
  deliver(message)
  await flush()
  return message
}

function deliver(message: FakeMessage): void {
  for (const entry of [...mocks.typeListeners]) {
    if (entry.type === 'message:user-created') entry.handler({ sessionId: ROOM, event: { message } })
  }
}

function seedRoom(): void {
  mocks.sessions.set(ROOM, {
    id: ROOM,
    name: '官网改版组',
    kind: 'room',
    room: { memberAgentIds: ['pm', 'fe'], pmAgentId: 'pm' },
    messages: [],
  } satisfies FakeSession)
}

beforeEach(() => {
  coordinator.shutdownCollabCoordinator()
  mocks.sessions.clear()
  mocks.emitted.length = 0
  mocks.anyListeners = []
  mocks.typeListeners = []
  mocks.aborted.length = 0
  mocks.frozenWorkRooms.length = 0
  mocks.stateFile = null
  // The engine that never answers: every test here is about a turn that is
  // still in flight when something tries to stop it.
  mocks.driveHandler = () => {}
  seedRoom()
  coordinator.initializeCollabCoordinator()
})

describe('R0 — 总闸打在回合真正所在的会话上', () => {
  it('aborts the execution session carrying the turn, not just the room', async () => {
    await sendUserMessage('@小李 登录页什么时候能好?')
    expect(drives()).toHaveLength(1)
    expect(drives()[0].sessionId).toBe(AGENT_SESSION)
    expect(mocks.aborted).toHaveLength(0)

    expect(coordinator.setCollabRoomFrozen(ROOM, true)).toBe(true)

    // The whole point: the room session alone was the pre-W18 target and by
    // itself stops nothing.
    expect(mocks.aborted).toContain(AGENT_SESSION)
    expect(mocks.aborted).toContain(ROOM)
    // …and the work streams are still the worker's job, composed by the caller.
    expect(mocks.frozenWorkRooms).toEqual([ROOM])
  })

  it('abortRoomTurn is a no-op door when no turn is in flight', () => {
    coordinator.abortRoomTurn(ROOM)
    // Only the pre-W18 fallback — nothing claims a live execution session.
    expect(mocks.aborted).toEqual([ROOM])
  })

  it('stops pointing at an execution session once the turn released it', async () => {
    await sendUserMessage('@小李 登录页什么时候能好?')
    // The turn ends cleanly; the finally clears the pointer.
    for (const entry of [...mocks.anyListeners]) {
      if (entry.sessionId === AGENT_SESSION) {
        entry.handler({ sessionId: AGENT_SESSION, event: { type: 'stream:start' } })
        entry.handler({ sessionId: AGENT_SESSION, event: { type: 'stream:complete' } })
      }
    }
    await flush()

    mocks.aborted.length = 0
    coordinator.abortRoomTurn(ROOM)
    expect(mocks.aborted).toEqual([ROOM])
  })
})

describe('R0 — 回合超时不留僵尸流', () => {
  it('aborts the execution session when the turn never starts', async () => {
    vi.useFakeTimers()
    try {
      const message = push({ role: 'user', content: '@小李 在吗?' })
      deliver(message)
      // Past TURN_START_TIMEOUT_MS (20s) — the wait gives up, the request does not.
      await vi.advanceTimersByTimeAsync(25_000)

      expect(mocks.aborted).toContain(AGENT_SESSION)
    } finally {
      vi.useRealTimers()
    }
  })

  it('says so in the room — a timed-out turn is not a silent one', async () => {
    vi.useFakeTimers()
    try {
      const message = push({ role: 'user', content: '@小李 在吗?' })
      deliver(message)
      await vi.advanceTimersByTimeAsync(25_000)

      const systemLines = room().messages.filter(entry => entry.role === 'system')
      expect(systemLines.some(entry => entry.content.includes('响应超时'))).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('R0 — 冻结丢弃的激活不复活 (P2-1)', () => {
  it('retires discarded activations in the durable record', async () => {
    // 并行化之后"排队"只在同时发言上限之下才发生,所以这条把房间的上限调到 1:
    // 两个人被点名,一个开跑(并挂住),另一个留在队里 —— 这正是本例要的形状。
    const session = room()
    session.room = { ...session.room!, budgets: { maxConcurrentTurns: 1 } }
    await sendUserMessage('@小李 @阿明 一起看下这个')
    expect(persistedRecords().length).toBeGreaterThanOrEqual(2)
    expect(persistedRecords().some(record => record.stage === 'queued')).toBe(true)

    coordinator.setCollabRoomFrozen(ROOM, true)

    expect(persistedRecords().some(record => record.stage === 'queued')).toBe(false)
  })

  it('a restart after freeze/unfreeze does not resume the stopped conversation', async () => {
    const message = await sendUserMessage('@小李 @阿明 一起看下这个')
    coordinator.setCollabRoomFrozen(ROOM, true)
    // The user lets the room run again — the stopped activations must stay dead.
    coordinator.setCollabRoomFrozen(ROOM, false)

    // Restart: fresh process, same disk (mocks.stateFile survives), same room.
    coordinator.shutdownCollabCoordinator()
    mocks.emitted.length = 0
    coordinator.initializeCollabCoordinator()
    await flush()

    expect(drives()).toHaveLength(0)
    // The message that started it is accounted for — the records still name it,
    // which is what keeps boot reconciliation from re-deciding it either.
    expect(persistedRecords().some(record => record.sourceMessageId === message.id)).toBe(true)
  })
})
