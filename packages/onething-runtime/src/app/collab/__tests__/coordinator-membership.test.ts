/**
 * Team settings + membership semantics — docs/design/multi-agent-collab-im.md
 * §4 W6 / §3.5 C.
 *
 * Two things are asserted here that a pure-logic test cannot reach:
 *  1. setCollabRoomConfig validates atomically and posts the 群公告 lines with
 *     the MEMBERSHIP source (the source is what lets the model read them).
 *  2. A member removed from the roster never takes the floor again: an
 *     activation already sitting in the queue is dropped at drive time, so the
 *     room emits no send-message for it. The positive control (a still-member
 *     activation DOES drive) keeps that assertion from being vacuous.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { COLLAB_SYSTEM_SOURCE_MEMBERSHIP } from '@onething/runtime/collab'

interface FakeSession {
  id: string
  name: string
  kind?: string
  permissionMode?: string
  room?: { memberAgentIds: string[]; pmAgentId?: string; frozen?: boolean }
  messages: Array<{ id: string; role: string; content: string; source?: string; timestamp: number }>
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
  workerHost: null as null | Record<string, (...args: never[]) => unknown>,
  renameSession: vi.fn(),
  updateSessionCollab: vi.fn((_sessionId: string, _fields: unknown) => true),
  updateSessionPermissionMode: vi.fn((_sessionId: string, _mode: string) => true),
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
  addMessage: (sessionId: string, message: { id: string }) => {
    const session = mocks.sessions.get(sessionId) as FakeSession | undefined
    session?.messages.push(message as FakeSession['messages'][number])
  },
  // W18: a drive first ensures the speaking agent's execution session.
  createSession: (id: string, name: string) => {
    const session = { id, name, messages: [] } as unknown as FakeSession
    mocks.sessions.set(id, session)
    return session
  },
  getCurrentSessionId: () => undefined,
  setCurrentSessionId: vi.fn(),
  updateSessionArchived: vi.fn(),
  updateSessionAgent: vi.fn(),
  updateSessionCollab: (
    sessionId: string,
    fields: { room?: FakeSession['room']; kind?: string | null; collab?: unknown },
  ) => {
    const session = mocks.sessions.get(sessionId) as FakeSession | undefined
    if (session && fields.room) session.room = fields.room
    if (session && fields.kind !== undefined) {
      (session as { kind?: string }).kind = fields.kind ?? undefined
    }
    if (session && fields.collab !== undefined) {
      (session as { collab?: unknown }).collab = fields.collab ?? undefined
    }
    return mocks.updateSessionCollab(sessionId, fields)
  },
  updateSessionPermissionMode: (sessionId: string, mode: string) => {
    const session = mocks.sessions.get(sessionId) as FakeSession | undefined
    if (session) session.permissionMode = mode
    return mocks.updateSessionPermissionMode(sessionId, mode)
  },
  renameSession: (sessionId: string, name: string) => {
    const session = mocks.sessions.get(sessionId) as FakeSession | undefined
    if (session) session.name = name
    mocks.renameSession(sessionId, name)
  },
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
  shutdownCollabBoardBroadcasts: () => {},
}))

vi.mock('../willingness-runner.js', () => ({ judgeWillingness: async () => [] }))

vi.mock('../worker.js', () => ({
  forgetCollabRoomWork: () => {},
  initializeCollabWorkers: (host: Record<string, (...args: never[]) => unknown>) => {
    mocks.workerHost = host
  },
  shutdownCollabWorkers: () => {},
  freezeRoomWork: () => {},
  resumeRoomWork: () => {},
  reconcileRoomBoard: () => {},
}))

const coordinator = await import('../coordinator.js')

const ROOM = 'room-1'

function seedRoom(room: FakeSession['room']): FakeSession {
  const session: FakeSession = { id: ROOM, name: '官网改版组', kind: 'room', room, messages: [] }
  mocks.sessions.set(ROOM, session)
  return session
}

function membershipLines(): string[] {
  const session = mocks.sessions.get(ROOM) as FakeSession | undefined
  return (session?.messages ?? [])
    .filter(message => message.source === COLLAB_SYSTEM_SOURCE_MEMBERSHIP)
    .map(message => message.content)
}

function driveCommands(): Array<{ sessionId: string; event: { type?: string } }> {
  return mocks.emitted.filter(entry => entry.event.type === 'command:send-message')
}

async function flush(): Promise<void> {
  for (let index = 0; index < 8; index++) await Promise.resolve()
}

beforeEach(() => {
  coordinator.shutdownCollabCoordinator()
  mocks.sessions.clear()
  mocks.emitted.length = 0
  mocks.anyListeners = []
  mocks.typeListeners = []
  mocks.workerHost = null
  mocks.renameSession.mockClear()
  mocks.updateSessionCollab.mockClear()
  mocks.updateSessionPermissionMode.mockClear()
})

describe('setCollabRoomConfig — validation', () => {
  it('refuses a session that is not a room', () => {
    mocks.sessions.set('chat-1', { id: 'chat-1', name: 'chat', messages: [] })
    expect(coordinator.setCollabRoomConfig('chat-1', { name: 'x' })).toEqual({
      success: false,
      error: 'Not a room session',
    })
  })

  it('refuses an unknown agent and writes nothing', () => {
    seedRoom({ memberAgentIds: ['pm'] })
    expect(coordinator.setCollabRoomConfig(ROOM, { memberAgentIds: ['pm', 'ghost'] })).toEqual({
      success: false,
      error: 'Unknown agent: ghost',
    })
    expect(mocks.updateSessionCollab).not.toHaveBeenCalled()
    expect(membershipLines()).toEqual([])
  })

  it('refuses an empty roster and an empty name', () => {
    seedRoom({ memberAgentIds: ['pm'] })
    expect(coordinator.setCollabRoomConfig(ROOM, { memberAgentIds: [] }).error)
      .toBe('Room needs at least one member agent')
    expect(coordinator.setCollabRoomConfig(ROOM, { name: '   ' }).error).toBe('Room name cannot be empty')
  })

  it('refuses a PM who is not a member, and an unknown permission mode', () => {
    seedRoom({ memberAgentIds: ['pm', 'fe'] })
    expect(coordinator.setCollabRoomConfig(ROOM, { pmAgentId: 'research' }).error)
      .toBe('PM must be a room member')
    expect(coordinator.setCollabRoomConfig(ROOM, { memberAgentIds: ['fe'], pmAgentId: 'pm' }).error)
      .toBe('PM must be a room member')
    expect(coordinator.setCollabRoomConfig(ROOM, {
      permissionMode: 'yolo' as never,
    }).error).toBe('Invalid permission mode: yolo')
  })
})

describe('setCollabRoomConfig — 群公告', () => {
  it('announces joins, then removals, then the new PM', () => {
    seedRoom({ memberAgentIds: ['pm', 'fe'] })
    const result = coordinator.setCollabRoomConfig(ROOM, {
      memberAgentIds: ['pm', 'research'],
      pmAgentId: 'research',
    })
    expect(result).toEqual({ success: true })
    expect(membershipLines()).toEqual([
      '🔎 小研 加入了群聊',
      '小李 已被移出群聊',
      '小研 成为群负责人',
    ])
  })

  it('clears the PM when the PM is removed, without a dangling pmAgentId', () => {
    seedRoom({ memberAgentIds: ['pm', 'fe'], pmAgentId: 'pm' })
    expect(coordinator.setCollabRoomConfig(ROOM, { memberAgentIds: ['fe'] })).toEqual({ success: true })
    const session = mocks.sessions.get(ROOM) as FakeSession
    expect(session.room?.pmAgentId).toBeUndefined()
    expect(membershipLines()).toEqual(['阿明 已被移出群聊', '群里暂时没有负责人'])
  })

  it('says nothing when nothing changed', () => {
    seedRoom({ memberAgentIds: ['pm', 'fe'], pmAgentId: 'pm' })
    expect(coordinator.setCollabRoomConfig(ROOM, {
      name: '官网改版组',
      memberAgentIds: ['fe', 'pm'],
      pmAgentId: 'pm',
    })).toEqual({ success: true })
    expect(membershipLines()).toEqual([])
    expect(mocks.updateSessionCollab).not.toHaveBeenCalled()
    expect(mocks.renameSession).not.toHaveBeenCalled()
  })

  it('routes rename and permission mode to their own store writes', () => {
    seedRoom({ memberAgentIds: ['pm'] })
    expect(coordinator.setCollabRoomConfig(ROOM, {
      name: '  新名字  ',
      permissionMode: 'dangerously-allow-all',
    })).toEqual({ success: true })
    expect(mocks.renameSession).toHaveBeenCalledWith(ROOM, '新名字')
    expect(mocks.updateSessionPermissionMode).toHaveBeenCalledWith(ROOM, 'dangerously-allow-all')
    expect(membershipLines()).toEqual([])
  })
})

describe('removed members stop taking the floor', () => {
  it('drops a queued activation whose agent is no longer a member', async () => {
    seedRoom({ memberAgentIds: ['pm', 'research'] })
    coordinator.initializeCollabCoordinator()
    expect(mocks.workerHost).toBeTruthy()

    coordinator.setCollabRoomConfig(ROOM, { memberAgentIds: ['pm'] })
    mocks.emitted.length = 0
    // Enqueue happens through the worker host seam (delivery/review activations).
    ;(mocks.workerHost as { enqueueRoomActivation: (room: string, agentId: string, reason: string) => void })
      .enqueueRoomActivation(ROOM, 'research', 'task-event')
    await flush()

    expect(driveCommands()).toEqual([])
  })

  it('positive control: a still-member activation does drive', async () => {
    seedRoom({ memberAgentIds: ['pm', 'research'] })
    coordinator.initializeCollabCoordinator()
    mocks.emitted.length = 0
    ;(mocks.workerHost as { enqueueRoomActivation: (room: string, agentId: string, reason: string) => void })
      .enqueueRoomActivation(ROOM, 'research', 'task-event')
    await flush()

    expect(driveCommands()).toHaveLength(1)
    expect(String((driveCommands()[0].event as { content?: string }).content)).toContain('小研')
  })
})
