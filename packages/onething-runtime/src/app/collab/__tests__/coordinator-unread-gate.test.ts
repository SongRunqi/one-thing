/**
 * 未读闸与按人折叠(docs/design/collab-agent-view.md P4)。
 *
 * 2026-08-01 事故的直接病根是「一个 @ = 一个必须兑现的回合」:Bram 在四分钟里
 * 排到 4 条激活,连着说了四遍意思相同的话。这里钉住那条换算被拆掉之后的行为:
 *  - 同一个人的多条对话性激活折叠成**一个**回合;
 *  - 一条激活轮到自己时若已无未读,**不花那次全上下文调用**;
 *  - 任务事件豁免 —— 它不是"回答某条消息"。
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
    budgets?: { maxConcurrentTurns?: number }
  }
  messages: FakeMessage[]
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
  aborted: [] as string[],
  stateFile: null as unknown,
  driveHandler: null as null | ((sessionId: string) => void),
  /** Everything injected through the engine's steering door. */
  steered: [] as Array<{ sessionId: string; content: string; source?: string }>,
  retracted: [] as Array<{ sessionId: string; messageId: string }>,
  /** Set by a test to have the engine answer `steering:queued` with an id. */
  steerQueuedId: null as string | null,
  judged: [] as Array<{ roomSessionId: string; candidates: string[] }>,
}))

vi.mock('@onething/core/storage', () => ({
  readJsonFile: <T>(_path: string, fallback: T) => (mocks.stateFile as T) ?? fallback,
  writeJsonFile: (_path: string, data: unknown) => {
    mocks.stateFile = JSON.parse(JSON.stringify(data))
  },
}))

vi.mock('../../stores/paths.js', () => ({ getStorePath: () => '/tmp/onething-collab-unread-test' }))

vi.mock('../../usage/index.js', () => ({
  getUsageLedger: () => ({ readRecordsInRange: async () => [] }),
}))

vi.mock('../../store.js', () => ({
  updateSessionWorkingDirectory: vi.fn(),
  onSessionsDeleted: () => () => {},
  getSession: (id: string) => mocks.sessions.get(id),
  getSessionsList: () => [...mocks.sessions.values()],
  getSettings: () => ({ general: { userProfile: { name: '一天', handle: 'yt' } } }),
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
    abort: (sessionId: string) => {
      mocks.aborted.push(sessionId)
      // 真引擎 abort 一条流会发终结事件,而回合的等待就挂在它上面 —— 不发的话
      // 队列会永远停在被中止的那个队首,后面该被作废的记录一条都轮不到。
      emitOn(sessionId, { type: 'stream:aborted' })
    },
    steerMessage: (sessionId: string, content: string, source?: string) => {
      mocks.steered.push({ sessionId, content, source })
      if (mocks.steerQueuedId) {
        emitOn(sessionId, { type: 'steering:queued', messageId: mocks.steerQueuedId })
      }
    },
    retractSteerMessage: (sessionId: string, messageId: string) => {
      mocks.retracted.push({ sessionId, messageId })
      return true
    },
  }),
}))

vi.mock('../../agents/index.js', () => ({ findAgent: (id: string) => AGENTS[id] ?? null }))

vi.mock('../board-store.js', () => ({
  forgetCollabBoardRoom: () => {},
  loadCollabBoard: () => ({ version: 1, tasks: [] }),
  shutdownCollabBoardBroadcasts: () => {},
  getCollabSelfTaskFacts: () => [],
}))

vi.mock('../willingness-runner.js', () => ({
  judgeWillingness: async (roomSessionId: string, candidates: Array<{ id: string }>) => {
    mocks.judged.push({ roomSessionId, candidates: candidates.map(candidate => candidate.id) })
    return []
  },
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
const { enqueue } = await import('../queue.js')
const { roomRuntime } = await import('../room-runtime.js')

const ROOM = 'room-1'
const FE_SESSION = 'agent-exec-fe-room-1'
let nextId = 0

function room(): FakeSession {
  return mocks.sessions.get(ROOM) as FakeSession
}

/** Deliver an event to whoever subscribed to that session (mirrors the bus). */
function emitOn(sessionId: string, event: Record<string, unknown>): void {
  for (const entry of [...mocks.anyListeners]) {
    if (entry.sessionId === sessionId) entry.handler({ sessionId, event })
  }
}

function push(message: Omit<FakeMessage, 'id' | 'timestamp'> & { id?: string }): FakeMessage {
  const full: FakeMessage = { id: message.id ?? `m-${++nextId}`, timestamp: Date.now(), ...message }
  room().messages.push(full)
  return full
}

function drives(): Array<{ sessionId: string; event: Record<string, unknown> }> {
  return mocks.emitted.filter(entry => entry.event.type === 'command:send-message')
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

async function sendUserMessage(
  content: string,
  mentions?: Array<{ agentId: string; label: string }>,
): Promise<FakeMessage> {
  const message = push({ role: 'user', content, ...(mentions ? { mentions } : {}) })
  deliver(message)
  await flush()
  return message
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
  mocks.steered.length = 0
  mocks.retracted.length = 0
  mocks.judged.length = 0
  mocks.steerQueuedId = null
  mocks.stateFile = null
  // 回合起来了就一直挂着 —— 这里每个测试的前提都是"有人正在说话"。
  mocks.driveHandler = (sessionId: string) => {
    emitOn(sessionId, { type: 'stream:start' })
  }
  seedRoom()
  coordinator.initializeCollabCoordinator()
})


/** 让下一个回合"跑完"——先起流,再发终结事件,收尾才会推进游标。 */
function completeTurns(): void {
  mocks.driveHandler = (sessionId: string) => {
    emitOn(sessionId, { type: 'stream:start' })
    emitOn(sessionId, { type: 'stream:complete' })
  }
}

describe('按人折叠', () => {
  it('连着两条 @ 同一个人 → 一个回合,不是两个', async () => {
    // 第一条把 fe 拉起来;回合挂着不结束,所以第二条只能排队。
    await sendUserMessage('@小李 登录页?', [{ agentId: 'fe', label: '小李' }])
    expect(drives()).toHaveLength(1)

    // 队里已经有 fe 的一条对话性记录时,再来两条 @ 都折进它。
    const runtime = roomRuntime(ROOM)
    enqueue(ROOM, runtime, [{ agentId: 'fe', reason: 'mention' }], 'later-1')
    enqueue(ROOM, runtime, [{ agentId: 'fe', reason: 'self-elected' }], 'later-2')
    await flush()

    const queued = runtime.queue.filter(record => record.agentId === 'fe')
    expect(queued).toHaveLength(1)
    // 锚点前移到最新那条,理由取更强的那个。
    expect(queued[0].sourceMessageId).toBe('later-2')
    expect(queued[0].reason).toBe('mention')
  })

  it('任务事件不参与折叠 —— 两张卡是两件事', async () => {
    // 先占住 fe(回合挂着不结束),这样后面两条都只能留在队里。
    await sendUserMessage('@小李 登录页?', [{ agentId: 'fe', label: '小李' }])
    const runtime = roomRuntime(ROOM)
    enqueue(ROOM, runtime, [{ agentId: 'fe', reason: 'mention' }], 'msg-1')
    enqueue(
      ROOM,
      runtime,
      [{ agentId: 'fe', reason: 'task-event', driveLabel: '任务已指派待开工' }],
      undefined,
      { conversational: false },
    )
    await flush()
    const mine = runtime.queue.filter(record => record.agentId === 'fe')
    expect(mine).toHaveLength(2)
    expect(mine.map(record => record.reason).sort()).toEqual(['mention', 'task-event'])
  })
})

describe('未读闸', () => {
  it('游标已覆盖全部消息时不驱动 —— 省掉那次全上下文调用', async () => {
    completeTurns()
    // 第一轮:游标从无到有,回合跑完推进到当时的房间末条。
    await sendUserMessage('@小李 登录页?', [{ agentId: 'fe', label: '小李' }])
    expect(drives()).toHaveLength(1)
    const cursorAfterFirst = (mocks.sessions.get(FE_SESSION) as FakeSession | undefined)
      ?.collab as { seenMessageId?: string } | undefined
    expect(cursorAfterFirst?.seenMessageId).toBeTruthy()

    // 一条新消息都没有,却又排了一条激活 —— 闸应该在花钱之前吃掉它。
    mocks.emitted.length = 0
    enqueue(ROOM, roomRuntime(ROOM), [{ agentId: 'fe', reason: 'mention' }], 'stale')
    await flush()
    expect(drives()).toHaveLength(0)
  })

  it('有新消息就照常驱动', async () => {
    completeTurns()
    await sendUserMessage('@小李 登录页?', [{ agentId: 'fe', label: '小李' }])
    mocks.emitted.length = 0

    // 别人说了一句 —— fe 没读过。
    push({ role: 'assistant', agentId: 'pm', content: '我补充一句', source: 'collab-say' })
    enqueue(ROOM, roomRuntime(ROOM), [{ agentId: 'fe', reason: 'mention' }], 'fresh')
    await flush()
    expect(drives()).toHaveLength(1)
  })

  it('任务事件豁免 —— 没有未读也照驱', async () => {
    completeTurns()
    await sendUserMessage('@小李 登录页?', [{ agentId: 'fe', label: '小李' }])
    mocks.emitted.length = 0

    enqueue(
      ROOM,
      roomRuntime(ROOM),
      [{ agentId: 'fe', reason: 'task-event', driveLabel: '任务已指派待开工' }],
      undefined,
      { conversational: false },
    )
    await flush()
    expect(drives()).toHaveLength(1)
  })
})
