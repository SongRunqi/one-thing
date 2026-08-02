/**
 * R2 不变量 — the four things the 1538-line coordinator left to human vigilance
 * (docs/design/collab-repair-roadmap-2026-07-28.md).
 *
 *  - P2-2 watermark 单调: two concurrent user messages can finish out of order,
 *    and the older one used to write its position over the newer one's.
 *  - P2-3 静默回合的锚: a silent turn anchored the watermark on its own turn
 *    record, which since W18 lives in ANOTHER session — an id the room does not
 *    contain, whose timestamp fallback then retires everything older.
 *  - P2-4 预算恢复: 「明天自动恢复」 was a sentence nothing implemented.
 *  - P2-6 定时器登记册: a 60s requeue kick outlived teardown.
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
  isArchived?: boolean
  collab?: { roomSessionId?: string }
  room?: {
    memberAgentIds: string[]
    pmAgentId?: string
    frozen?: boolean
    budgets?: { dailyCostUSD?: number; maxChain?: number }
  }
  messages: FakeMessage[]
}

interface TurnScript {
  thinking?: string
  says?: string[]
}

const AGENTS: Record<string, { id: string; name: string }> = {
  pm: { id: 'pm', name: '阿明' },
  fe: { id: 'fe', name: '小李' },
}

interface WorkerHostLike {
  enqueueRoomActivation(
    roomSessionId: string,
    agentId: string,
    reason: 'task-event',
    driveLabel?: string,
  ): void
}

const mocks = vi.hoisted(() => ({
  sessions: new Map<string, unknown>(),
  emitted: [] as Array<{ sessionId: string; event: Record<string, unknown> }>,
  anyListeners: [] as Array<{ sessionId: string; handler: (envelope: unknown) => void }>,
  typeListeners: [] as Array<{ type: string; handler: (envelope: unknown) => void }>,
  stateFile: null as unknown,
  scripts: [] as Array<Record<string, unknown>>,
  ledger: [] as Array<{ sessionId: string; costUSD: number }>,
  workerHost: null as WorkerHostLike | null,
  driveHandler: null as null | ((sessionId: string) => void),
}))

vi.mock('@onething/core/storage', () => ({
  readJsonFile: <T>(_path: string, fallback: T) => (mocks.stateFile as T) ?? fallback,
  writeJsonFile: (_path: string, data: unknown) => {
    mocks.stateFile = JSON.parse(JSON.stringify(data))
  },
}))

vi.mock('../../stores/paths.js', () => ({ getStorePath: () => '/tmp/onething-collab-invariants' }))

vi.mock('../../usage/index.js', () => ({
  getUsageLedger: () => ({ readRecordsInRange: async () => mocks.ledger }),
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
    fields: { kind?: string | null; collab?: { roomSessionId?: string } | null; room?: FakeSession['room'] },
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
    abort: vi.fn(),
  }),
}))

vi.mock('../../agents/index.js', () => ({ findAgent: (id: string) => AGENTS[id] ?? null }))

vi.mock('../board-store.js', () => ({
  forgetCollabBoardRoom: () => {},
  loadCollabBoard: () => ({ version: 1, tasks: [] }),
  shutdownCollabBoardBroadcasts: () => {},
  getCollabSelfTaskFacts: () => [],
}))

vi.mock('../willingness-runner.js', () => ({ judgeWillingness: async () => [] }))

vi.mock('../worker.js', () => ({
  forgetCollabRoomWork: () => {},
  initializeCollabWorkers: (host: WorkerHostLike) => { mocks.workerHost = host },
  shutdownCollabWorkers: () => {},
  freezeRoomWork: () => {},
  resumeRoomWork: () => {},
  reconcileRoomBoard: () => {},
}))

const coordinator = await import('../coordinator.js')
const roomRuntimeModule = await import('../room-runtime.js')

const ROOM = 'room-1'
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

function pushInto(sessionId: string, message: Omit<FakeMessage, 'id' | 'timestamp'>): FakeMessage {
  const full: FakeMessage = { id: `m-${++nextId}`, timestamp: Date.now(), ...message }
  ;(mocks.sessions.get(sessionId) as FakeSession).messages.push(full)
  return full
}

function drives(): Array<{ sessionId: string; event: Record<string, unknown> }> {
  return mocks.emitted.filter(entry => entry.event.type === 'command:send-message')
}

function persisted(): { lastProcessedMessageId?: string; lastProcessedAt?: number } {
  return (mocks.stateFile as { lastProcessedMessageId?: string; lastProcessedAt?: number } | null) ?? {}
}

/** One scripted turn per drive; the terminal fires on a macrotask. */
function bindFakeEngine(): void {
  mocks.driveHandler = (sessionId: string) => {
    const turn = mocks.scripts.shift() as TurnScript | undefined
    setTimeout(() => {
      if (turn?.thinking !== undefined) {
        pushInto(sessionId, {
          role: 'assistant',
          agentId: 'fe',
          content: turn.thinking,
          source: 'collab-turn',
        })
      }
      for (const say of turn?.says ?? []) {
        push({ role: 'assistant', agentId: 'fe', content: say, source: 'collab-say' })
      }
      emitRaw(sessionId, { type: 'stream:start' })
      emitRaw(sessionId, { type: 'stream:complete' })
    }, 0)
  }
}

function emitRaw(sessionId: string, event: Record<string, unknown>): void {
  for (const entry of [...mocks.anyListeners]) {
    if (entry.sessionId === sessionId) entry.handler({ sessionId, event })
  }
}

async function flush(): Promise<void> {
  for (let round = 0; round < 8; round++) {
    for (let index = 0; index < 20; index++) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

function deliver(message: FakeMessage): void {
  for (const entry of [...mocks.typeListeners]) {
    if (entry.type === 'message:user-created') entry.handler({ sessionId: ROOM, event: { message } })
  }
}

async function sendUserMessage(content: string): Promise<FakeMessage> {
  const message = push({ role: 'user', content })
  deliver(message)
  await flush()
  return message
}

beforeEach(() => {
  coordinator.shutdownCollabCoordinator()
  mocks.sessions.clear()
  mocks.emitted.length = 0
  mocks.anyListeners = []
  mocks.typeListeners = []
  mocks.scripts = []
  mocks.ledger = []
  mocks.stateFile = null
  mocks.workerHost = null
  mocks.driveHandler = null
  mocks.sessions.set(ROOM, {
    id: ROOM,
    name: '官网改版组',
    kind: 'room',
    room: { memberAgentIds: ['pm', 'fe'], pmAgentId: 'pm' },
    messages: [],
  } satisfies FakeSession)
  coordinator.initializeCollabCoordinator()
  bindFakeEngine()
})

describe('R2 — watermark 单调 (P2-2)', () => {
  it('refuses to walk backwards', () => {
    const runtime = roomRuntimeModule.roomRuntime('watermark-room')
    roomRuntimeModule.advanceWatermark(runtime, { id: 'later', timestamp: 200 })
    roomRuntimeModule.advanceWatermark(runtime, { id: 'earlier', timestamp: 100 })

    expect(runtime.state.lastProcessedMessageId).toBe('later')
    expect(runtime.state.lastProcessedAt).toBe(200)
  })

  it('still accepts the same instant and anything after it', () => {
    const runtime = roomRuntimeModule.roomRuntime('watermark-room-2')
    roomRuntimeModule.advanceWatermark(runtime, { id: 'a', timestamp: 100 })
    roomRuntimeModule.advanceWatermark(runtime, { id: 'b', timestamp: 100 })
    expect(runtime.state.lastProcessedMessageId).toBe('b')

    roomRuntimeModule.advanceWatermark(runtime, { id: 'c', timestamp: 101 })
    expect(runtime.state.lastProcessedMessageId).toBe('c')
  })
})

describe('R2 — 静默回合的锚 (P2-3)', () => {
  it('does not anchor a task-event turn on a record that lives in another session', async () => {
    // A task-event activation has no room message behind it, by construction.
    mocks.scripts = [{ thinking: '看了一眼,没什么要说的' }]
    mocks.workerHost?.enqueueRoomActivation(ROOM, 'fe', 'task-event')
    await flush()

    expect(drives().length).toBeGreaterThan(0)
    expect(drives()[0].sessionId).toBe(AGENT_SESSION)
    expect(room().messages.some(entry => entry.source === 'collab-say')).toBe(false)
    // The turn record is in the EXECUTION session. Anchoring on it produced a
    // watermark the room could never resolve, whose timestamp fallback then
    // retired every earlier room message.
    expect(persisted().lastProcessedMessageId).toBeUndefined()
  })

  it('still anchors a silent MENTION turn on the room message it consumed', async () => {
    mocks.scripts = [{ thinking: '这轮没我的事' }]
    const message = await sendUserMessage('@小李 看一眼这个')

    expect(persisted().lastProcessedMessageId).toBe(message.id)
  })
})

/**
 * todo2 P0-2 顺手加固 — 入队处的去重.
 *
 * (agent, 触发消息, 理由) 相同的第二次入队没有新信息,只会让同一个 agent 对着
 * 同一条消息再说一遍话,代价是一次全上下文模型调用。
 */
describe('R2 — 同一条消息不把同一个人排两次队', () => {
  it('ignores a repeated activation for the same message, agent and reason', async () => {
    mocks.scripts = [{ thinking: '看到了', says: ['明天下班前'] }, { thinking: '第二轮不该存在' }]
    // 同一条消息被投递两次(总线重放 / 上游重复调用):第一次的记录还在队首跑着。
    const message = push({ role: 'user', content: '@小李 登录页什么时候能好?' })
    deliver(message)
    deliver(message)
    await flush()

    expect(drives()).toHaveLength(1)
    expect(room().messages.filter(entry => entry.source === 'collab-say')).toHaveLength(1)
  })

  it('still queues task events separately — they carry no room message to compare', async () => {
    // 两张不同的卡落在同一个 agent 头上是两件事;task-event 按构造没有
    // sourceMessageId,所以去重必须在这里让路。
    mocks.scripts = [
      { thinking: '第一件', says: ['卡一收到'] },
      { thinking: '第二件', says: ['卡二收到'] },
    ]
    mocks.workerHost?.enqueueRoomActivation(ROOM, 'fe', 'task-event')
    mocks.workerHost?.enqueueRoomActivation(ROOM, 'fe', 'task-event')
    await flush()

    expect(drives()).toHaveLength(2)
  })
})

describe('R2 — 预算闸的自动恢复 (P2-4) 与定时器登记册 (P2-6)', () => {
  function setBudget(dailyCostUSD: number): void {
    const session = room()
    session.room = { ...session.room!, budgets: { dailyCostUSD } }
  }

  it('parks the activation and resumes it when the day rolls over', async () => {
    vi.useFakeTimers()
    try {
      setBudget(1)
      mocks.ledger = [{ sessionId: ROOM, costUSD: 5 }]
      mocks.scripts = [{ thinking: '来了', says: ['来了'] }]

      const message = push({ role: 'user', content: '@小李 在吗?' })
      deliver(message)
      await vi.advanceTimersByTimeAsync(100)

      // Over budget: nothing was driven, and the room was told why.
      expect(drives()).toHaveLength(0)
      expect(room().messages.some(entry => entry.content.includes('日预算'))).toBe(true)

      // Tomorrow, with the ledger reset — the kick the notice promised.
      mocks.ledger = []
      await vi.advanceTimersByTimeAsync(25 * 60 * 60_000)

      expect(drives()).toHaveLength(1)
      expect(drives()[0].sessionId).toBe(AGENT_SESSION)
    } finally {
      vi.useRealTimers()
    }
  })

  it('arms exactly one kick however many activations pile up behind the gate', async () => {
    vi.useFakeTimers()
    try {
      setBudget(1)
      mocks.ledger = [{ sessionId: ROOM, costUSD: 5 }]
      mocks.scripts = [{ thinking: 'a' }, { thinking: 'b' }]

      const message = push({ role: 'user', content: '@小李 @阿明 都看看' })
      deliver(message)
      await vi.advanceTimersByTimeAsync(100)
      expect(drives()).toHaveLength(0)

      mocks.ledger = []
      await vi.advanceTimersByTimeAsync(25 * 60 * 60_000)
      // One kick, one queue pass — which then drains both parked records.
      expect(drives().length).toBeGreaterThan(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves nothing armed after shutdown', async () => {
    vi.useFakeTimers()
    try {
      setBudget(1)
      mocks.ledger = [{ sessionId: ROOM, costUSD: 5 }]
      const message = push({ role: 'user', content: '@小李 在吗?' })
      deliver(message)
      await vi.advanceTimersByTimeAsync(100)
      expect(drives()).toHaveLength(0)

      coordinator.shutdownCollabCoordinator()
      mocks.ledger = []
      mocks.emitted.length = 0
      await vi.advanceTimersByTimeAsync(25 * 60 * 60_000)

      // The kick would have driven into a coordinator whose subscriptions and
      // room runtimes are gone.
      expect(drives()).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
