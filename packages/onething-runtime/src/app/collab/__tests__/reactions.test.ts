/**
 * Room message reactions, app layer — docs/design/multi-agent-collab-im.md
 * §3.5 B (W8).
 *
 * Three things a pure-logic test cannot reach:
 *  1. the write goes through the ordinary message-update chain and is announced
 *     as `message:updated` (the event the renderer already merges);
 *  2. a reaction NEVER opens a willingness round — reactions are metadata, and
 *     a reaction that judged would make one 👍 cascade into a room-wide round;
 *  3. the judgement's own `react` lands on the message that prompted it, from
 *     the silent members only, add-only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeMessage {
  id: string
  role: string
  content: string
  source?: string
  timestamp: number
  agentId?: string
  reactions?: Array<{ emoji: string; by: Array<{ type: string; agentId?: string }> }>
}

interface FakeSession {
  id: string
  name: string
  kind?: string
  room?: { memberAgentIds: string[]; pmAgentId?: string; frozen?: boolean }
  messages: FakeMessage[]
}

const AGENTS: Record<string, { id: string; name: string; avatar?: string }> = {
  pm: { id: 'pm', name: '阿明', avatar: '📋' },
  fe: { id: 'fe', name: '小李', avatar: '🔧' },
  research: { id: 'research', name: '小研', avatar: '🔎' },
}

const mocks = vi.hoisted(() => ({
  sessions: new Map<string, unknown>(),
  emitted: [] as Array<{ sessionId: string; event: { type?: string } }>,
  anyListeners: [] as Array<{ sessionId: string; handler: (envelope: unknown) => void }>,
  typeListeners: [] as Array<{ type: string; handler: (envelope: unknown) => void }>,
  updateMessageReactions: vi.fn(),
  judgeWillingness: vi.fn(async () => [] as Array<Record<string, unknown>>),
}))

vi.mock('@onething/core/storage', () => ({
  readJsonFile: <T>(_path: string, fallback: T) => fallback,
  writeJsonFile: () => {},
}))

vi.mock('../../stores/paths.js', () => ({ getStorePath: () => '/tmp/onething-collab-reactions-test' }))

vi.mock('../../usage/index.js', () => ({
  getUsageLedger: () => ({ readRecordsInRange: async () => [] }),
}))

vi.mock('../../store.js', () => ({
  updateSessionWorkingDirectory: vi.fn(),
  // P2-10: the coordinator registers a room-disposal listener at startup.
  onSessionsDeleted: () => () => {},
  getSession: (id: string) => mocks.sessions.get(id),
  getSessionsList: () => [...mocks.sessions.values()],
  getSettings: () => ({}),
  addMessage: (sessionId: string, message: FakeMessage) => {
    const session = mocks.sessions.get(sessionId) as FakeSession | undefined
    session?.messages.push(message)
  },
  updateMessageReactions: (sessionId: string, messageId: string, reactions: FakeMessage['reactions']) => {
    mocks.updateMessageReactions(sessionId, messageId, reactions)
    const session = mocks.sessions.get(sessionId) as FakeSession | undefined
    const message = session?.messages.find(candidate => candidate.id === messageId)
    if (!message) return false
    message.reactions = reactions
    return true
  },
  updateSessionAgent: vi.fn(),
  updateSessionCollab: vi.fn(() => true),
  updateSessionPermissionMode: vi.fn(() => true),
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

vi.mock('../../agents/index.js', () => ({ findAgent: (id: string) => AGENTS[id] ?? null }))

vi.mock('../board-store.js', () => ({
  forgetCollabBoardRoom: () => {},
  loadCollabBoard: () => ({ version: 1, tasks: [] }),
  getCollabSelfTaskFacts: () => [],
  shutdownCollabBoardBroadcasts: () => {},
}))

vi.mock('../willingness-runner.js', () => ({
  judgeWillingness: () => mocks.judgeWillingness(),
}))

vi.mock('../worker.js', () => ({
  forgetCollabRoomWork: () => {},
  initializeCollabWorkers: () => {},
  shutdownCollabWorkers: () => {},
  freezeRoomWork: () => {},
  resumeRoomWork: () => {},
  reconcileRoomBoard: () => {},
}))

const { reactToCollabMessage } = await import('../reactions.js')
const coordinator = await import('../coordinator.js')

const ROOM = 'room-1'

function seedRoom(messages: FakeMessage[] = []): FakeSession {
  const session: FakeSession = {
    id: ROOM,
    name: '官网改版组',
    kind: 'room',
    room: { memberAgentIds: ['pm', 'fe'] },
    messages,
  }
  mocks.sessions.set(ROOM, session)
  return session
}

function userMessage(id: string, content: string): FakeMessage {
  return { id, role: 'user', content, timestamp: Date.now() }
}

function updatedEvents() {
  return mocks.emitted.filter(entry => entry.event.type === 'message:updated')
}

function driveCommands() {
  return mocks.emitted.filter(entry => entry.event.type === 'command:send-message')
}

async function flush(): Promise<void> {
  for (let index = 0; index < 12; index++) await Promise.resolve()
}

beforeEach(() => {
  coordinator.shutdownCollabCoordinator()
  mocks.sessions.clear()
  mocks.emitted.length = 0
  mocks.anyListeners = []
  mocks.typeListeners = []
  mocks.updateMessageReactions.mockClear()
  mocks.judgeWillingness.mockReset()
  mocks.judgeWillingness.mockResolvedValue([])
})

describe('reactToCollabMessage', () => {
  it('persists through the message-update chain and broadcasts message:updated', () => {
    const session = seedRoom([userMessage('m1', '上线了')])

    const result = reactToCollabMessage(ROOM, 'm1', '🎉', { type: 'user' })

    expect(result).toEqual({ success: true, reactions: [{ emoji: '🎉', by: [{ type: 'user' }] }] })
    expect(mocks.updateMessageReactions).toHaveBeenCalledWith(ROOM, 'm1', [
      { emoji: '🎉', by: [{ type: 'user' }] },
    ])
    expect(session.messages[0].reactions).toEqual([{ emoji: '🎉', by: [{ type: 'user' }] }])
    expect(updatedEvents()).toEqual([{
      sessionId: ROOM,
      event: { type: 'message:updated', messageId: 'm1', updates: { reactions: [{ emoji: '🎉', by: [{ type: 'user' }] }] } },
    }])
  })

  it('toggles the same actor + emoji back off', () => {
    seedRoom([userMessage('m1', '上线了')])
    reactToCollabMessage(ROOM, 'm1', '👍', { type: 'user' })
    const undone = reactToCollabMessage(ROOM, 'm1', '👍', { type: 'user' })
    expect(undone.reactions).toEqual([])
  })

  it('aggregates a second actor onto the same emoji', () => {
    seedRoom([userMessage('m1', '上线了')])
    reactToCollabMessage(ROOM, 'm1', '👍', { type: 'user' })
    const result = reactToCollabMessage(ROOM, 'm1', '👍', { type: 'agent', agentId: 'fe' })
    expect(result.reactions).toEqual([
      { emoji: '👍', by: [{ type: 'user' }, { type: 'agent', agentId: 'fe' }] },
    ])
  })

  it('writes nothing at all on an add-only re-react', () => {
    seedRoom([userMessage('m1', '上线了')])
    reactToCollabMessage(ROOM, 'm1', '👍', { type: 'agent', agentId: 'fe' }, { toggle: false })
    mocks.updateMessageReactions.mockClear()
    mocks.emitted.length = 0

    const result = reactToCollabMessage(ROOM, 'm1', '👍', { type: 'agent', agentId: 'fe' }, { toggle: false })

    expect(result.success).toBe(true)
    expect(mocks.updateMessageReactions).not.toHaveBeenCalled()
    expect(updatedEvents()).toHaveLength(0)
  })

  it('refuses non-rooms, off-palette emoji, unknown messages and id-less agents', () => {
    mocks.sessions.set('chat-1', { id: 'chat-1', name: 'chat', messages: [userMessage('m1', 'hi')] })
    seedRoom([userMessage('m1', '上线了')])

    expect(reactToCollabMessage('chat-1', 'm1', '👍', { type: 'user' }).success).toBe(false)
    expect(reactToCollabMessage(ROOM, 'm1', '🚀', { type: 'user' }).success).toBe(false)
    expect(reactToCollabMessage(ROOM, 'nope', '👍', { type: 'user' }).success).toBe(false)
    expect(reactToCollabMessage(ROOM, 'm1', '👍', { type: 'agent' }).success).toBe(false)
    expect(mocks.updateMessageReactions).not.toHaveBeenCalled()
  })
})

describe('reactions never drive the room', () => {
  it('does not open a willingness round (the coordinator ignores message:updated)', async () => {
    seedRoom([userMessage('m1', '上线了')])
    coordinator.initializeCollabCoordinator()
    // Boot reconciliation re-decides the newest unprocessed message; let that
    // settle first so what follows can only be attributed to the reaction.
    await flush()
    mocks.judgeWillingness.mockClear()
    mocks.emitted.length = 0

    reactToCollabMessage(ROOM, 'm1', '👍', { type: 'user' })
    await flush()

    expect(updatedEvents()).toHaveLength(1)
    expect(mocks.judgeWillingness).not.toHaveBeenCalled()
    expect(driveCommands()).toHaveLength(0)
  })

  it('positive control: a real user message DOES open one', async () => {
    const session = seedRoom()
    coordinator.initializeCollabCoordinator()
    const message = userMessage('m9', '大家看看这个方案')
    session.messages.push(message)

    await mocks.typeListeners
      .filter(entry => entry.type === 'message:user-created')
      .map(entry => entry.handler({ sessionId: ROOM, event: { type: 'message:user-created', message } }))
      .at(0)
    await flush()

    expect(mocks.judgeWillingness).toHaveBeenCalled()
  })
})

describe('agent judgement reactions (§3.5 B point-of-light)', () => {
  it('lands a silent member’s emoji on the message that prompted the round', async () => {
    const session = seedRoom()
    mocks.judgeWillingness.mockResolvedValue([
      { agentId: 'fe', respond: false, react: '👍' },
      { agentId: 'pm', respond: false, react: null },
    ])
    coordinator.initializeCollabCoordinator()

    const message = userMessage('m9', '方案定了,周五上线')
    session.messages.push(message)
    for (const entry of mocks.typeListeners.filter(e => e.type === 'message:user-created')) {
      entry.handler({ sessionId: ROOM, event: { type: 'message:user-created', message } })
    }
    await flush()

    expect(session.messages[0].reactions).toEqual([
      { emoji: '👍', by: [{ type: 'agent', agentId: 'fe' }] },
    ])
    // Reacting is not speaking: nobody was driven.
    expect(driveCommands()).toHaveLength(0)
  })

  it('ignores the react of a member that is about to speak', async () => {
    const session = seedRoom()
    mocks.judgeWillingness.mockResolvedValue([
      { agentId: 'fe', respond: true, react: '👍' },
    ])
    coordinator.initializeCollabCoordinator()

    const message = userMessage('m9', '谁来做登录页?')
    session.messages.push(message)
    for (const entry of mocks.typeListeners.filter(e => e.type === 'message:user-created')) {
      entry.handler({ sessionId: ROOM, event: { type: 'message:user-created', message } })
    }
    await flush()

    expect(session.messages[0].reactions).toBeUndefined()
  })
})
