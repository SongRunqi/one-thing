/**
 * W23 — restart idempotence at the coordinator's boot reconciliation.
 *
 * 真机 (2026-07-28, W17 验收): kill the app right after a task ran, restart, and
 * the same instruction was executed a second time — a duplicate card, a
 * duplicate worker. The dedup that should have stopped it lives in `state.json`
 * activation records, and those are capped at 50 while the watermark does NOT
 * advance for an activation that persisted nothing. A busy room outlives its
 * own proof.
 *
 * What a pure test cannot make: the drive that carries the stamp is a REAL
 * command going through the engine onto the execution session's transcript, and
 * the restart is a real `shutdown` + `initialize` reading state back from
 * (simulated) disk. So this file gives the state file real read/write behaviour
 * and lets boot reconciliation run for its own reasons.
 *
 * The matrix: state hit / transcript hit / both miss / pre-W23 drive.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeMessage {
  id: string
  role: string
  content: string
  agentId?: string
  source?: string
  timestamp: number
  collabSourceMessageId?: string
  origin?: { source?: string }
  toolCalls?: Array<{ toolName?: string; toolId?: string }>
  mentions?: Array<{ agentId: string; label: string }>
  replyTo?: { messageId: string; authorLabel: string; excerpt: string }
}

interface FakeSession {
  id: string
  name: string
  kind?: string
  agentId?: string
  isArchived?: boolean
  collab?: { roomSessionId?: string }
  room?: { memberAgentIds: string[]; pmAgentId?: string; frozen?: boolean }
  messages: FakeMessage[]
}

/** One turn the fake engine plays per drive. Omit everything for the shape that
 *  matters here: a turn that completes having persisted nothing, which is what
 *  leaves the watermark parked behind the user message. */
interface TurnScript {
  thinking?: string
  says?: string[]
}

const AGENTS: Record<string, { id: string; name: string }> = {
  pm: { id: 'pm', name: '阿明' },
  fe: { id: 'fe', name: '小李' },
}

const mocks = vi.hoisted(() => ({
  sessions: new Map<string, unknown>(),
  /** The simulated durable store: path → parsed content. */
  files: new Map<string, unknown>(),
  emitted: [] as Array<{ sessionId: string; event: Record<string, unknown> }>,
  anyListeners: [] as Array<{ sessionId: string; handler: (envelope: unknown) => void }>,
  typeListeners: [] as Array<{ type: string; handler: (envelope: unknown) => void }>,
  scripts: [] as Array<Record<string, unknown>>,
  willing: [] as string[],
  driveHandler: null as null | ((sessionId: string, event: Record<string, unknown>) => void),
  /** The work pipeline's door into the coordinator, captured from initialize. */
  workerHost: null as null | {
    enqueueRoomActivation: (room: string, agentId: string, reason: string, label?: string) => void
  },
}))

vi.mock('@onething/core/storage', () => ({
  // Structural clone on both sides: a real file cannot keep a live reference to
  // the object the coordinator goes on mutating.
  readJsonFile: <T>(filePath: string, fallback: T) => {
    const stored = mocks.files.get(filePath)
    return stored === undefined ? fallback : structuredClone(stored) as T
  },
  writeJsonFile: (filePath: string, data: unknown) => {
    mocks.files.set(filePath, structuredClone(data))
  },
}))

vi.mock('../../stores/paths.js', () => ({ getStorePath: () => '/tmp/onething-collab-w23' }))

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
  updateMessageReplyTo: (sessionId: string, messageId: string, replyTo: FakeMessage['replyTo']) => {
    const session = mocks.sessions.get(sessionId) as FakeSession | undefined
    const message = session?.messages.find(item => item.id === messageId)
    if (!message) return false
    message.replyTo = replyTo
    return true
  },
  updateMessageMentions: (
    sessionId: string,
    messageId: string,
    mentions: FakeMessage['mentions'],
  ) => {
    const session = mocks.sessions.get(sessionId) as FakeSession | undefined
    const message = session?.messages.find(item => item.id === messageId)
    if (!message) return false
    message.mentions = mentions
    return true
  },
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
    fields: { kind?: string | null; collab?: { roomSessionId?: string } | null },
  ) => {
    const session = mocks.sessions.get(id) as FakeSession | undefined
    if (!session) return false
    if (fields.kind !== undefined) session.kind = fields.kind ?? undefined
    if (fields.collab !== undefined) session.collab = fields.collab ?? undefined
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
      if (event.type === 'command:send-message') mocks.driveHandler?.(sessionId, event)
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
}))

vi.mock('../willingness-runner.js', () => ({
  judgeWillingness: async () => {
    const volunteers = mocks.willing.splice(0)
    return volunteers.map(agentId => ({ agentId, respond: true }))
  },
}))

vi.mock('../worker.js', () => ({
  forgetCollabRoomWork: () => {},
  initializeCollabWorkers: (workerHost: never) => { mocks.workerHost = workerHost },
  shutdownCollabWorkers: () => {},
  freezeRoomWork: () => {},
  resumeRoomWork: () => {},
  reconcileRoomBoard: () => {},
}))

const coordinator = await import('../coordinator.js')
/** The retired W14d nudge's wording — asserted absent since 2026-07-30. */
const isNudgeDrive = (content: unknown): boolean => String(content).includes('没有发进群里')

const ROOM = 'room-1'
const FE_SESSION = 'agent-exec-fe-room-1'
const STATE_PATH = `/tmp/onething-collab-w23/collab/${ROOM}/state.json`
let nextId = 0

function room(): FakeSession {
  return mocks.sessions.get(ROOM) as FakeSession
}

function pushInto(
  sessionId: string,
  message: Omit<FakeMessage, 'id' | 'timestamp'> & { id?: string },
): FakeMessage {
  const full: FakeMessage = { id: message.id ?? `m-${++nextId}`, timestamp: Date.now(), ...message }
  ;(mocks.sessions.get(sessionId) as FakeSession).messages.push(full)
  return full
}

function script(...turns: TurnScript[]): void {
  mocks.scripts = turns as unknown as Array<Record<string, unknown>>
}

/**
 * The fake engine. The load-bearing half is the FIRST statement: the core
 * engine persists a drive as a user message and copies the named passthrough
 * onto it, so the transcript grows the very stamp W23 reads back.
 */
function bindFakeEngine(): void {
  mocks.driveHandler = (sessionId: string, event: Record<string, unknown>) => {
    pushInto(sessionId, {
      role: 'user',
      content: String(event.content),
      source: 'collab',
      ...(event.collabSourceMessageId
        ? { collabSourceMessageId: String(event.collabSourceMessageId) }
        : {}),
    })
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
        pushInto(ROOM, { role: 'assistant', agentId: 'fe', content: say, source: 'collab-say' })
      }
      void emitRaw(sessionId, { type: 'stream:start' })
      void emitRaw(sessionId, { type: 'stream:complete' })
    }, 0)
  }
}

function driveEvents(): Array<Record<string, unknown>> {
  return mocks.emitted
    .filter(entry => entry.event.type === 'command:send-message')
    .map(entry => entry.event)
}

async function emitRaw(sessionId: string, event: Record<string, unknown>): Promise<void> {
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

/** Deliver a user message the way the ingress gate does. */
async function sendUserMessage(content: string): Promise<FakeMessage> {
  const message = pushInto(ROOM, { role: 'user', content, source: 'text' })
  for (const entry of [...mocks.typeListeners]) {
    if (entry.type === 'message:user-created') entry.handler({ sessionId: ROOM, event: { message } })
  }
  await flush()
  return message
}

/** Kill and relaunch: in-memory runtime is gone, the files are not. */
async function restart(): Promise<void> {
  coordinator.shutdownCollabCoordinator()
  mocks.emitted.length = 0
  mocks.anyListeners = []
  mocks.typeListeners = []
  coordinator.initializeCollabCoordinator()
  bindFakeEngine()
  await flush()
}

function storedState(): { lastProcessedMessageId?: string; activations: Array<{ sourceMessageId?: string; stage: string }> } {
  return mocks.files.get(STATE_PATH) as never
}

/** The production loss mode: the 50-entry cap evicted the record that named
 *  this message, while the watermark stayed parked behind it. */
function evictActivationRecords(): void {
  const state = storedState()
  state.activations = []
  mocks.files.set(STATE_PATH, structuredClone(state))
}

beforeEach(() => {
  coordinator.shutdownCollabCoordinator()
  mocks.sessions.clear()
  mocks.files.clear()
  mocks.emitted.length = 0
  mocks.anyListeners = []
  mocks.typeListeners = []
  mocks.scripts = []
  mocks.willing = []
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

describe('W23 — 驱动携带 sourceMessageId', () => {
  it('stamps the room message onto the drive command and its persisted message', async () => {
    script({})
    const message = await sendUserMessage('@小李 建个卡')

    const drives = driveEvents()
    expect(drives).toHaveLength(1)
    expect(drives[0].collabSourceMessageId).toBe(message.id)

    const persisted = (mocks.sessions.get(FE_SESSION) as FakeSession).messages
      .filter(item => item.source === 'collab')
    expect(persisted).toHaveLength(1)
    expect(persisted[0].collabSourceMessageId).toBe(message.id)
  })

  it('drives a prose-only turn exactly once — no nudge re-drive (W14d 拆除)', async () => {
    script({ thinking: '我觉得应该先拆任务' })
    const message = await sendUserMessage('@小李 建个卡')

    const drives = driveEvents()
    expect(drives).toHaveLength(1)
    expect(drives.some(event => isNudgeDrive(event.content))).toBe(false)
    expect(drives[0].collabSourceMessageId).toBe(message.id)
  })

  it('leaves the field absent when no room message is behind the activation', async () => {
    // A task-event activation comes from the work pipeline (delivery review),
    // not from anything anyone typed — there is no room message to retire, and
    // stamping one would let the ledger consume a message nobody answered.
    script({})
    mocks.workerHost?.enqueueRoomActivation(ROOM, 'fe', 'task-event', '交付评审')
    await flush()

    const drives = driveEvents()
    expect(drives).toHaveLength(1)
    expect(drives[0].collabSourceMessageId).toBeUndefined()
  })
})

describe('W23 — 对账两级去重', () => {
  /** The shape that parks the watermark: a turn completes having persisted
   *  nothing, so nothing is ever "consumed" in the watermark's eyes. */
  async function runParkedTurn(): Promise<FakeMessage> {
    script({})
    const message = await sendUserMessage('@小李 建个卡')
    expect(driveEvents()).toHaveLength(1)
    // Watermark really is still behind the user message — otherwise the rest of
    // this suite would be testing nothing.
    expect(storedState().lastProcessedMessageId).not.toBe(message.id)
    return message
  }

  it('level 1: the state record alone stops the replay', async () => {
    await runParkedTurn()
    await restart()
    expect(driveEvents()).toHaveLength(0)
  })

  it('level 2: an evicted record is covered by the transcript', async () => {
    const message = await runParkedTurn()
    evictActivationRecords()
    await restart()

    expect(driveEvents()).toHaveLength(0)
    // A level-2 hit CONSUMES the message: the watermark moves past it so the
    // next boot pays for no scan at all.
    expect(storedState().lastProcessedMessageId).toBe(message.id)
  })

  it('level 2: survives losing the state file outright', async () => {
    const message = await runParkedTurn()
    mocks.files.delete(STATE_PATH)
    await restart()

    expect(driveEvents()).toHaveLength(0)
    expect(storedState().lastProcessedMessageId).toBe(message.id)
  })

  it('level 2 stays quiet a second time — the advanced watermark ends the scan', async () => {
    await runParkedTurn()
    evictActivationRecords()

    await restart()
    const afterFirst = driveEvents().length
    await restart()
    const afterSecond = driveEvents().length

    // Both boots, not just the second one: a replay on the first boot would
    // write a fresh record that makes the second boot pass for the wrong reason.
    expect([afterFirst, afterSecond]).toEqual([0, 0])
  })

  /**
   * 2026-08-01 行为变更(collab-agent-view.md P4):**已读游标是第三级证明**,
   * 而且它比前两级都硬。
   *
   * 记录被挤掉、转录被清空之后,这条消息曾经会被重放一次 —— 那是 W23 的设计:
   * 宁可多驱一次也不要漏掉一条没人应的消息。游标出现之后这个取舍换了方向:
   * 那一轮**跑完了**(沉默也是跑完),游标因此前移,而"它读过了、选择不说"是
   * 一个完整的处理结果。再驱一次得到的只会是同一段上下文下的同一个沉默,或者
   * 更糟 —— 对着一段已经过去的对话重新开口(事故里的陈旧激活正是这个形状)。
   *
   * 真正需要重放的那种失败仍然重放:中止/超时/崩溃的回合不推进游标。
   */
  it('records + transcript both gone: the read cursor still stops the replay', async () => {
    await runParkedTurn()
    evictActivationRecords()
    // Strip the transcript proof too — now only the cursor remembers.
    const execMessages = (mocks.sessions.get(FE_SESSION) as FakeSession).messages
    execMessages.length = 0
    script({})
    await restart()

    expect(driveEvents()).toHaveLength(0)
  })

  /**
   * 同上(P4):游标是第三级证明,而它不认 `collabSourceMessageId` 那个戳 ——
   * 它记的是"读到哪一条为止",与 drive 是哪个版本写的无关。所以 pre-W23 的
   * 无戳 drive 现在也不会重放:这一轮跑完过,那批消息就是读过的。
   *
   * 真正没跑完的回合(记录停在 driving/streaming、崩溃、超时)照旧重放 ——
   * 那条路上游标压根没动。
   */
  it('pre-W23 drives carry no stamp — the cursor covers them anyway', async () => {
    await runParkedTurn()
    evictActivationRecords()
    // The compatibility case: the drive is on disk, but it predates the field.
    for (const item of (mocks.sessions.get(FE_SESSION) as FakeSession).messages) {
      delete item.collabSourceMessageId
    }
    script({})
    await restart()

    expect(driveEvents()).toHaveLength(0)
  })

  it('a different unanswered message is NOT swallowed by the scan', async () => {
    // The ledger is keyed by message id, not by "this room saw some drive".
    await runParkedTurn()
    evictActivationRecords()
    script({})
    const second = await sendUserMessage('@小李 再建一个')
    expect(driveEvents().some(event => event.collabSourceMessageId === second.id)).toBe(true)
  })
})

describe('W23 — 关键点强制 flush', () => {
  it('persists the activation record BEFORE the drive is emitted', async () => {
    // writeJsonFile is writeFileSync+renameSync, so "persisted" means on disk,
    // not queued. A kill between enqueue and drive cannot lose the record.
    let stateAtDrive: ReturnType<typeof storedState> | undefined
    mocks.driveHandler = (sessionId, event) => {
      stateAtDrive ??= storedState()
      pushInto(sessionId, {
        role: 'user',
        content: String(event.content),
        source: 'collab',
        ...(event.collabSourceMessageId
          ? { collabSourceMessageId: String(event.collabSourceMessageId) }
          : {}),
      })
      setTimeout(() => {
        void emitRaw(sessionId, { type: 'stream:start' })
        void emitRaw(sessionId, { type: 'stream:complete' })
      }, 0)
    }

    const message = await sendUserMessage('@小李 建个卡')
    expect(stateAtDrive?.activations.some(record => record.sourceMessageId === message.id)).toBe(true)
  })

  it('persists the terminal state before the activation returns', async () => {
    script({ says: ['做完了'] })
    await sendUserMessage('@小李 建个卡')

    const state = storedState()
    expect(state.activations.at(-1)?.stage).toBe('harvested')
    // Harvest advanced the watermark onto the say, and that is what is on disk.
    const say = room().messages.find(item => item.source === 'collab-say')
    expect(state.lastProcessedMessageId).toBe(say?.id)
  })
})
