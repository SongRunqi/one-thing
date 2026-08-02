/**
 * W18 执行会话分离 — the coordinator half.
 *
 * 用户原话:"一个群聊里只有 message。我们要把 agent 抽象出来,干活、思考都在
 * 自己的 session 里干,说话调用工具 say,say 到哪个 room。"
 *
 * What only a coordinator test can make true:
 *  - the drive lands on the AGENT's execution session, carrying the target room
 *    on that session so the prompt builder and the say executor can find it;
 *  - the ROOM comes out of a whole activation holding nothing but messages —
 *    the fence this工单 exists for;
 *  - everything the room still owns (chain, cascade, typing) keeps working
 *    across the session boundary;
 *  - two rooms activating the SAME agent are serialized, because they now share
 *    one execution session and two streams on it would supersede each other.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeMessage {
  id: string
  role: string
  content: string
  agentId?: string
  source?: string
  timestamp: number
  toolCalls?: Array<{ toolName?: string }>
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

/** One turn the fake engine plays in answer to one drive. */
interface TurnScript {
  thinking?: string
  /** Non-utterance tool calls (board etc.): streamed like real ones,
   *  stamped on the turn record, and expected to light nothing (W19). */
  toolCalls?: Array<{ toolName?: string }>
  /** Utterances — one `say` call each, landing in the room the drive pointed
   *  the session at. */
  says?: Array<{ content: string; mentions?: Array<{ agentId: string; label: string }> }>
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
  scripts: [] as Array<Record<string, unknown>>,
  /** Drive log: which session, and where that session pointed at the time. */
  drives: [] as Array<{ sessionId: string; roomSessionId?: string; content: string }>,
  /** Ordered trace of drive/terminal events — the serialization assertion. */
  trace: [] as string[],
  driveHandler: null as null | ((sessionId: string) => void),
  ledger: [] as Array<{ sessionId: string; costUSD: number }>,
}))

vi.mock('@onething/core/storage', () => ({
  readJsonFile: <T>(_path: string, fallback: T) => fallback,
  writeJsonFile: () => {},
}))

vi.mock('../../stores/paths.js', () => ({ getStorePath: () => '/tmp/onething-collab-test' }))

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
      if (event.type === 'command:send-message') {
        const driven = mocks.sessions.get(sessionId) as FakeSession | undefined
        mocks.drives.push({
          sessionId,
          roomSessionId: driven?.collab?.roomSessionId,
          content: String(event.content),
        })
        mocks.trace.push(`drive:${sessionId}`)
        mocks.driveHandler?.(sessionId)
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
  freezeRoomWork: () => {},
  resumeRoomWork: () => {},
  reconcileRoomBoard: () => {},
}))

const coordinator = await import('../coordinator.js')

const ROOM = 'room-1'
const ROOM_B = 'room-2'
// collab-team-v2 §1.1:执行会话按群隔离,id 里带上房间。
const FE_SESSION = 'agent-exec-fe-room-1'
const FE_SESSION_B = 'agent-exec-fe-room-2'
let nextId = 0

function sessionOf(id: string): FakeSession {
  return mocks.sessions.get(id) as FakeSession
}

function pushInto(
  sessionId: string,
  message: Omit<FakeMessage, 'id' | 'timestamp'> & { id?: string },
): FakeMessage {
  const full: FakeMessage = { id: message.id ?? `m-${++nextId}`, timestamp: Date.now(), ...message }
  sessionOf(sessionId).messages.push(full)
  return full
}

function seedRoom(id: string, name: string): void {
  mocks.sessions.set(id, {
    id,
    name,
    kind: 'room',
    room: { memberAgentIds: ['pm', 'fe'], pmAgentId: 'pm' },
    messages: [],
  } satisfies FakeSession)
}

function script(...turns: TurnScript[]): void {
  mocks.scripts = turns as unknown as Array<Record<string, unknown>>
}

/**
 * The engine, W18 shape: thinking into the driven (execution) session, `say`
 * into the room that session currently points at.
 *
 * W19 made the tool-argument stream load-bearing (it is what the typing
 * observer reads), so the fake plays that stream too: a silent thinking phase,
 * then one `tool:input-start`/`tool:input-end` pair per utterance — plus the
 * same pair for any non-say tool the script names, which must NOT light
 * anything.
 */
function bindFakeEngine(): void {
  mocks.driveHandler = (sessionId: string) => {
    const turn = mocks.scripts.shift() as TurnScript | undefined
    const agentId = sessionId.replace('agent-exec-', '').replace(/-room-\d+$/, '')
    const roomSessionId = sessionOf(sessionId)?.collab?.roomSessionId ?? ROOM
    const notify = (event: Record<string, unknown>): void => {
      for (const entry of [...mocks.anyListeners]) {
        if (entry.sessionId === sessionId) entry.handler({ sessionId, event })
      }
    }
    setTimeout(() => {
      notify({ type: 'stream:start' })
      if (turn?.thinking !== undefined) {
        pushInto(sessionId, {
          role: 'assistant',
          agentId,
          content: turn.thinking,
          source: 'collab-turn',
          ...(turn.toolCalls ? { toolCalls: turn.toolCalls } : {}),
        })
      }
      let callSeq = 0
      const streamToolCall = (toolName: string): void => {
        const toolCallId = `${sessionId}-call-${++callSeq}`
        notify({ type: 'tool:input-start', toolCallId, toolName })
        notify({ type: 'tool:input-end', toolCallId, toolCall: { id: toolCallId, toolId: toolName } })
      }
      for (const toolCall of turn?.toolCalls ?? []) streamToolCall(toolCall.toolName ?? 'board')
      for (const say of turn?.says ?? []) {
        streamToolCall('send_message')
        pushInto(roomSessionId, {
          role: 'assistant',
          agentId,
          content: say.content,
          source: 'collab-say',
          ...(say.mentions ? { mentions: say.mentions } : {}),
        })
      }
      mocks.trace.push(`turn-end:${sessionId}`)
      notify({ type: 'stream:complete' })
    }, 0)
  }
}

async function flush(): Promise<void> {
  for (let round = 0; round < 8; round++) {
    for (let index = 0; index < 20; index++) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

/** Deliver a user message the way the ingress gate does. */
async function sendUserMessage(roomSessionId: string, content: string): Promise<FakeMessage> {
  const message = pushInto(roomSessionId, { role: 'user', content })
  for (const entry of [...mocks.typeListeners]) {
    if (entry.type === 'message:user-created') {
      entry.handler({ sessionId: roomSessionId, event: { message } })
    }
  }
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
  mocks.drives.length = 0
  mocks.trace.length = 0
  mocks.driveHandler = null
  mocks.ledger = []
  seedRoom(ROOM, '官网改版组')
  coordinator.initializeCollabCoordinator()
  bindFakeEngine()
})

describe('W18 — 驱动改道', () => {
  it('drives the agent execution session, with the target room on it', async () => {
    script({ thinking: '看一眼排期', says: [{ content: '明天下班前' }] })
    await sendUserMessage(ROOM, '@小李 登录页什么时候能好?')

    expect(mocks.drives).toHaveLength(1)
    expect(mocks.drives[0].sessionId).toBe(FE_SESSION)
    // The prompt builder and the say executor both read the pointer written
    // here — it must be in place BEFORE the drive is emitted.
    expect(mocks.drives[0].roomSessionId).toBe(ROOM)
    // drive 只有数据:房间内容(+ 别处发生的事)。`<turn>` 指令块已整块删除
    // (collab-turn-protocol-and-identity.md A.2 ②),机制只在 system prompt 说
    // 一次 —— 每回合重复它是念经,而且占着 recency 最强的位置。
    expect(mocks.drives[0].content).toContain('登录页什么时候能好')
    expect(mocks.drives[0].content).not.toContain('<turn ')
    expect(mocks.drives[0].content).not.toContain('send_message')

    const agentSession = sessionOf(FE_SESSION)
    expect(agentSession).toMatchObject({ kind: 'agent', agentId: 'fe', isArchived: true })
    // The turn's own record stayed in the execution session…
    expect(agentSession.messages.filter(message => message.source === 'collab-turn'))
      .toHaveLength(1)
    // …and so did the drive itself: it is a command, the engine persists it
    // there, and the room never sees one.
    expect(sessionOf(ROOM).messages.some(message => message.role === 'user'
      && message.content.includes('小李 ·'))).toBe(false)
  })

  it('keeps the ROOM a pure message stream (fence)', async () => {
    script(
      // 小李 answers and pulls 阿明 in…
      {
        thinking: '先回一句,再点阿明',
        says: [
          { content: '登录页明天下班前' },
          { content: '@阿明 你拍个板', mentions: [{ agentId: 'pm', label: '阿明' }] },
        ],
      },
      // …阿明's cascade turn ends without writing or saying anything.
      { thinking: '' },
    )
    await sendUserMessage(ROOM, '@小李 登录页什么时候能好?')

    // Two agents were driven, each in its own session.
    expect(mocks.drives.map(drive => drive.sessionId)).toEqual([FE_SESSION, 'agent-exec-pm-room-1'])

    const roomAssistants = sessionOf(ROOM).messages.filter(message => message.role === 'assistant')
    expect(roomAssistants).toHaveLength(2)
    // THE fence: every assistant message in the room is a say. No thinking
    // records, no unmarked turn output, nothing to filter at render time.
    expect(roomAssistants.every(message => message.source === 'collab-say')).toBe(true)
    // …and no drive lines either — the room's user messages are the human's.
    expect(sessionOf(ROOM).messages.filter(message => message.role === 'user')).toHaveLength(1)
    expect(sessionOf(ROOM).messages.some(message => message.source === 'collab')).toBe(false)
  })

  it('lights the room once per utterance, and only while it is written (W19)', async () => {
    script({
      thinking: '想好了',
      // A board move in the same turn: real work, not speech.
      toolCalls: [{ toolName: 'board' }],
      says: [{ content: '一' }, { content: '二' }],
    })
    await sendUserMessage(ROOM, '@小李 登录页什么时候能好?')

    const typing = mocks.emitted
      .filter(entry => entry.event.type === 'collab:typing' && entry.sessionId === ROOM)
      .map(entry => entry.event.typing)
    // Two utterances = two pulses (the board call and the thinking phase are
    // silent), then the activation's closing 兜底 false.
    expect(typing).toEqual([true, false, true, false, false])
  })

  it('never lights for a turn that stayed silent — 信号源变异锁 (W19)', async () => {
    // Queueing used to emit `true` on its own; a silent turn therefore showed a
    // typing line for a message that never came. The only trues left in the
    // system come from `say` arguments streaming.
    script({ thinking: '', toolCalls: [{ toolName: 'board' }] })
    await sendUserMessage(ROOM, '@小李 登录页什么时候能好?')

    const typing = mocks.emitted
      .filter(entry => entry.event.type === 'collab:typing')
      .map(entry => entry.event.typing)
    expect(typing.some(value => value === true)).toBe(false)
  })

  it('drives a prose-only turn exactly once — the W14d nudge is gone (2026-07-30)', async () => {
    script({ thinking: '答案写好了,忘了发' })
    await sendUserMessage(ROOM, '@小李 登录页什么时候能好?')

    expect(mocks.drives).toHaveLength(1)
    expect(mocks.drives[0].sessionId).toBe(FE_SESSION)
    // Silence stays silence — and it left no trace in the room.
    expect(sessionOf(ROOM).messages.filter(message => message.role === 'assistant')).toHaveLength(0)
    expect(sessionOf(ROOM).messages.some(message => message.role === 'system')).toBe(false)
  })
})

describe('W18 — 预算闸跟着开销走', () => {
  it('counts the members’ execution sessions as room spend', async () => {
    mocks.ledger = [
      { sessionId: ROOM, costUSD: 0.10 },
      // The room's main expense since W18: the turns themselves.
      { sessionId: FE_SESSION, costUSD: 1.50 },
      { sessionId: 'agent-exec-pm-room-1', costUSD: 0.40 },
      // Somebody else's session — never this room's problem.
      { sessionId: 'agent-exec-ghost-room-1', costUSD: 99 },
      { sessionId: 'chat-1', costUSD: 99 },
    ]
    expect(await coordinator.readCollabRoomSpentTodayUSD(ROOM)).toBeCloseTo(2.0, 5)
  })

  it('holds an activation when the turns blew the budget', async () => {
    mocks.ledger = [{ sessionId: FE_SESSION, costUSD: 50 }]
    script({ thinking: '本来想说的', says: [{ content: '不该发出去' }] })
    await sendUserMessage(ROOM, '@小李 登录页什么时候能好?')

    expect(mocks.drives).toHaveLength(0)
    expect(sessionOf(ROOM).messages.some(message => message.role === 'assistant')).toBe(false)
  })
})

describe('每群每 agent 一条执行会话(collab-team-v2 §1)', () => {
  it('lets two rooms drive the same agent without either waiting on the other', async () => {
    seedRoom(ROOM_B, '内部工具组')
    script(
      { thinking: '回一句', says: [{ content: '登录页明天' }] },
      { thinking: '也回一句', says: [{ content: '工具那边下周' }] },
    )

    // 两个群同时问小李。W18 时这两轮共用一条执行会话,必须严格串行(锁的 key
    // 就是会话 id);现在各有各的会话,锁的粒度自动降到 per(agent×群),互不争用。
    await Promise.all([
      sendUserMessage(ROOM, '@小李 登录页什么时候能好?'),
      sendUserMessage(ROOM_B, '@小李 工具那边呢?'),
    ])
    await flush()

    expect(new Set(mocks.drives.map(drive => drive.sessionId)))
      .toEqual(new Set([FE_SESSION, FE_SESSION_B]))
    // 一条会话上仍然只能有一轮:每条会话各自 drive→turn-end 成对,不交错。
    for (const sessionId of [FE_SESSION, FE_SESSION_B]) {
      expect(mocks.trace.filter(entry => entry.endsWith(sessionId)))
        .toEqual([`drive:${sessionId}`, `turn-end:${sessionId}`])
    }
    // Each turn answered its own room, and each utterance landed there.
    expect(new Set(mocks.drives.map(drive => drive.roomSessionId))).toEqual(new Set([ROOM, ROOM_B]))
    expect(sessionOf(ROOM).messages.filter(message => message.source === 'collab-say')
      .map(message => message.content)).toHaveLength(1)
    expect(sessionOf(ROOM_B).messages.filter(message => message.source === 'collab-say')
      .map(message => message.content)).toHaveLength(1)
  })
})
