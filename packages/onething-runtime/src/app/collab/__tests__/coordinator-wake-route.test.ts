/**
 * 中途来消息的路由(docs/design/qm-collab-learnings.md §1.3 / P1-6)。
 *
 * 在这之前,房间里"有人正在说话时用户又说了一句"只有一种走法:排队。第二条要等
 * 第一条的全部激活跑完,而用户看到的是房间卡住 —— 而真实 IM 里连发两条(一句
 * 问题 + 一句补充)是最普通的行为,对方是读完两条再回。
 *
 * 这里钉住那张表在**装配层**的四个出口:steer 并进当前回合、abort 清场、
 * engage 另起一轮、以及 steer 迟到时退回 engage 的兜底。纯规则本身在
 * `collab/__tests__/wake.test.ts`。
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

interface StateRecord {
  id: string
  agentId: string
  stage: string
  epoch?: number
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

vi.mock('../../stores/paths.js', () => ({ getStorePath: () => '/tmp/onething-collab-wake-test' }))

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
const { roomRuntime, currentFloorEpoch } = await import('../room-runtime.js')

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

function persistedRecords(): StateRecord[] {
  return ((mocks.stateFile as { activations?: StateRecord[] } | null)?.activations ?? [])
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

describe('steer —— 连发两条不打断,并进当前回合', () => {
  it('第二条注入正在跑的执行会话,不另起一轮、不另买判定', async () => {
    await sendUserMessage('@小李 登录页什么时候能好?', [{ agentId: 'fe', label: '小李' }])
    expect(drives()).toHaveLength(1)
    expect(drives()[0].sessionId).toBe(FE_SESSION)
    mocks.judged.length = 0

    const second = push({ role: 'user', content: '对了,顺便看下注册页' })
    deliver(second)
    await flush()
    // 注入已经发出,回合边界读到它。
    expect(mocks.steered).toHaveLength(1)
    expect(mocks.steered[0].sessionId).toBe(FE_SESSION)
    emitOn(FE_SESSION, { type: 'steering:consumed', messageIds: ['s-1'] })
    await flush()

    // 没有第二个 drive —— 这正是"不打断也不排队"。
    expect(drives()).toHaveLength(1)
    // 也没有为这条消息买意愿判定。
    expect(mocks.judged).toHaveLength(0)
  })

  it('注入的正文裹房间同一套 `<message from>` 信封,署名带句柄', async () => {
    await sendUserMessage('@小李 登录页什么时候能好?', [{ agentId: 'fe', label: '小李' }])
    deliver(push({ role: 'user', content: '顺便看下注册页' }))
    await flush()
    emitOn(FE_SESSION, { type: 'steering:consumed', messageIds: ['s-1'] })
    await flush()

    expect(mocks.steered[0].content).toContain('<message from="一天#yt"')
    expect(mocks.steered[0].content).toContain('顺便看下注册页')
    // 来源不能是 'collab' —— 那个标记会让它在下一轮被读成"本轮驱动"。
    expect(mocks.steered[0].source).not.toBe('collab')
  })

  it('@ 的正是正在说话的那位:仍然并进去', async () => {
    await sendUserMessage('@小李 登录页什么时候能好?', [{ agentId: 'fe', label: '小李' }])
    deliver(push({ role: 'user', content: '@小李 再补一句', mentions: [{ agentId: 'fe', label: '小李' }] }))
    await flush()

    expect(mocks.steered).toHaveLength(1)
    expect(drives()).toHaveLength(1)
  })
})

describe('steer 迟到 —— 退回另起一轮', () => {
  it('回合先结束、注入没人消费:撤回它,并照常决策这条消息', async () => {
    mocks.steerQueuedId = 'steer-msg-1'
    await sendUserMessage('@小李 登录页什么时候能好?', [{ agentId: 'fe', label: '小李' }])

    deliver(push({
      role: 'user',
      content: '@阿明 你也看下',
      // 只 @ 了别人会走 engage,这里要测的是 steer 的兜底,所以点的是在说话的那位。
      mentions: [{ agentId: 'fe', label: '小李' }],
    }))
    await flush()
    expect(mocks.steered).toHaveLength(1)

    // 回合就这么结束了 —— 那条注入永远不会被 drain。
    emitOn(FE_SESSION, { type: 'stream:complete' })
    await flush()

    // 撤回,免得它在这个 agent 下次被驱动时以错位的时序冒出来。
    expect(mocks.retracted).toEqual([{ sessionId: FE_SESSION, messageId: 'steer-msg-1' }])
    // 并且退回 engage:这条消息重新走了决策路径。
    expect(drives().length).toBeGreaterThan(1)
  })
})

describe('engage —— @ 了别人必须另起一轮', () => {
  it('正在说话的那位不替被点名的人回答', async () => {
    await sendUserMessage('@小李 登录页什么时候能好?', [{ agentId: 'fe', label: '小李' }])
    expect(drives()).toHaveLength(1)

    deliver(push({ role: 'user', content: '@阿明 你怎么看', mentions: [{ agentId: 'pm', label: '阿明' }] }))
    await flush()

    // 没有走注入,而是排了一条新的激活。
    expect(mocks.steered).toHaveLength(0)
    expect(persistedRecords().some(record => record.agentId === 'pm')).toBe(true)
  })
})

describe('并行 —— 一间房同时可以有多个人在说', () => {
  it('两个人同时被点名:两条回合同时起跑,不再一个等一个', async () => {
    await sendUserMessage('@小李 @阿明 一起看下这个', [
      { agentId: 'fe', label: '小李' },
      { agentId: 'pm', label: '阿明' },
    ])

    // 串行时代这里只有 1 —— 第二条要等第一条整轮跑完(20–40 秒)才发得出去。
    expect(drives()).toHaveLength(2)
    expect(new Set(drives().map(entry => entry.sessionId))).toEqual(
      new Set([FE_SESSION, 'agent-exec-pm-room-1']),
    )
    // 队列已经空了:两条都在飞,没有谁在排队。
    expect(persistedRecords().some(record => record.stage === 'queued')).toBe(false)
  })

  it('同一个人被点名两次:第二条排队,不并行说两句', async () => {
    await sendUserMessage('@小李 第一个问题', [{ agentId: 'fe', label: '小李' }])
    expect(drives()).toHaveLength(1)

    // 第二条消息也只点它 —— 它正在说话,所以走的是 steer 而不是新回合;这里要的是
    // 「同一个人不并行」,所以直接从入队那一侧构造。
    const runtime = roomRuntime(ROOM)
    enqueue(ROOM, runtime, [{ agentId: 'fe', reason: 'mention' }], 'm-second')
    await flush()

    // 还是一条 drive:小李已经在说,第二条留在队里等它。
    expect(drives()).toHaveLength(1)
    expect(runtime.queue.some(record => record.agentId === 'fe')).toBe(true)
  })

  it('上限=1 时退回串行(房间可调)', async () => {
    const session = room()
    session.room = { ...session.room!, budgets: { maxConcurrentTurns: 1 } }
    await sendUserMessage('@小李 @阿明 一起看下这个', [
      { agentId: 'fe', label: '小李' },
      { agentId: 'pm', label: '阿明' },
    ])

    expect(drives()).toHaveLength(1)
    expect(persistedRecords().some(record => record.stage === 'queued')).toBe(true)
  })
})

describe('链闸解冻 —— 唯一真源是这条人类消息本身', () => {
  it('真实消息清零链闸(steer 分支也不例外 —— 注入的就是它)', async () => {
    await sendUserMessage('@小李 登录页什么时候能好?', [{ agentId: 'fe', label: '小李' }])
    const runtime = roomRuntime(ROOM)
    runtime.state.chainCount = 7

    deliver(push({ role: 'user', content: '顺便看下注册页' }))
    await flush()
    emitOn(FE_SESSION, { type: 'steering:consumed', messageIds: ['s-1'] })
    await flush()

    expect(runtime.state.chainCount).toBe(0)
  })

  it('空白消息不解冻 —— 它没带来任何新信息', async () => {
    await sendUserMessage('@小李 登录页什么时候能好?', [{ agentId: 'fe', label: '小李' }])
    const runtime = roomRuntime(ROOM)
    runtime.state.chainCount = 7

    deliver(push({ role: 'user', content: '   ' }))
    await flush()

    expect(runtime.state.chainCount).toBe(7)
    expect(mocks.steered).toHaveLength(0)
  })
})

describe('abort —— 裸「停」清场', () => {
  it('中止在跑的回合,并作废还在队里的对话性激活', async () => {
    // 上限调到 1:一个开跑并挂住,另一个留在队里 —— 喊停要同时管住这两种。
    const session = room()
    session.room = { ...session.room!, budgets: { maxConcurrentTurns: 1 } }
    await sendUserMessage('@小李 @阿明 一起看下这个', [
      { agentId: 'fe', label: '小李' },
      { agentId: 'pm', label: '阿明' },
    ])
    expect(persistedRecords().some(record => record.stage === 'queued')).toBe(true)

    await sendUserMessage('停')

    expect(mocks.aborted).toContain(FE_SESSION)
    expect(persistedRecords().some(record => record.stage === 'queued')).toBe(false)
    expect(persistedRecords().some(record => record.stage === 'superseded')).toBe(true)
    // 喊停不是一次发言:它自己不激活任何人。
    expect(mocks.steered).toHaveLength(0)
  })

  it('带内容的「先停一下,我们换个方向」不是喊停 —— 它被读进当前回合', async () => {
    await sendUserMessage('@小李 登录页什么时候能好?', [{ agentId: 'fe', label: '小李' }])
    mocks.aborted.length = 0

    deliver(push({ role: 'user', content: '先停一下,我们换个方向' }))
    await flush()

    expect(mocks.aborted).toHaveLength(0)
    expect(mocks.steered).toHaveLength(1)
  })

  it('任务事件激活豁免 —— 停对话不是停干活', async () => {
    const runtime = roomRuntime(ROOM)
    enqueue(ROOM, runtime, [{ agentId: 'pm', reason: 'task-event' }], undefined, {
      conversational: false,
    })
    enqueue(ROOM, runtime, [{ agentId: 'fe', reason: 'self-elected' }], 'm-x')
    await flush()

    const before = currentFloorEpoch(runtime)
    await sendUserMessage('停')
    expect(currentFloorEpoch(runtime)).toBe(before + 1)

    const task = persistedRecords().find(record => record.agentId === 'pm')
    expect(task?.epoch).toBeUndefined()
    expect(task?.stage).not.toBe('superseded')
  })
})
