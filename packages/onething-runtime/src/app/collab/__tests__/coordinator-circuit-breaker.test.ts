/**
 * W22 判定即承诺 — the coordinator half (docs/design/multi-agent-collab-im.md §4 W22).
 *
 * Two things only a wired-up test can make true:
 *
 *  1. **判定 true ⇒ 至少一条 say.** The whole point of retiring `stay_silent`
 *     and naming `say` in the forced opening call is that a turn which ran
 *     because the willingness layer said "this member wants to speak" ends with
 *     the room holding words. The room transcript is the assertion.
 *  2. **断路器真的掐得住.** The pure breaker is unit-tested next door; what
 *     matters here is the wiring — that it is watching the EXECUTION session for
 *     the whole turn window, that it aborts through the engine's ordinary
 *     channel, that it leaves one readable record where someone will look for
 *     it, and above all that a perfectly normal multi-say turn walks past it
 *     untouched.
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
    budgets?: { maxTurnToolCalls?: number; maxTurnSayCalls?: number }
  }
  messages: FakeMessage[]
}

/** One turn the fake engine plays: a tool-call program, in order. */
interface TurnScript {
  thinking?: string
  /** Each entry is one executed tool call. `say` also lands a room message. */
  toolCalls?: string[]
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
  driveHandler: null as null | ((sessionId: string) => void),
  /** Sessions the coordinator asked the engine to abort, in order. */
  aborted: [] as string[],
  willing: [] as string[],
}))

vi.mock('@onething/core/storage', () => ({
  readJsonFile: <T>(_path: string, fallback: T) => fallback,
  writeJsonFile: () => {},
}))

vi.mock('../../stores/paths.js', () => ({ getStorePath: () => '/tmp/onething-collab-breaker-test' }))

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
    },
  }),
}))

vi.mock('../../agents/index.js', () => ({ findAgent: (id: string) => AGENTS[id] ?? null }))

vi.mock('../board-store.js', () => ({
  forgetCollabBoardRoom: () => {},
  loadCollabBoard: () => ({ version: 1, tasks: [] }),
  shutdownCollabBoardBroadcasts: () => {},
}))

vi.mock('../willingness-runner.js', () => ({
  judgeWillingness: async () =>
    mocks.willing.map(agentId => ({ agentId, respond: true })),
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

const ROOM = 'room-1'
const FE_SESSION = 'agent-exec-fe-room-1'
let nextId = 0

function sessionOf(id: string): FakeSession {
  return mocks.sessions.get(id) as FakeSession
}

function pushInto(
  sessionId: string,
  message: Omit<FakeMessage, 'id' | 'timestamp'>,
): FakeMessage {
  const full: FakeMessage = { id: `m-${++nextId}`, timestamp: Date.now(), ...message }
  sessionOf(sessionId).messages.push(full)
  return full
}

function script(...turns: TurnScript[]): void {
  mocks.scripts = turns as unknown as Array<Record<string, unknown>>
}

/**
 * The engine, W18/W22 shape. Unlike the W18 harness next door this one plays
 * `tool:execution-start` — the event the breaker counts, and the only one every
 * provider emits (a provider that does not stream tool arguments never sends
 * `tool:input-start`).
 *
 * It also honours the abort: once the coordinator has called `engine.abort`, the
 * remaining program is dropped and the stream ends on `stream:aborted`, exactly
 * as a real torn-down stream would.
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
      pushInto(sessionId, {
        role: 'assistant',
        agentId,
        content: turn?.thinking ?? '',
        source: 'collab-turn',
      })

      let seq = 0
      let killed = false
      for (const toolName of turn?.toolCalls ?? []) {
        if (mocks.aborted.includes(sessionId)) {
          killed = true
          break
        }
        const toolCallId = `${sessionId}-call-${++seq}`
        notify({ type: 'tool:execution-start', toolCallId, toolName })
        if (toolName === 'send_message' && !mocks.aborted.includes(sessionId)) {
          pushInto(roomSessionId, {
            role: 'assistant',
            agentId,
            content: `第 ${seq} 句`,
            source: 'collab-say',
          })
        }
      }
      notify({ type: killed ? 'stream:aborted' : 'stream:complete' })
    }, 0)
  }
}

async function flush(): Promise<void> {
  for (let round = 0; round < 8; round++) {
    for (let index = 0; index < 20; index++) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

async function sendUserMessage(content: string): Promise<FakeMessage> {
  const message = pushInto(ROOM, { role: 'user', content })
  for (const entry of [...mocks.typeListeners]) {
    if (entry.type === 'message:user-created') {
      entry.handler({ sessionId: ROOM, event: { message } })
    }
  }
  await flush()
  return message
}

function says(): FakeMessage[] {
  return sessionOf(ROOM).messages.filter(message => message.source === 'collab-say')
}

function breakerNotes(sessionId: string): FakeMessage[] {
  return sessionOf(sessionId).messages.filter(
    message => message.role === 'system' && message.content.includes('回合断路器'),
  )
}

beforeEach(() => {
  coordinator.shutdownCollabCoordinator()
  mocks.sessions.clear()
  mocks.emitted.length = 0
  mocks.anyListeners = []
  mocks.typeListeners = []
  mocks.scripts = []
  mocks.driveHandler = null
  mocks.aborted.length = 0
  mocks.willing = []
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

describe('判定为真的回合能把话说进群里', () => {
  it('turns a willingness "yes" into at least one say in the ROOM', async () => {
    // 端到端形状:没人被 @,判定选中了小李,群里最后有话。W22 是用强制首调 say
    // 买来的这个结果;强制已于 2026-07-30 移除(下一条 it),同样的回合仍然成立
    // ——因为判定为真的 agent 本来就想说话,提示词也只说 say 一条路。
    mocks.willing = ['fe']
    script({ thinking: '我知道这个', toolCalls: ['send_message'] })
    await sendUserMessage('登录页什么时候能好?')

    expect(says()).toHaveLength(1)
    expect(mocks.aborted).toEqual([])
    expect(breakerNotes(FE_SESSION)).toHaveLength(0)
  })

  it('does NOT force the opening call — silence stays reachable (todo2 P0-4)', async () => {
    mocks.willing = ['fe']
    script({ thinking: '我知道这个', toolCalls: ['send_message'] })
    await sendUserMessage('登录页什么时候能好?')

    const drive = mocks.emitted.find(entry => entry.event.type === 'command:send-message')
    expect(drive?.event.initialToolChoice).toBeUndefined()
  })
})

describe('W22 回合断路器 — 接线', () => {
  it('aborts the runaway turn and leaves ONE readable note in the execution session', async () => {
    // 事故形状回放:一轮里工具调用不停,永远到不了无工具的收尾轮。默认总量
    // 上限 40,所以第 41 次执行触发断路器。
    script({ thinking: '', toolCalls: Array.from({ length: 80 }, () => 'board') })
    await sendUserMessage('@小李 登录页什么时候能好?')

    expect(mocks.aborted).toEqual([FE_SESSION])

    const notes = breakerNotes(FE_SESSION)
    expect(notes).toHaveLength(1)
    expect(notes[0].content).toContain('41')
    expect(notes[0].content).toContain('40')

    // 房间是消息流:断路器是机械记录,不该出现在群里。
    expect(breakerNotes(ROOM)).toHaveLength(0)
  })

  it('cuts a say flood at the say cap, keeping what already landed', async () => {
    script({ thinking: '', toolCalls: Array.from({ length: 40 }, () => 'send_message') })
    await sendUserMessage('@小李 登录页什么时候能好?')

    expect(mocks.aborted).toEqual([FE_SESSION])
    // The trip happens ON the twenty-first execution, so twenty utterances are
    // in the room and the twenty-first never becomes a message.
    expect(says()).toHaveLength(20)
    expect(breakerNotes(FE_SESSION)[0]?.content).toContain('发言')
  })

  it('never touches a normal multi-say turn — 误伤锁', async () => {
    // IM 连发 is a designed behaviour (W19 lights one typing pulse per line).
    // A breaker that fired here would be a behaviour change, not a safety net.
    //
    // Seven says specifically: that is the turn 用户 lost to the original cap of
    // six (2026-07-28), which is why the defaults were raised. This case is the
    // regression lock for that incident, not an arbitrary number.
    script({
      thinking: '分几句说',
      toolCalls: ['board', ...Array.from({ length: 7 }, () => 'send_message')],
    })
    await sendUserMessage('@小李 登录页什么时候能好?')

    expect(mocks.aborted).toEqual([])
    expect(breakerNotes(FE_SESSION)).toHaveLength(0)
    expect(says()).toHaveLength(7)
  })

  it('gives every activation a fresh breaker — counts do not carry across turns', async () => {
    // The observer is opened and torn down inside the agent lock, so two turns
    // that are individually fine must never add up into a trip.
    script(
      { thinking: '一', toolCalls: ['send_message', 'send_message', 'send_message', 'send_message'] },
      { thinking: '二', toolCalls: ['send_message', 'send_message', 'send_message', 'send_message'] },
    )
    await sendUserMessage('@小李 登录页什么时候能好?')
    await sendUserMessage('@小李 再确认一次')

    expect(mocks.aborted).toEqual([])
    expect(says()).toHaveLength(8)
  })
})

describe('W22 回合断路器 — 房间可配置', () => {
  /** Room settings are read when the turn window opens, so writing them here
   *  (before the drive) is the same order the settings dialog produces. */
  function setRoomCaps(budgets: { maxTurnToolCalls?: number; maxTurnSayCalls?: number }): void {
    const room = sessionOf(ROOM).room
    if (room) room.budgets = budgets
  }

  it('honours a LOWERED say cap from the room settings', async () => {
    setRoomCaps({ maxTurnSayCalls: 3 })
    script({ thinking: '', toolCalls: Array.from({ length: 10 }, () => 'send_message') })
    await sendUserMessage('@小李 登录页什么时候能好?')

    expect(mocks.aborted).toEqual([FE_SESSION])
    expect(says()).toHaveLength(3)
    expect(breakerNotes(FE_SESSION)[0]?.content).toContain('3')
  })

  it('honours a RAISED say cap — a turn the default would have cut goes through', async () => {
    setRoomCaps({ maxTurnSayCalls: 30 })
    script({ thinking: '', toolCalls: Array.from({ length: 25 }, () => 'send_message') })
    await sendUserMessage('@小李 登录页什么时候能好?')

    expect(mocks.aborted).toEqual([])
    expect(says()).toHaveLength(25)
    expect(breakerNotes(FE_SESSION)).toHaveLength(0)
  })

  it('0 = 关闭: neither cap trips, whatever the turn does', async () => {
    // 用户可以完全关掉这道闸(与日预算/maxChain 同一约定)。The wall clock is
    // then the only bound left — a deliberate choice the setting makes explicit.
    setRoomCaps({ maxTurnToolCalls: 0, maxTurnSayCalls: 0 })
    script({ thinking: '', toolCalls: Array.from({ length: 60 }, () => 'send_message') })
    await sendUserMessage('@小李 登录页什么时候能好?')

    expect(mocks.aborted).toEqual([])
    expect(says()).toHaveLength(60)
    expect(breakerNotes(FE_SESSION)).toHaveLength(0)
  })

  it('keeps the total cap live when only the say cap is switched off', async () => {
    setRoomCaps({ maxTurnSayCalls: 0 })
    script({ thinking: '', toolCalls: Array.from({ length: 60 }, () => 'send_message') })
    await sendUserMessage('@小李 登录页什么时候能好?')

    expect(mocks.aborted).toEqual([FE_SESSION])
    expect(says()).toHaveLength(40)
    expect(breakerNotes(FE_SESSION)[0]?.content).toContain('工具调用')
  })
})
