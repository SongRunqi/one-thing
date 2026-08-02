/**
 * 协调器状态条的后端半边(docs/design/collab-coordinator-inspector.md)。
 *
 * 钉三件事:快照读的是**运行时本身**(不是第二本账)、「刚才」是定长的、
 * 广播按秒节流但**不丢最后一帧**——最后那一次通常正是"停下来了"这种最该被看见
 * 的状态,丢了界面就永远停在倒数第二帧。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeSession {
  id: string
  name: string
  kind?: string
  room?: {
    memberAgentIds: string[]
    frozen?: boolean
    responseMode?: 'auto' | 'parallel' | 'serial'
    speakOrder?: string[]
    relayLoops?: number
    budgets?: { maxChain?: number; maxConcurrentTurns?: number; dailyCostUSD?: number }
  }
  messages: unknown[]
}

const AGENTS: Record<string, { id: string; name: string; status?: string }> = {
  a: { id: 'a', name: '阿般' },
  b: { id: 'b', name: '小李' },
  c: { id: 'c', name: 'Iris' },
}

const mocks = vi.hoisted(() => ({
  sessions: new Map<string, unknown>(),
  emitted: [] as Array<{ sessionId: string; event: Record<string, unknown> }>,
}))

vi.mock('@onething/core/storage', () => ({
  readJsonFile: <T>(_path: string, fallback: T) => fallback,
  writeJsonFile: () => {},
}))

vi.mock('../../stores/paths.js', () => ({ getStorePath: () => '/tmp/onething-collab-inspector' }))

vi.mock('../../store.js', () => ({
  // drive 现在要渲染用户署名(v3 V1),因此读一次设置里的身份。
  getSettings: () => ({}),
  getSession: (id: string) => mocks.sessions.get(id),
  getSessionsList: () => [...mocks.sessions.values()],
  addMessage: () => {},
  updateSessionAgent: () => true,
}))

vi.mock('../../events/index.js', () => ({
  getEventBus: () => ({
    emit: async (sessionId: string, event: Record<string, unknown>) => {
      mocks.emitted.push({ sessionId, event })
    },
  }),
}))

vi.mock('../../engine/index.js', () => ({ getStreamEngineSafe: () => undefined }))
vi.mock('../../agents/index.js', () => ({ findAgent: (id: string) => AGENTS[id] ?? null }))

const {
  broadcastCollabCoordinator,
  buildCollabCoordinatorState,
  forgetCollabInspector,
  noteCollabSchedule,
  shutdownCollabInspector,
  COLLAB_LOG_LIMIT,
} = await import('../inspector.js')
const { roomRuntime, clearRoomRuntimes } = await import('../room-runtime.js')

const ROOM = 'room-1'

function seed(room: Partial<NonNullable<FakeSession['room']>> = {}): void {
  mocks.sessions.set(ROOM, {
    id: ROOM,
    name: '官网改版组',
    kind: 'room',
    room: { memberAgentIds: ['a', 'b', 'c'], ...room },
    messages: [],
  } satisfies FakeSession)
}

function events(): Array<Record<string, unknown>> {
  return mocks.emitted
    .filter(entry => entry.event.type === 'collab:coordinator-changed')
    .map(entry => entry.event)
}

beforeEach(() => {
  vi.useRealTimers()
  shutdownCollabInspector()
  clearRoomRuntimes()
  mocks.sessions.clear()
  mocks.emitted.length = 0
  seed()
})

describe('快照', () => {
  it('不是房间会话 → 没有状态可谈', () => {
    mocks.sessions.set('chat-1', { id: 'chat-1', name: '直聊', messages: [] })
    expect(buildCollabCoordinatorState('chat-1')).toBeNull()
    expect(buildCollabCoordinatorState('nope')).toBeNull()
  })

  it('运行时还没建起来时也给完整快照 —— "读不到"和"空闲"在界面上必须一模一样', () => {
    const snapshot = buildCollabCoordinatorState(ROOM)
    expect(snapshot).toMatchObject({
      mode: 'parallel',
      frozen: false,
      turns: [],
      queue: [],
      judging: 0,
      plan: null,
    })
    expect(snapshot?.gates.chain.max).toBe(32)
  })

  it('读的是运行时本身:在跑 / 排队 / 判定在飞 / 链长', () => {
    const runtime = roomRuntime(ROOM)
    runtime.activeTurns.set('agent-exec-a-room-1', {
      agentSessionId: 'agent-exec-a-room-1',
      agentId: 'a',
      reason: 'mention',
      startedAt: 4_242,
    })
    runtime.queue.push({ id: 'q1', agentId: 'b', reason: 'self-elected', stage: 'queued' })
    runtime.judgements.add({ controller: new AbortController(), agentIds: ['b', 'c'] })
    runtime.state.chainCount = 7

    const snapshot = buildCollabCoordinatorState(ROOM)
    expect(snapshot?.turns).toEqual([
      { agentId: 'a', reason: 'mention', startedAt: 4_242, agentSessionId: 'agent-exec-a-room-1' },
    ])
    expect(snapshot?.queue).toEqual([{ id: 'q1', agentId: 'b', reason: 'self-elected' }])
    expect(snapshot?.judging).toBe(1)
    // 在问谁也要带出来 —— 常驻条那句「N 人在判断要不要接话」读的就是它,
    // 而在 §8 之前它是个恒空的数组、于是那句话是够不着的死分支。
    expect(snapshot?.judgingAgentIds).toEqual(['b', 'c'])
    expect(snapshot?.gates.chain).toEqual({ value: 7, max: 32 })
    expect(snapshot?.gates.concurrency).toEqual({ value: 1, max: 6 })
  })

  it('**不限的闸序列化成 0,不是 Infinity** —— 后者过不了 JSON,到了界面就是个静默的谎', () => {
    seed({ budgets: { maxChain: 0, maxConcurrentTurns: 0 } })
    const snapshot = buildCollabCoordinatorState(ROOM)
    expect(snapshot?.gates.chain.max).toBe(0)
    expect(snapshot?.gates.concurrency.max).toBe(0)
    expect(JSON.parse(JSON.stringify(snapshot)).gates.chain.max).toBe(0)
  })

  it('预算读的是协调器自己的缓存 —— 与预算闸比对的是同一个数,而且不碰磁盘', () => {
    roomRuntime(ROOM).budgetSpentUSD = 4.21
    expect(buildCollabCoordinatorState(ROOM)?.gates.budget).toEqual({ value: 4.21, max: 5 })
  })

  it('编排在飞时给出 waves / 进度 / 理由;没有编排时是 null', () => {
    seed({ responseMode: 'auto' })
    const runtime = roomRuntime(ROOM)
    runtime.state.plan = {
      id: 'plan-1',
      waves: [['a'], ['b', 'c']],
      cycle: true,
      why: '先让阿般定调',
      waveIndex: 1,
      waveCount: 3,
      passStreak: 0,
      waveSpoke: false,
      epoch: 0,
    }
    expect(buildCollabCoordinatorState(ROOM)?.plan).toEqual({
      waves: [['a'], ['b', 'c']],
      waveIndex: 1,
      waveCount: 3,
      cycle: true,
      why: '先让阿般定调',
      loops: 0,
    })

    // 画的是**正在执行的那份编排**,不是从名册现算一个环 —— 现算的环画不出
    // 「b 和 c 一起说」这种批次。
    delete runtime.state.plan
    expect(buildCollabCoordinatorState(ROOM)?.plan).toBeNull()
  })

  it('mode 三态:显式并行 / 显式顺序 / 其余算智能', () => {
    seed({ responseMode: 'parallel' })
    expect(buildCollabCoordinatorState(ROOM)?.mode).toBe('parallel')
    seed({ responseMode: 'serial' })
    expect(buildCollabCoordinatorState(ROOM)?.mode).toBe('serial')
    seed({ responseMode: 'auto' })
    expect(buildCollabCoordinatorState(ROOM)?.mode).toBe('auto')
  })
})

describe('「刚才」', () => {
  it('记一条就推一次,且带完整快照', () => {
    noteCollabSchedule(ROOM, { kind: 'received' })
    const all = events()
    expect(all).toHaveLength(1)
    expect((all[0].state as { log: unknown[] }).log).toEqual([
      expect.objectContaining({ kind: 'received' }),
    ])
  })

  it('定长:超了从头砍,最新的一定留着', () => {
    for (let index = 0; index < COLLAB_LOG_LIMIT + 10; index++) {
      noteCollabSchedule(ROOM, { kind: 'spoke', agentId: 'a', count: index })
    }
    const log = buildCollabCoordinatorState(ROOM)?.log ?? []
    expect(log).toHaveLength(COLLAB_LOG_LIMIT)
    expect(log.at(-1)).toMatchObject({ count: COLLAB_LOG_LIMIT + 9 })
  })

  it('房间没了,它的「刚才」也没了', () => {
    noteCollabSchedule(ROOM, { kind: 'received' })
    forgetCollabInspector(ROOM)
    expect(buildCollabCoordinatorState(ROOM)?.log).toEqual([])
  })

  it('死房不复活:删房后的异步收尾不再立新表项(有界泄漏,2026-08-02 三审)', () => {
    noteCollabSchedule(ROOM, { kind: 'received' })
    // 删房:会话没了,inspector 表项也清了。
    mocks.sessions.delete(ROOM)
    forgetCollabInspector(ROOM)
    // 被中止回合的异步收尾还会路过 note/broadcast —— 不该重建表项。
    noteCollabSchedule(ROOM, { kind: 'silent', agentId: 'a' })
    broadcastCollabCoordinator(ROOM)
    // 可观测面:同 id 的房间再建起来时,「刚才」必须是空的 —— 表项若在死房期间
    // 被复活过,这里就会带着那条 silent。
    seed()
    expect(buildCollabCoordinatorState(ROOM)?.log).toEqual([])
  })
})

describe('广播节流', () => {
  it('窗口里的多次推送攒成一次尾发,**不丢最后一帧**', async () => {
    vi.useFakeTimers()
    broadcastCollabCoordinator(ROOM)          // 立即发一次(距上次已久)
    expect(events()).toHaveLength(1)

    roomRuntime(ROOM).state.chainCount = 1
    broadcastCollabCoordinator(ROOM)          // 落进节流窗口
    roomRuntime(ROOM).state.chainCount = 9    // 窗口里状态又变了
    broadcastCollabCoordinator(ROOM)
    expect(events()).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(1_100)
    const all = events()
    expect(all).toHaveLength(2)
    // 尾发带的是**当下**的状态,不是进窗口那一刻的旧值。
    expect((all[1].state as { gates: { chain: { value: number } } }).gates.chain.value).toBe(9)
    vi.useRealTimers()
  })

  it('收摊时清掉待发定时器 —— 一次广播不该活过协调器本身', async () => {
    vi.useFakeTimers()
    broadcastCollabCoordinator(ROOM)
    broadcastCollabCoordinator(ROOM)
    shutdownCollabInspector()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(events()).toHaveLength(1)
    vi.useRealTimers()
  })
})
