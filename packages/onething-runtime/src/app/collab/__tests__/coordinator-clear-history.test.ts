/**
 * 清空聊天记录 —— docs/design/collab-room-clear-and-mention-all.md B。
 *
 * 「清空」= 把这间房的**对话记忆**整体归零。它散在六处,这个文件逐处钉:
 * 房间转录、每位成员执行会话的转录与已读游标、`state.json`、`digests.json`、
 * 进程内运行时(在飞回合/判定/编排/队列)、渲染层广播。
 *
 * 另外两条同样是验收条件,而且方向相反 —— **不能**被清掉的:看板卡片、房间
 * 设置、今日已花额度。以及最后一条:清空之后这间房还得能正常起转。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeMessage {
  id: string
  role: string
  content: string
  agentId?: string
  source?: string
  timestamp: number
  mentions?: Array<{ agentId: string; label: string }>
}

interface FakeRoom {
  memberAgentIds: string[]
  formerMembers?: Array<{ agentId: string; removedAt: number }>
  frozen?: boolean
  dm?: true
  responseMode?: 'auto' | 'parallel' | 'serial'
  budgets?: { maxChain?: number; maxConcurrentTurns?: number }
}

interface FakeSession {
  id: string
  name: string
  kind?: string
  agentId?: string
  collab?: { roomSessionId?: string; seenMessageId?: string; seenAt?: number }
  room?: FakeRoom
  messages: FakeMessage[]
}

const AGENTS: Record<string, { id: string; name: string }> = {
  a: { id: 'a', name: '阿般' },
  b: { id: 'b', name: '小李' },
  z: { id: 'z', name: '老丁' },
}

const mocks = vi.hoisted(() => ({
  sessions: new Map<string, unknown>(),
  emitted: [] as Array<{ sessionId: string; event: Record<string, unknown> }>,
  anyListeners: [] as Array<{ sessionId: string; handler: (envelope: unknown) => void }>,
  typeListeners: [] as Array<{ type: string; handler: (envelope: unknown) => void }>,
  storeRoot: '',
  /** 回合被驱动时调它;不设 = 回合停在半空(用来制造"在飞回合"的窗口)。 */
  driveHandler: null as null | ((sessionId: string) => void),
  judged: [] as Array<{ roomSessionId: string; candidates: string[] }>,
  boardsCleared: [] as string[],
}))

// 真实文件系统:state.json / digests.json / board.json 三个文件的存亡正是验收项,
// 用内存桩的话"删了没有"就只能问桩,而不是问盘。
vi.mock('@onething/core/storage', async () => {
  const nodeFs = await import('node:fs')
  const nodePath = await import('node:path')
  return {
    readJsonFile: <T>(filePath: string, fallback: T): T => {
      try {
        return JSON.parse(nodeFs.readFileSync(filePath, 'utf-8')) as T
      } catch {
        return fallback
      }
    },
    writeJsonFile: (filePath: string, data: unknown) => {
      nodeFs.mkdirSync(nodePath.dirname(filePath), { recursive: true })
      nodeFs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    },
  }
})

vi.mock('../../stores/paths.js', () => ({ getStorePath: () => mocks.storeRoot }))
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
  clearSessionMessages: async (sessionId: string) => {
    const session = mocks.sessions.get(sessionId) as FakeSession | undefined
    if (!session) return { cleared: false, clearedCount: 0 }
    const clearedCount = session.messages.length
    session.messages.length = 0
    return { cleared: true, clearedCount, archivePath: `${sessionId}/messages.cleared.jsonl` }
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
  updateSessionArchived: vi.fn(),
  updateSessionAgent: () => true,
  updateSessionCollab: (
    id: string,
    fields: { kind?: string | null; collab?: FakeSession['collab'] | null; room?: FakeRoom },
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
    abort: (sessionId: string) => emitOn(sessionId, { type: 'stream:aborted' }),
    steerMessage: () => {},
    retractSteerMessage: () => true,
  }),
}))

vi.mock('../../agents/index.js', () => ({ findAgent: (id: string) => AGENTS[id] ?? null }))

vi.mock('../board-store.js', () => ({
  forgetCollabBoardRoom: () => {},
  loadCollabBoard: () => ({ version: 1, tasks: [] }),
  shutdownCollabBoardBroadcasts: () => {},
  getCollabSelfTaskFacts: () => [],
  applyBoardAction: async () => ({ board: { version: 1, tasks: [] } }),
  // 真清空由 board-store.test.ts 验;这里只关心"清历史有没有喊它"。
  clearCollabBoard: async (roomSessionId: string) => {
    mocks.boardsCleared.push(roomSessionId)
    return { clearedTaskCount: 2 }
  },
}))

vi.mock('../digest-runner.js', () => ({ ensureCollabDigestsForRoom: async () => {} }))

vi.mock('../willingness-runner.js', () => ({
  judgeWillingness: async (roomSessionId: string, candidates: Array<{ id: string }>) => {
    mocks.judged.push({ roomSessionId, candidates: candidates.map(candidate => candidate.id) })
    return []
  },
}))

vi.mock('../planner.js', () => ({
  requestCollabPlan: async () => ({ plan: null, failure: 'unparsable' }),
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
const { peekRoomRuntime, roomRuntime } = await import('../room-runtime.js')

const ROOM = 'room-1'
let nextId = 0
let driveOrder: string[] = []

function room(): FakeSession {
  return mocks.sessions.get(ROOM) as FakeSession
}

function execSessionId(agentId: string): string {
  return `agent-exec-${agentId}-${ROOM}`
}

function collabDir(): string {
  return path.join(mocks.storeRoot, 'collab', ROOM)
}

function push(message: Omit<FakeMessage, 'id' | 'timestamp'> & { id?: string }): FakeMessage {
  const full: FakeMessage = { id: message.id ?? `m-${++nextId}`, timestamp: Date.now(), ...message }
  room().messages.push(full)
  return full
}

function emitOn(sessionId: string, event: Record<string, unknown>): void {
  for (const entry of [...mocks.anyListeners]) {
    if (entry.sessionId === sessionId) entry.handler({ sessionId, event })
  }
}

function deliver(message: FakeMessage): void {
  for (const entry of [...mocks.typeListeners]) {
    if (entry.type === 'message:user-created') entry.handler({ sessionId: ROOM, event: { message } })
  }
}

async function flush(): Promise<void> {
  for (let round = 0; round < 80; round++) {
    for (let index = 0; index < 20; index++) await Promise.resolve()
    await new Promise(resolve => setTimeout(resolve, 0))
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

/** 回合说一句就收尾(正常路径)。 */
function bindSpeakingEngine(): void {
  mocks.driveHandler = (sessionId: string) => {
    const agentId = sessionId.replace('agent-exec-', '').replace(/-room-\d+$/, '')
    driveOrder.push(agentId)
    setTimeout(() => {
      const exec = mocks.sessions.get(sessionId) as FakeSession | undefined
      exec?.messages.push({
        id: `m-${++nextId}`,
        role: 'assistant',
        agentId,
        content: '(想了想)',
        source: 'collab-turn',
        timestamp: Date.now(),
      })
      push({ role: 'assistant', agentId, content: '好的', source: 'collab-say' })
      emitOn(sessionId, { type: 'stream:start' })
      emitOn(sessionId, { type: 'stream:complete' })
    }, 0)
  }
}

/** 回合起跑后**停在半空** —— 只有 abort 能把它结束掉。 */
function bindHangingEngine(): void {
  mocks.driveHandler = (sessionId: string) => {
    const agentId = sessionId.replace('agent-exec-', '').replace(/-room-\d+$/, '')
    driveOrder.push(agentId)
    setTimeout(() => emitOn(sessionId, { type: 'stream:start' }), 0)
  }
}

function seedRoom(patch: Partial<FakeRoom> = {}): void {
  mocks.sessions.set(ROOM, {
    id: ROOM,
    name: '官网改版组',
    kind: 'room',
    room: { memberAgentIds: ['a', 'b'], responseMode: 'parallel', ...patch },
    messages: [],
  } satisfies FakeSession)
}

function seedExecSession(agentId: string, seenMessageId?: string): FakeSession {
  const session: FakeSession = {
    id: execSessionId(agentId),
    name: `[执行] ${AGENTS[agentId]?.name ?? agentId}`,
    kind: 'agent',
    agentId,
    collab: {
      roomSessionId: ROOM,
      ...(seenMessageId ? { seenMessageId, seenAt: 1 } : {}),
    },
    messages: [
      {
        id: `exec-${agentId}-1`,
        role: 'user',
        content: '(drive)',
        source: 'collab-drive',
        timestamp: 1,
      },
    ],
  }
  mocks.sessions.set(session.id, session)
  return session
}

beforeEach(() => {
  coordinator.shutdownCollabCoordinator()
  mocks.storeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'onething-clear-history-'))
  mocks.sessions.clear()
  mocks.emitted.length = 0
  mocks.anyListeners = []
  mocks.typeListeners = []
  mocks.judged.length = 0
  mocks.boardsCleared.length = 0
  driveOrder = []
  nextId = 0
  bindSpeakingEngine()
})

afterEach(() => {
  fs.rmSync(mocks.storeRoot, { recursive: true, force: true })
})

describe('clearCollabRoomHistory', () => {
  it('六处一起归零:房间转录、成员执行会话、游标、state、digests、「刚才」', async () => {
    seedRoom({ formerMembers: [{ agentId: 'z', removedAt: 1 }] })
    seedExecSession('a', 'm-1')
    seedExecSession('b', 'm-1')
    seedExecSession('z', 'm-1')
    coordinator.initializeCollabCoordinator()
    await sendUserMessage('@阿般 看一下', [{ agentId: 'a', label: '阿般' }])
    fs.mkdirSync(collabDir(), { recursive: true })
    fs.writeFileSync(path.join(collabDir(), 'digests.json'), '{"version":1,"days":{}}', 'utf-8')
    expect(room().messages.length).toBeGreaterThan(0)

    const result = await coordinator.clearCollabRoomHistory(ROOM)

    expect(result.success).toBe(true)
    expect(room().messages).toEqual([])
    // 曾在册的同事也算数:它的执行会话里同样躺着这间房的历史,而它随时会被拉回来。
    for (const agentId of ['a', 'b', 'z']) {
      const exec = mocks.sessions.get(execSessionId(agentId)) as FakeSession
      expect(exec.messages).toEqual([])
      expect(exec.collab?.seenMessageId).toBeUndefined()
      expect(exec.collab?.seenAt).toBeUndefined()
      expect(exec.collab?.roomSessionId).toBe(ROOM)
    }
    expect(result.clearedSessionCount).toBe(3)

    const state = JSON.parse(fs.readFileSync(path.join(collabDir(), 'state.json'), 'utf-8'))
    expect(state.chainCount).toBe(0)
    expect(state.activations).toEqual([])
    expect(state.plan).toBeUndefined()
    expect(state.lastProcessedMessageId).toBeUndefined()
    expect(state.lastProcessedAt).toBeUndefined()
    // floorEpoch 刻意**不**归零:归零的话,一条在飞回合级联出来的激活会盖上 0 号
    // 世代、被判成"当前的",于是它开口说的第一句落进一间刚被清空的房。
    expect(state.floorEpoch).toBeGreaterThan(0)

    expect(fs.existsSync(path.join(collabDir(), 'digests.json'))).toBe(false)
    expect(coordinator.getCollabCoordinatorState(ROOM)?.log).toEqual([])
  })

  it('全局 legacy 执行会话**不清** —— 它是所有房共用的,清房 A 会误伤房 B(四审 A-4)', async () => {
    seedRoom()
    seedExecSession('a')
    mocks.sessions.set('agent-exec-a', {
      id: 'agent-exec-a',
      name: '[执行] 阿般(legacy)',
      kind: 'agent',
      agentId: 'a',
      messages: [
        { id: 'legacy-1', role: 'user', content: '别的房间的历史', source: 'collab-drive', timestamp: 1 },
      ],
    } satisfies FakeSession)
    coordinator.initializeCollabCoordinator()
    await sendUserMessage('@阿般 在吗', [{ agentId: 'a', label: '阿般' }])

    await coordinator.clearCollabRoomHistory(ROOM)

    expect((mocks.sessions.get('agent-exec-a') as FakeSession).messages).toHaveLength(1)
    expect((mocks.sessions.get(execSessionId('a')) as FakeSession).messages).toEqual([])
  })

  it('includeMemberDms:连带清空成员两两之间的私聊房,外人的私聊不动', async () => {
    seedRoom()
    seedExecSession('a')
    seedExecSession('b')
    mocks.sessions.set('dm-ab', {
      id: 'dm-ab',
      name: '阿般 ⇄ 小李',
      kind: 'room',
      room: { memberAgentIds: ['a', 'b'], dm: true },
      messages: [
        { id: 'dm-1', role: 'assistant', agentId: 'a', content: '🐺 你是狼人', source: 'collab-say', timestamp: 1 },
      ],
    } satisfies FakeSession)
    mocks.sessions.set('dm-ac', {
      id: 'dm-ac',
      name: '阿般 ⇄ 外人',
      kind: 'room',
      room: { memberAgentIds: ['a', 'c'], dm: true },
      messages: [
        { id: 'dm-2', role: 'assistant', agentId: 'a', content: '别的群语境的私聊', source: 'collab-say', timestamp: 1 },
      ],
    } satisfies FakeSession)
    coordinator.initializeCollabCoordinator()
    await sendUserMessage('@阿般 在吗', [{ agentId: 'a', label: '阿般' }])

    const result = await coordinator.clearCollabRoomHistory(ROOM, { includeMemberDms: true })

    expect(result.success).toBe(true)
    expect(result.clearedDmRoomCount).toBe(1)
    expect((mocks.sessions.get('dm-ab') as FakeSession).messages).toEqual([])
    expect((mocks.sessions.get('dm-ac') as FakeSession).messages).toHaveLength(1)
  })

  it('先停后删:在飞回合被中止,而且一个字都写不回来', async () => {
    seedRoom()
    seedExecSession('a')
    bindHangingEngine()
    coordinator.initializeCollabCoordinator()
    await sendUserMessage('@阿般 看一下', [{ agentId: 'a', label: '阿般' }])
    const runtime = peekRoomRuntime(ROOM)!
    expect(runtime.activeTurns.size).toBe(1)

    await coordinator.clearCollabRoomHistory(ROOM)
    await flush()

    // 中止的回合会写一行「未能应答(已被中止)」—— 它发生在**删之前**,
    // 所以清空之后房里应该什么都没有。删完再有东西冒出来就是次序错了。
    expect(runtime.activeTurns.size).toBe(0)
    expect(room().messages).toEqual([])
    expect(runtime.queue).toEqual([])
    expect(runtime.inFlight.size).toBe(0)
  })

  it('看板一并清:卡片留着的话,同事下一句就在谈一段谁都读不到的工作', async () => {
    seedRoom()
    seedExecSession('a')
    coordinator.initializeCollabCoordinator()

    const result = await coordinator.clearCollabRoomHistory(ROOM)

    expect(mocks.boardsCleared).toEqual([ROOM])
    expect(result.clearedTaskCount).toBe(2)
  })

  it('不动房间设置与今日已花额度', async () => {
    seedRoom({ budgets: { maxChain: 7 } })
    seedExecSession('a')
    coordinator.initializeCollabCoordinator()
    const runtime = roomRuntime(ROOM)
    runtime.budgetSpentUSD = 3.5
    runtime.budgetNoticeDay = '2026-08-02'

    await coordinator.clearCollabRoomHistory(ROOM)

    expect(room().room?.budgets?.maxChain).toBe(7)
    expect(room().room?.memberAgentIds).toEqual(['a', 'b'])
    expect(runtime.budgetSpentUSD).toBe(3.5)
    expect(runtime.budgetNoticeDay).toBe('2026-08-02')
  })

  it('清空之后这间房照常起转', async () => {
    seedRoom()
    seedExecSession('a')
    coordinator.initializeCollabCoordinator()
    await sendUserMessage('@阿般 看一下', [{ agentId: 'a', label: '阿般' }])
    await coordinator.clearCollabRoomHistory(ROOM)
    driveOrder = []

    await sendUserMessage('@阿般 再看一下', [{ agentId: 'a', label: '阿般' }])

    expect(driveOrder).toEqual(['a'])
    expect(room().messages.some(message => message.source === 'collab-say')).toBe(true)
  })

  it('广播 messages:replaced,房间与每条执行会话各一次', async () => {
    seedRoom()
    seedExecSession('a')
    seedExecSession('b')
    coordinator.initializeCollabCoordinator()
    await sendUserMessage('大家早')
    mocks.emitted.length = 0

    await coordinator.clearCollabRoomHistory(ROOM)

    const replaced = mocks.emitted.filter(entry => entry.event.type === 'messages:replaced')
    expect(replaced.map(entry => entry.sessionId).sort()).toEqual(
      [ROOM, execSessionId('a'), execSessionId('b')].sort(),
    )
    expect(replaced.every(entry => Array.isArray(entry.event.messages)
      && (entry.event.messages as unknown[]).length === 0)).toBe(true)
  })

  it('不是房间就拒掉', async () => {
    mocks.sessions.set('chat-1', { id: 'chat-1', name: '普通会话', messages: [] })
    coordinator.initializeCollabCoordinator()
    expect(await coordinator.clearCollabRoomHistory('chat-1')).toEqual({
      success: false,
      error: 'Not a room session',
    })
  })
})
