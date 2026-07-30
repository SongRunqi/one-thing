/**
 * The coordinator's terminal branch, end to end: everything a settled reply
 * grows happens in ONE place — chain count, typing off, quote (W13.2) and
 * mention ids (W14a).
 *
 * The points a pure test cannot make: the quote's trigger id comes from the
 * activation record (`sourceMessageId`), so it points at what actually caused
 * the turn; and the ids stamped on the reply are the SAME list that decides the
 * cascade activation, so what the transcript keeps and who gets pulled in can
 * never drift apart.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeMessage {
  id: string
  role: string
  content: string
  agentId?: string
  source?: string
  timestamp: number
  replyTo?: { messageId: string; authorLabel: string; excerpt: string }
  mentions?: Array<{ agentId: string; label: string }>
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

const AGENTS: Record<string, { id: string; name: string }> = {
  pm: { id: 'pm', name: '阿明' },
  fe: { id: 'fe', name: '小李' },
}

const mocks = vi.hoisted(() => ({
  sessions: new Map<string, unknown>(),
  emitted: [] as Array<{ sessionId: string; event: Record<string, unknown> }>,
  anyListeners: [] as Array<{ sessionId: string; handler: (envelope: unknown) => void }>,
  typeListeners: [] as Array<{ type: string; handler: (envelope: unknown) => void }>,
  /** Text the driven agent replies with, or null to reply with nothing.
   *  Pre-W14b shape: the stream itself IS the speech (no source marker). */
  replyContent: '明天下班前' as string | null,
  /** W14b shape: a thinking record plus the `say` messages the turn produced. */
  turnScript: null as null | {
    thinking: string
    says: Array<{
      content: string
      mentions?: Array<{ agentId: string; label: string }>
      replyTo?: { messageId: string; authorLabel: string; excerpt: string }
    }>
  },
  /** The fake engine: called for every drive, with the session it landed on. */
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
  // W18: every drive ensures the agent's execution session first, so creation
  // and the room pointer have to be real here (the drive target reads them).
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
let nextId = 0

function room(): FakeSession {
  return mocks.sessions.get(ROOM) as FakeSession
}

function push(message: Omit<FakeMessage, 'id' | 'timestamp'> & { id?: string }): FakeMessage {
  return pushInto(ROOM, message)
}

function pushInto(
  sessionId: string,
  message: Omit<FakeMessage, 'id' | 'timestamp'> & { id?: string },
): FakeMessage {
  const full: FakeMessage = { id: message.id ?? `m-${++nextId}`, timestamp: Date.now(), ...message }
  ;(mocks.sessions.get(sessionId) as FakeSession).messages.push(full)
  return full
}

/** Deliver a user message the way the ingress gate does. */
async function sendUserMessage(content: string): Promise<FakeMessage> {
  const message = push({ role: 'user', content })
  for (const entry of [...mocks.typeListeners]) {
    if (entry.type === 'message:user-created') entry.handler({ sessionId: ROOM, event: { message } })
  }
  await flush()
  return message
}

/**
 * Play the engine: the drive emit is answered with a persisted assistant
 * message plus the terminal event the coordinator waits on.
 *
 * The terminal fires on a MACROtask: the coordinator subscribes to it in the
 * microtask right after `await emit(command)` resolves, so a microtask-fast
 * fake would emit into the void and every assertion here would go vacuous
 * (the reply would exist, undecorated, and the "no quote" cases would pass for
 * the wrong reason).
 */
function bindFakeEngine(): void {
  mocks.driveHandler = (sessionId: string) => {
    // W18: the drive lands on the agent's execution session, and which agent it
    // is comes from the id itself (the coordinator derives it the same way).
    const agentId = sessionId.replace('agent-exec-', '').replace(/-room-\d+$/, '')
    setTimeout(() => {
      if (mocks.turnScript) {
        // W14b/W18: the turn writes a thinking record into its OWN session
        // (store choke point stamps COLLAB_TURN_SOURCE at creation) and each
        // `say` writes its own message into the ROOM.
        pushInto(sessionId, {
          role: 'assistant',
          agentId,
          content: mocks.turnScript.thinking,
          source: 'collab-turn',
        })
        for (const say of mocks.turnScript.says) {
          push({
            role: 'assistant',
            agentId,
            content: say.content,
            source: 'collab-say',
            ...(say.mentions ? { mentions: say.mentions } : {}),
            ...(say.replyTo ? { replyTo: say.replyTo } : {}),
          })
        }
      } else if (mocks.replyContent !== null) {
        // Pre-W18 shape: an unmarked assistant message left in the ROOM, back
        // when the stream itself was the utterance.
        push({ role: 'assistant', agentId, content: mocks.replyContent })
      }
      void emitRaw(sessionId, { type: 'stream:start' })
      void emitRaw(sessionId, { type: 'stream:complete' })
    }, 0)
  }
}

function driveCommands(): Array<{ sessionId: string; event: Record<string, unknown> }> {
  return mocks.emitted.filter(entry => entry.event.type === 'command:send-message')
}

async function emitRaw(sessionId: string, event: Record<string, unknown>): Promise<void> {
  for (const entry of [...mocks.anyListeners]) {
    if (entry.sessionId === sessionId) entry.handler({ sessionId, event })
  }
}

async function flush(): Promise<void> {
  for (let round = 0; round < 4; round++) {
    for (let index = 0; index < 20; index++) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
  }
}

function lastAgentReply(): FakeMessage | undefined {
  return [...room().messages].reverse().find(message => message.role === 'assistant')
}

beforeEach(() => {
  coordinator.shutdownCollabCoordinator()
  mocks.sessions.clear()
  mocks.emitted.length = 0
  mocks.anyListeners = []
  mocks.typeListeners = []
  mocks.replyContent = '明天下班前'
  mocks.turnScript = null
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

describe('W13.2 — 事后补挂引用', () => {
  it('hangs the quote when the room moved on between question and answer', async () => {
    const trigger = await sendUserMessageWithInterruption()
    expect(driveCommands()).toHaveLength(1)
    const reply = lastAgentReply()!
    expect(reply.content).toBe('明天下班前')
    expect(reply.replyTo).toEqual({
      messageId: trigger.id,
      authorLabel: '用户',
      excerpt: '@小李 登录页什么时候能好?',
    })
    // Same update chain as reactions — and NOT a new user message, so it
    // cannot open a willingness round of its own.
    expect(mocks.emitted.some(entry =>
      entry.event.type === 'message:updated' && entry.event.messageId === reply.id)).toBe(true)
  })

  it('leaves an immediately adjacent reply bare', async () => {
    await sendUserMessage('@小李 登录页什么时候能好?')
    // Positive control: the turn really ran, so "no quote" is a decision and
    // not a missing drive.
    expect(driveCommands()).toHaveLength(1)
    expect(lastAgentReply()?.content).toBe('明天下班前')
    expect(lastAgentReply()?.replyTo).toBeUndefined()
    expect(mocks.emitted.some(entry => entry.event.type === 'message:updated')).toBe(false)
  })

  // W13.3 rides the same drive — asserted here because this is the only test
  // that produces a REAL coordinator send-message command.
  it('labels the room drive as collab-room spend', async () => {
    await sendUserMessage('@小李 登录页什么时候能好?')
    expect(driveCommands()[0].event.usageSource).toBe('collab-room')
  })

  it('does not decorate a pass turn', async () => {
    mocks.replyContent = '[pass]'
    await sendUserMessageWithInterruption()
    expect(driveCommands()).toHaveLength(1)
    expect(lastAgentReply()?.content).toBe('[pass]')
    expect(lastAgentReply()?.replyTo).toBeUndefined()
  })
})

describe('W14a — agent speech gets identity at the same terminal', () => {
  it('stamps ids on the reply and activates the mentioned member from them', async () => {
    mocks.replyContent = '@阿明 你拍个板'
    await sendUserMessage('@小李 看看登录页')

    // The FIRST reply is 小李's turn; the cascade drive that follows is 阿明's
    // (the fake engine answers every drive, so the tail is not what we mean).
    const reply = room().messages.find(message => message.role === 'assistant')!
    expect(reply.mentions).toEqual([{ agentId: 'pm', label: '阿明' }])
    // Same broadcast chain reactions and quotes ride.
    expect(mocks.emitted.some(entry =>
      entry.event.type === 'message:updated'
      && entry.event.messageId === reply.id
      && (entry.event.updates as { mentions?: unknown }).mentions !== undefined)).toBe(true)
    // …and the cascade actually pulled 阿明 in (drive 1 = 小李, drive 2 = 阿明).
    const drives = driveCommands()
    expect(drives).toHaveLength(2)
    expect(drives[1].event.content).toContain('阿明')
  })

  it('writes no mentions field for a reply that addresses nobody', async () => {
    await sendUserMessage('@小李 看看登录页')
    expect(lastAgentReply()?.mentions).toBeUndefined()
    expect(mocks.emitted.some(entry => entry.event.type === 'message:updated')).toBe(false)
    expect(driveCommands()).toHaveLength(1)
  })

  it('does not stamp a pass turn (it is not a message)', async () => {
    mocks.replyContent = '[pass]'
    await sendUserMessage('@小李 看看登录页')
    expect(lastAgentReply()?.mentions).toBeUndefined()
  })
})

/**
 * W14b — 说话即行动. The turn stopped being the utterance: the coordinator's
 * terminal now harvests `say` messages, and the thinking record beside them is
 * treated as what it is (a record, not a message).
 */
describe('W14b — 说话即行动(协调器终局)', () => {
  function says(): FakeMessage[] {
    return room().messages.filter(message => message.source === 'collab-say')
  }
  /** W18: thinking records live in the agent's execution session, never in the
   *  room — reading them from there is also the room-purity assertion. */
  function thinking(): FakeMessage[] {
    const agentSession = mocks.sessions.get('agent-exec-fe-room-1') as FakeSession | undefined
    expect(room().messages.some(message => message.source === 'collab-turn')).toBe(false)
    return (agentSession?.messages ?? []).filter(message => message.source === 'collab-turn')
  }

  it('cascades from what was SAID, across every utterance of the turn', async () => {
    mocks.turnScript = {
      thinking: '我先看看排期,然后回一句,再点一下阿明',
      says: [
        { content: '登录页明天下班前' },
        { content: '@阿明 你拍个板', mentions: [{ agentId: 'pm', label: '阿明' }] },
      ],
    }
    await sendUserMessage('@小李 登录页什么时候能好?')

    // The turn's own two utterances (the fake engine replays the script for
    // the cascade drive too, so only the head of the list is this turn's).
    expect(says().slice(0, 2).map(message => message.content))
      .toEqual(['登录页明天下班前', '@阿明 你拍个板'])
    // The mention lived in the SECOND utterance — the cascade judges the turn
    // as one act, so 阿明 is still pulled in.
    const drives = driveCommands()
    expect(drives).toHaveLength(2)
    expect(drives[1].event.content).toContain('阿明')
  })

  it('treats a turn with no say as silence — no cascade, no notice', async () => {
    mocks.turnScript = { thinking: '想了想,这事没我什么可说的', says: [] }
    await sendUserMessage('@小李 登录页什么时候能好?')

    expect(says()).toHaveLength(0)
    // 写了正文没调 say 与整轮沉默走同一条静默收尾:一轮驱动、没有补救 nudge
    // (W14d 已于 2026-07-30 拆除)、无级联、无 system 行。
    expect(thinking()).toHaveLength(1)
    expect(driveCommands()).toHaveLength(1)
    expect(room().messages.some(message => message.role === 'system')).toBe(false)
  })

  it('never decorates the thinking record — the quote lands on the first say', async () => {
    mocks.turnScript = {
      thinking: '排期表看过了',
      says: [{ content: '明天下班前' }, { content: '有问题我再喊' }],
    }
    const trigger = await sendUserMessageWithInterruption()

    expect(thinking()[0].replyTo).toBeUndefined()
    expect(thinking()[0].mentions).toBeUndefined()
    // Only the FIRST utterance quotes the trigger: by the second one the
    // agent's own first line sits in between, and quoting through it loops.
    expect(says()[0].replyTo).toEqual({
      messageId: trigger.id,
      authorLabel: '用户',
      excerpt: '@小李 登录页什么时候能好?',
    })
    expect(says()[1].replyTo).toBeUndefined()
  })

  it('leaves an explicit replyTo alone (W13.2 demoted to fallback)', async () => {
    const own = { messageId: 'somewhere-else', authorLabel: '阿明', excerpt: '排期留了位置' }
    mocks.turnScript = { thinking: '引用一下阿明那句', says: [{ content: '明天下班前', replyTo: own }] }
    await sendUserMessageWithInterruption()

    // The gap WOULD have earned a fallback quote; the agent's own choice wins.
    expect(says()[0].replyTo).toEqual(own)
  })

  it('keeps the pre-W14b transcript on its old path (marker, not migration)', async () => {
    mocks.turnScript = null
    mocks.replyContent = '@阿明 你拍个板'
    await sendUserMessage('@小李 看看登录页')

    // No say, no thinking marker — the stream itself was the speech, so the
    // W14a stamp and the cascade behave exactly as they did before W14b.
    const reply = room().messages.find(message => message.role === 'assistant')!
    expect(reply.source).toBeUndefined()
    expect(reply.mentions).toEqual([{ agentId: 'pm', label: '阿明' }])
    expect(driveCommands()).toHaveLength(2)
  })
})

/**
 * The 真机 shape: someone else says something after the mention but before the
 * mentioned member's turn lands.
 */
async function sendUserMessageWithInterruption(): Promise<FakeMessage> {
  const trigger = push({ role: 'user', content: '@小李 登录页什么时候能好?' })
  push({ role: 'assistant', agentId: 'pm', content: '我这边排期已经留了位置' })
  for (const entry of [...mocks.typeListeners]) {
    if (entry.type === 'message:user-created') {
      entry.handler({ sessionId: ROOM, event: { message: trigger } })
    }
  }
  await flush()
  return trigger
}
