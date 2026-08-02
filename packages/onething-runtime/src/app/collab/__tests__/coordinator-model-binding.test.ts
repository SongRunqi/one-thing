/**
 * P1-4 模型绑定与会话手选的优先级(docs/design/todo2-fix-plan.md)。
 *
 * 真机症状:在群聊 agent 的执行会话里换模型永远不生效。根因不在 UI ——
 * 每次驱动都把 agent 档案的 model binding 写成**命令级 override**,而
 * `withAgentModelBinding`(app/engine/stream-engine.ts)对任何已带 providerId
 * 的命令直接短路,于是会话级解析(它认 modelPinned)根本没有机会跑。
 *
 * 这个文件守的就是那个分叉:会话没被手选 → 驱动照带 binding(档案仍然有效);
 * 会话被手选(modelPinned)→ 驱动一个字段都不带,让引擎去解析会话自己的模型。
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
}

interface FakeSession {
  id: string
  name: string
  kind?: string
  agentId?: string
  isArchived?: boolean
  modelPinned?: boolean
  collab?: { roomSessionId?: string }
  room?: { memberAgentIds: string[]; pmAgentId?: string; frozen?: boolean }
  messages: FakeMessage[]
}

interface TurnScript {
  thinking?: string
  says?: string[]
}

const AGENTS: Record<string, { id: string; name: string; model?: unknown }> = {
  pm: { id: 'pm', name: '阿明' },
  fe: {
    id: 'fe',
    name: '小李',
    model: { providerId: 'claude', modelId: 'claude-sonnet-4', thinking: 'medium' },
  },
}

const mocks = vi.hoisted(() => ({
  sessions: new Map<string, unknown>(),
  emitted: [] as Array<{ sessionId: string; event: Record<string, unknown> }>,
  anyListeners: [] as Array<{ sessionId: string; handler: (envelope: unknown) => void }>,
  typeListeners: [] as Array<{ type: string; handler: (envelope: unknown) => void }>,
  scripts: [] as Array<Record<string, unknown>>,
  driveHandler: null as null | ((sessionId: string) => void),
}))

vi.mock('@onething/core/storage', () => ({
  readJsonFile: <T>(_path: string, fallback: T) => fallback,
  writeJsonFile: () => {},
}))

vi.mock('../../stores/paths.js', () => ({ getStorePath: () => '/tmp/onething-collab-test' }))

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
/** 执行会话按群隔离(collab-team-v2 §1.1)。 */
const FE_SESSION = 'agent-exec-fe-room-1'
let nextId = 0

function pushInto(
  sessionId: string,
  message: Omit<FakeMessage, 'id' | 'timestamp'> & { id?: string },
): FakeMessage {
  const full: FakeMessage = { id: message.id ?? `m-${++nextId}`, timestamp: Date.now(), ...message }
  ;(mocks.sessions.get(sessionId) as FakeSession).messages.push(full)
  return full
}

function bindFakeEngine(): void {
  mocks.driveHandler = (sessionId: string) => {
    const turn = mocks.scripts.shift() as TurnScript | undefined
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
          agentId: 'fe',
          content: turn.thinking,
          source: 'collab-turn',
        })
      }
      let callSeq = 0
      for (const say of turn?.says ?? []) {
        const toolCallId = `${sessionId}-call-${++callSeq}`
        notify({ type: 'tool:input-start', toolCallId, toolName: 'send_message' })
        notify({ type: 'tool:input-end', toolCallId, toolCall: { id: toolCallId, toolId: 'send_message' } })
        pushInto(ROOM, { role: 'assistant', agentId: 'fe', content: say, source: 'collab-say' })
      }
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

async function sendUserMessage(content: string): Promise<void> {
  const message = pushInto(ROOM, { role: 'user', content })
  for (const entry of [...mocks.typeListeners]) {
    if (entry.type === 'message:user-created') {
      entry.handler({ sessionId: ROOM, event: { message } })
    }
  }
  await flush()
}

function drives(): Array<Record<string, unknown>> {
  return mocks.emitted
    .filter(entry => entry.event.type === 'command:send-message')
    .map(entry => entry.event)
}

beforeEach(() => {
  coordinator.shutdownCollabCoordinator()
  mocks.sessions.clear()
  mocks.emitted.length = 0
  mocks.anyListeners = []
  mocks.typeListeners = []
  mocks.scripts = [{ thinking: '看一眼', says: ['明天下班前'] } as Record<string, unknown>]
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

describe('P1-4 — 会话手选的模型打得赢 agent 档案绑定', () => {
  it('stamps the agent binding on the drive while the session is unpinned', async () => {
    await sendUserMessage('@小李 登录页什么时候能好?')

    expect(drives()).toHaveLength(1)
    expect(drives()[0]).toMatchObject({
      providerId: 'claude',
      model: 'claude-sonnet-4',
      thinking: true,
      thinkingEffort: 'medium',
    })
  })

  it('drops the override once the user pinned a model on the execution session', async () => {
    // 用户在执行会话里手选了模型 —— 存储上这就是 modelPinned。
    mocks.sessions.set(FE_SESSION, {
      id: FE_SESSION,
      name: '小李的执行会话',
      kind: 'agent',
      agentId: 'fe',
      isArchived: true,
      modelPinned: true,
      collab: { roomSessionId: ROOM },
      messages: [],
    } satisfies FakeSession)

    await sendUserMessage('@小李 登录页什么时候能好?')

    expect(drives()).toHaveLength(1)
    const drive = drives()[0]
    // 一个字段都不带:带了 providerId 就会让 withAgentModelBinding 短路,
    // 会话级解析(它才认 modelPinned)再也没有机会跑。
    expect(drive.providerId).toBeUndefined()
    expect(drive.model).toBeUndefined()
    expect(drive.thinking).toBeUndefined()
    expect(drive.thinkingEffort).toBeUndefined()
  })
})
