/**
 * R5 / P2-10 — what a deleted room takes with it, and the lock that used to
 * outlive every agent that ever spoke.
 *
 * `rooms`, the board write queue and the worker's pending list were all
 * only-ever-added-to, and `<store>/collab/<roomId>/` outlived the session
 * entirely: delete a room and its board, its audit trail and its watermark
 * stayed on disk forever under an id nothing would ever look up again.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeSession {
  id: string
  name: string
  kind?: string
  agentId?: string
  isArchived?: boolean
  collab?: { roomSessionId?: string }
  room?: { memberAgentIds: string[]; pmAgentId?: string; frozen?: boolean }
  messages: Array<{ id: string; role: string; content: string; timestamp: number; source?: string }>
}

const AGENTS: Record<string, { id: string; name: string }> = {
  pm: { id: 'pm', name: '阿明' },
  fe: { id: 'fe', name: '小李' },
}

const mocks = vi.hoisted(() => ({
  sessions: new Map<string, unknown>(),
  deleteListeners: [] as Array<(ids: readonly string[]) => void>,
  removed: [] as string[],
  aborted: [] as string[],
  forgottenWork: [] as string[],
  forgottenBoards: [] as string[],
  emitted: [] as Array<{ sessionId: string; event: Record<string, unknown> }>,
  anyListeners: [] as Array<{ sessionId: string; handler: (envelope: unknown) => void }>,
  typeListeners: [] as Array<{ type: string; handler: (envelope: unknown) => void }>,
  stateFiles: new Map<string, unknown>(),
}))

vi.mock('node:fs', () => ({
  default: {
    rmSync: (target: string) => { mocks.removed.push(target) },
    mkdirSync: () => {},
    appendFileSync: () => {},
    existsSync: () => false,
  },
}))

vi.mock('@onething/core/storage', () => ({
  readJsonFile: <T>(filePath: string, fallback: T) => (mocks.stateFiles.get(filePath) as T) ?? fallback,
  writeJsonFile: (filePath: string, data: unknown) => {
    mocks.stateFiles.set(filePath, JSON.parse(JSON.stringify(data)))
  },
}))

vi.mock('../../stores/paths.js', () => ({ getStorePath: () => '/store' }))

vi.mock('../../usage/index.js', () => ({
  getUsageLedger: () => ({ readRecordsInRange: async () => [] }),
}))

vi.mock('../../store.js', () => ({
  updateSessionWorkingDirectory: vi.fn(),
  onSessionsDeleted: (listener: (ids: readonly string[]) => void) => {
    mocks.deleteListeners.push(listener)
    return () => {
      mocks.deleteListeners = mocks.deleteListeners.filter(entry => entry !== listener)
    }
  },
  getSession: (id: string) => mocks.sessions.get(id),
  getSessionsList: () => [...mocks.sessions.values()],
  addMessage: (sessionId: string, message: FakeSession['messages'][number]) => {
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
  updateSessionArchived: () => {},
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
    abort: (sessionId: string) => { mocks.aborted.push(sessionId) },
  }),
}))

vi.mock('../../agents/index.js', () => ({ findAgent: (id: string) => AGENTS[id] ?? null }))

vi.mock('../board-store.js', () => ({
  loadCollabBoard: () => ({ version: 1, tasks: [] }),
  shutdownCollabBoardBroadcasts: () => {},
  forgetCollabBoardRoom: (id: string) => { mocks.forgottenBoards.push(id) },
}))

vi.mock('../willingness-runner.js', () => ({ judgeWillingness: async () => [] }))

vi.mock('../worker.js', () => ({
  initializeCollabWorkers: () => {},
  shutdownCollabWorkers: () => {},
  freezeRoomWork: () => {},
  resumeRoomWork: () => {},
  reconcileRoomBoard: () => {},
  forgetCollabRoomWork: (id: string) => { mocks.forgottenWork.push(id) },
}))

const coordinator = await import('../coordinator.js')
const roomRuntime = await import('../room-runtime.js')
const { COLLAB_DEFAULT_MAX_CHAIN } = await import('@onething/runtime/collab')
const turn = await import('../turn.js')

const ROOM = 'room-1'

function deleteSessions(...ids: string[]): void {
  for (const listener of [...mocks.deleteListeners]) listener(ids)
}

beforeEach(() => {
  coordinator.shutdownCollabCoordinator()
  mocks.sessions.clear()
  mocks.deleteListeners = []
  mocks.removed.length = 0
  mocks.aborted.length = 0
  mocks.forgottenWork.length = 0
  mocks.forgottenBoards.length = 0
  mocks.emitted.length = 0
  mocks.anyListeners = []
  mocks.typeListeners = []
  mocks.stateFiles.clear()
  mocks.sessions.set(ROOM, {
    id: ROOM,
    name: '官网改版组',
    kind: 'room',
    room: { memberAgentIds: ['pm', 'fe'], pmAgentId: 'pm' },
    messages: [],
  } satisfies FakeSession)
  coordinator.initializeCollabCoordinator()
})

describe('R5 — 删房清理 (P2-10)', () => {
  it('takes the runtime, the board machinery, the workers and the directory with it', () => {
    // Materialise a runtime and a persisted state file for the room.
    const runtime = roomRuntime.roomRuntime(ROOM)
    roomRuntime.advanceWatermark(runtime, { id: 'm-1', timestamp: 1000 })
    roomRuntime.persistRoomState(ROOM, runtime)
    expect(roomRuntime.peekRoomRuntime(ROOM)).toBeDefined()

    deleteSessions(ROOM)

    expect(roomRuntime.peekRoomRuntime(ROOM)).toBeUndefined()
    expect(mocks.forgottenWork).toEqual([ROOM])
    expect(mocks.forgottenBoards).toEqual([ROOM])
    expect(mocks.removed).toEqual(['/store/collab/room-1'])
  })

  it('stops a turn the room still had in flight', () => {
    deleteSessions(ROOM)
    // abortRoomTurn is part of the disposal, so at minimum the room session is
    // told to stop — a live execution session would be aborted first.
    expect(mocks.aborted).toContain(ROOM)
  })

  it('is harmless for a session that never had collab state', () => {
    expect(() => deleteSessions('chat-42')).not.toThrow()
    expect(mocks.removed).toEqual(['/store/collab/chat-42'])
    expect(mocks.forgottenWork).toEqual(['chat-42'])
  })

  it('handles a cascade delete — every id in the batch is disposed', () => {
    deleteSessions(ROOM, 'work-1', 'work-2')
    expect(mocks.forgottenWork).toEqual([ROOM, 'work-1', 'work-2'])
  })

  it('stops listening after shutdown', () => {
    coordinator.shutdownCollabCoordinator()
    deleteSessions(ROOM)
    expect(mocks.forgottenWork).toEqual([])
  })
})

describe('R5 — agent 锁自清 (P2-10)', () => {
  it('leaves the map empty once every queued turn has run', async () => {
    expect(turn.agentSessionLockCount()).toBe(0)

    // Two turns queued on the same agent, interleaved: the second must find the
    // first's gate (so it waits), and the map must be empty once both are done.
    let releaseFirst!: () => void
    const first = new Promise<void>(resolve => { releaseFirst = resolve })
    const order: string[] = []

    const a = turn.withAgentSessionLockForTest('agent-exec-fe', async () => {
      order.push('a:start')
      await first
      order.push('a:end')
    })
    const b = turn.withAgentSessionLockForTest('agent-exec-fe', async () => {
      order.push('b:start')
    })

    // While a holds it and b is queued, the key is very much still needed.
    expect(turn.agentSessionLockCount()).toBe(1)
    releaseFirst()
    await Promise.all([a, b])

    expect(order).toEqual(['a:start', 'a:end', 'b:start'])
    expect(turn.agentSessionLockCount()).toBe(0)
  })

  it('does not leak a key when the turn throws', async () => {
    await expect(turn.withAgentSessionLockForTest('agent-exec-pm', async () => {
      throw new Error('turn exploded')
    })).rejects.toThrow('turn exploded')

    expect(turn.agentSessionLockCount()).toBe(0)
  })
})

describe('maxChainFor —— 链长闸的三档语义', () => {
  const room = (budgets?: { maxChain?: number }) =>
    roomRuntime.maxChainFor({
      id: 'room-1',
      kind: 'room',
      room: { memberAgentIds: ['fe'], ...(budgets ? { budgets } : {}) },
      messages: [],
    } as unknown as Parameters<typeof roomRuntime.maxChainFor>[0])

  it('没配过 → 默认值', () => {
    expect(room()).toBe(COLLAB_DEFAULT_MAX_CHAIN)
    expect(room({})).toBe(COLLAB_DEFAULT_MAX_CHAIN)
  })

  it('0 = 关闭该闸,不是"回落默认"', () => {
    // CollabRoomBudgets 的注释一直写着 0 = 关闭,而代码此前把 0 读成"没配"。
    // 填 0 的人拿到的是默认值而不是不限 —— 文档与行为对不上的那一类 bug。
    expect(room({ maxChain: 0 })).toBe(Number.POSITIVE_INFINITY)
  })

  it('正数原样生效,没有隐形天花板', () => {
    expect(room({ maxChain: 3 })).toBe(3)
    // 此前有一道 min(cap, 默认×4) 的夹取:填 500 实际得到 32,且无人告知。
    expect(room({ maxChain: 500 })).toBe(500)
  })

  it('负数按"没配"处理 —— 它既不是上限也不是关闭', () => {
    expect(room({ maxChain: -1 })).toBe(COLLAB_DEFAULT_MAX_CHAIN)
  })
})
