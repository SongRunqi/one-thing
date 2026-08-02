/**
 * 编排(waves)在**装配层**的闭环 —— docs/design/collab-coordinator-plan.md。
 *
 * 纯规则(编排怎么解析、怎么规范化、还推不推进)在 `collab/__tests__/plan.test.ts`。
 * 这里钉的是它接进房间之后的四件事:
 *
 *  1. **一条用户消息 = 一次协调器调用**(不是 N 次判定)——成本红线,也是卖点;
 *  2. **批间严格串行**:一批全部落地才发下一批,否则"后说的人读得到先说的话"
 *     这个前提就没了,而它是数数能数对的唯一原因;
 *  3. **批内并行**:`[[a,b,c]]` 是三个人一起说,不是被并发上限压成串行;
 *  4. 终止、降级、喊停、冻结各自还在原来的位置。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  frozen?: boolean
  dm?: true
  responseMode?: 'auto' | 'parallel' | 'serial'
  speakOrder?: string[]
  relayLoops?: number
  budgets?: { maxChain?: number; maxConcurrentTurns?: number }
}

interface FakeSession {
  id: string
  name: string
  kind?: string
  agentId?: string
  collab?: { roomSessionId?: string }
  room?: FakeRoom
  messages: FakeMessage[]
}

const AGENTS: Record<string, { id: string; name: string }> = {
  a: { id: 'a', name: '阿般' },
  b: { id: 'b', name: '小李' },
  c: { id: 'c', name: 'Iris' },
  d: { id: 'd', name: '老丁' },
}

const mocks = vi.hoisted(() => ({
  sessions: new Map<string, unknown>(),
  emitted: [] as Array<{ sessionId: string; event: Record<string, unknown> }>,
  anyListeners: [] as Array<{ sessionId: string; handler: (envelope: unknown) => void }>,
  typeListeners: [] as Array<{ type: string; handler: (envelope: unknown) => void }>,
  stateFile: null as unknown,
  driveHandler: null as null | ((sessionId: string) => void),
  /** 意愿判定被买过几轮 —— 编排排了人的轮次必须是 0;空编排会回落到它。 */
  judged: [] as Array<{ roomSessionId: string; candidates: string[] }>,
  /** 意愿判定的脚本(按轮消费),缺省没人自荐。 */
  willing: [] as Array<Array<{ agentId: string; respond: boolean; outcome: string }>>,
  /** 协调器被问过几次,以及每次给了什么。 */
  planCalls: [] as Array<{ roomSessionId: string; mentioned: string[]; continuation: boolean }>,
  /** 每次编排调用拿到的取消把手 —— 喊停要能掐断在飞的那次。 */
  planSignals: [] as Array<AbortSignal | undefined>,
  planReply: null as null | { waves: string[][]; cycle: boolean; why: string },
  /**
   * **续排**调用的脚本(按次序消费)。空 = 续排一律答"收工"(waves: []),
   * 这也是真协调器的常态答案 —— 于是既有用例只多一次收工调用,行为不变。
   */
  planQueue: [] as Array<{ waves: string[][]; cycle: boolean; why: string }>,
  planFailure: undefined as undefined | string,
  /** 设了就把编排调用扣住,直到 releasePlan() —— 用来制造"编排在飞"的窗口。 */
  planGate: null as null | (() => void),
}))

vi.mock('@onething/core/storage', () => ({
  readJsonFile: <T>(_path: string, fallback: T) => (mocks.stateFile as T) ?? fallback,
  writeJsonFile: (_path: string, data: unknown) => {
    mocks.stateFile = JSON.parse(JSON.stringify(data))
  },
}))

vi.mock('../../stores/paths.js', () => ({ getStorePath: () => '/tmp/onething-collab-plan-test' }))
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
  // 真的落值:收养式兜底走真 say 执行器,它靠执行会话上的 agentId 认人 ——
  // 恒 true 的假实现会让收养被 resolveSayContext 静默挡掉,测的就不是生产链路。
  updateSessionAgent: (id: string, agentId: string) => {
    const session = mocks.sessions.get(id) as FakeSession | undefined
    if (!session) return false
    session.agentId = agentId
    return true
  },
  updateSessionCollab: (
    id: string,
    fields: { kind?: string | null; collab?: { roomSessionId?: string } | null; room?: FakeRoom },
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

vi.mock('../../agents/index.js', () => ({
  findAgent: (id: string) => AGENTS[id] ?? null,
  // 收养式兜底走真 say 执行器,身份目录要点全体名册 —— 缺了它每次收养都打一条
  // 「目录残缺」告警(行为不受影响,句柄剥离按残缺目录进行)。
  listAgents: () => Object.values(AGENTS),
}))

vi.mock('../board-store.js', () => ({
  forgetCollabBoardRoom: () => {},
  loadCollabBoard: () => ({ version: 1, tasks: [] }),
  shutdownCollabBoardBroadcasts: () => {},
  getCollabSelfTaskFacts: () => [],
}))

vi.mock('../digest-runner.js', () => ({ ensureCollabDigestsForRoom: async () => {} }))

vi.mock('../willingness-runner.js', () => ({
  judgeWillingness: async (roomSessionId: string, candidates: Array<{ id: string }>) => {
    mocks.judged.push({ roomSessionId, candidates: candidates.map(candidate => candidate.id) })
    return mocks.willing.shift() ?? []
  },
}))

/**
 * 仲裁者调用被 mock 掉 —— 这一层测的是"拿到编排之后怎么执行",
 * 提示词与解析在 `collab/__tests__/plan.test.ts`。
 *
 * 顺带钉住 `queue.ts` 那处**动态** import:静态引它就会把整个 provider 栈带给
 * 每一个协调器测试(17 个文件靠 `willingness-runner` 当唯一的隔离缝)。
 */
vi.mock('../planner.js', () => ({
  requestCollabPlan: async (options: {
    roomSessionId: string
    mentionedAgentIds?: string[]
    continuation?: boolean
    signal?: AbortSignal
  }) => {
    mocks.planCalls.push({
      roomSessionId: options.roomSessionId,
      mentioned: [...(options.mentionedAgentIds ?? [])],
      continuation: options.continuation === true,
    })
    mocks.planSignals.push(options.signal)
    // 续排走自己的脚本,消费完(或没脚本)一律答"收工" —— 不兜到 planReply 上:
    // 那会让每个非循环用例的续排把同一份编排再装一遍,无限接龙到链闸。
    const reply = options.continuation
      ? mocks.planQueue.shift() ?? { waves: [], cycle: false, why: '' }
      : mocks.planReply
    if (mocks.planGate) {
      await new Promise<void>(resolve => { mocks.planGate = resolve })
    }
    if (reply) return { plan: reply }
    return { plan: null, failure: mocks.planFailure ?? 'unparsable' }
  },
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
const { reconcileRoom } = await import('../queue.js')
const { roomRuntime } = await import('../room-runtime.js')
const { buildCollabCoordinatorState } = await import('../inspector.js')

const ROOM = 'room-1'
let nextId = 0

/** 每一棒/每一批里,谁被驱动了(按 drive 到达顺序)。 */
let driveOrder: string[] = []
/** 同时在跑的峰值 —— 批内并行的证据。 */
let concurrentPeak = 0
let concurrentNow = 0
let spoken: Array<{ agentId: string; content: string }> = []

let turnScript: (agentId: string, index: number) => {
  content: string
  mentions?: Array<{ agentId: string; label: string }>
} | null = () => null

function room(): FakeSession {
  return mocks.sessions.get(ROOM) as FakeSession
}

function push(message: Omit<FakeMessage, 'id' | 'timestamp'> & { id?: string }): FakeMessage {
  const full: FakeMessage = { id: message.id ?? `m-${++nextId}`, timestamp: Date.now(), ...message }
  room().messages.push(full)
  return full
}

function pushInto(sessionId: string, message: Omit<FakeMessage, 'id' | 'timestamp'>): void {
  const session = mocks.sessions.get(sessionId) as FakeSession | undefined
  session?.messages.push({ id: `m-${++nextId}`, timestamp: Date.now(), ...message })
}

function emitOn(sessionId: string, event: Record<string, unknown>): void {
  for (const entry of [...mocks.anyListeners]) {
    if (entry.sessionId === sessionId) entry.handler({ sessionId, event })
  }
}

function bindFakeEngine(): void {
  mocks.driveHandler = (sessionId: string) => {
    const agentId = sessionId.replace('agent-exec-', '').replace(/-room-\d+$/, '')
    driveOrder.push(agentId)
    const index = driveOrder.length
    concurrentNow += 1
    concurrentPeak = Math.max(concurrentPeak, concurrentNow)
    setTimeout(() => {
      pushInto(sessionId, { role: 'assistant', agentId, content: '(想了想)', source: 'collab-turn' })
      const line = turnScript(agentId, index)
      if (line) {
        spoken.push({ agentId, content: line.content })
        push({
          role: 'assistant',
          agentId,
          content: line.content,
          source: 'collab-say',
          ...(line.mentions ? { mentions: line.mentions } : {}),
        })
      }
      concurrentNow -= 1
      emitOn(sessionId, { type: 'stream:start' })
      emitOn(sessionId, { type: 'stream:complete' })
    }, 0)
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

function seedRoom(patch: Partial<FakeRoom> = {}): void {
  mocks.sessions.set(ROOM, {
    id: ROOM,
    name: '官网改版组',
    kind: 'room',
    room: { memberAgentIds: ['a', 'b', 'c', 'd'], responseMode: 'auto', ...patch },
    messages: [],
  } satisfies FakeSession)
}

function systemLines(): string[] {
  return room().messages.filter(message => message.role === 'system').map(message => message.content)
}

beforeEach(() => {
  coordinator.shutdownCollabCoordinator()
  mocks.sessions.clear()
  mocks.emitted.length = 0
  mocks.anyListeners = []
  mocks.typeListeners = []
  mocks.judged.length = 0
  mocks.willing.length = 0
  mocks.planCalls.length = 0
  mocks.planSignals.length = 0
  mocks.planReply = null
  mocks.planQueue.length = 0
  mocks.planFailure = undefined
  mocks.planGate = null
  mocks.stateFile = null
  driveOrder = []
  spoken = []
  concurrentPeak = 0
  concurrentNow = 0
  turnScript = () => null
  bindFakeEngine()
})

describe('验收:一条消息一次调用', () => {
  it('数到 10 —— 单人批 × cycle,次序由协调器给出,全程零意愿判定', async () => {
    seedRoom()
    mocks.planReply = {
      waves: [['a'], ['b'], ['c'], ['d']],
      cycle: true,
      why: '他们要按顺序数数',
    }
    coordinator.initializeCollabCoordinator()
    let counted = 0
    turnScript = () => {
      if (counted >= 10) return null
      counted += 1
      return { content: String(counted) }
    }

    await sendUserMessage('大家按顺序从 1 数到 10')

    expect(spoken.map(entry => entry.content)).toEqual(
      ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
    )
    expect(spoken.map(entry => entry.agentId)).toEqual(
      ['a', 'b', 'c', 'd', 'a', 'b', 'c', 'd', 'a', 'b'],
    )
    // **一条消息恰好一次协调器调用** —— 这是编排取代 N 路判定的成本红线。
    expect(mocks.planCalls).toHaveLength(1)
    expect(mocks.judged).toEqual([])
    // 10 批说了话 + 4 批静默凑满一轮 = 停;自然收尾一行都不贴。
    expect(driveOrder).toHaveLength(14)
    expect(systemLines()).toEqual([])
  })

  it('**批内并行**:`[[a,b,c]]` 是三个人一起说,不是被压成串行', async () => {
    seedRoom()
    mocks.planReply = { waves: [['a', 'b', 'c']], cycle: false, why: '开放问题,各说各的' }
    coordinator.initializeCollabCoordinator()
    turnScript = agentId => ({ content: `${agentId} 的看法` })

    await sendUserMessage('大家怎么看')

    expect(driveOrder.sort()).toEqual(['a', 'b', 'c'])
    // 接力时代这里恒为 1(并发上限被顺序模式钉死),编排之后串行由**批边界**保证。
    expect(concurrentPeak).toBeGreaterThan(1)
  })

  it('**批间串行**:第二批要等第一批全部落地 —— 后说的人才读得到前面的话', async () => {
    seedRoom()
    mocks.planReply = { waves: [['a', 'b'], ['c']], cycle: false, why: '先议后总结' }
    coordinator.initializeCollabCoordinator()
    const seen: number[] = []
    turnScript = agentId => {
      if (agentId === 'c') seen.push(room().messages.filter(m => m.source === 'collab-say').length)
      return { content: `${agentId}` }
    }

    await sendUserMessage('先聊聊,然后 Iris 总结')

    expect(driveOrder.slice(0, 2).sort()).toEqual(['a', 'b'])
    expect(driveOrder[2]).toBe('c')
    // c 起跑时,a 和 b 的话都已经在房间里了。
    expect(seen).toEqual([2])
  })

  it('「A 先说,B 和 C 补充」—— 旧的两种模式都表达不了的形状', async () => {
    seedRoom()
    mocks.planReply = { waves: [['a'], ['b', 'c']], cycle: false, why: '先让阿般定调' }
    coordinator.initializeCollabCoordinator()
    turnScript = agentId => ({ content: `${agentId}` })

    await sendUserMessage('这个方案怎么样')

    expect(driveOrder[0]).toBe('a')
    expect(driveOrder.slice(1).sort()).toEqual(['b', 'c'])
  })

  it('点将是一个**属性**,不是一句话;编排的 why 仍然读不到(2026-08-02 用户定)', async () => {
    seedRoom()
    mocks.planReply = { waves: [['a']], cycle: false, why: '阿般应稳住局面并引导提问' }
    coordinator.initializeCollabCoordinator()
    turnScript = () => ({ content: '来了' })

    await sendUserMessage('大家好')

    const drives = mocks.emitted.filter(entry => entry.event.type === 'command:send-message')
    const content = String(drives.at(-1)?.event.content ?? '')
    // 被点将的事实要在,但它是 `<Notification>` 上的一个**属性** —— 不再是一句
    // 对模型说的话。`<turn>` 指令块整块删除(A.2 ②):舞台隐喻(「轮到你了 /
    // 房间在等你」)已被真机证明是「写而未发」的病根。
    expect(content).toContain('scheduled="coordinator"')
    expect(content).not.toContain('<turn ')
    expect(content).not.toContain('The coordinator scheduled you this round')
    // why 必须不在:调度器的职权是"谁说、什么次序",不是"说什么"。why 常写成
    // 舞台指示,进了回合就是调度器指挥发言内容的后门(刷屏事故)。它的消费者
    // 是状态条上的用户。
    expect(content).not.toContain('稳住局面')
    expect(content).not.toContain('DO that thing')
  })

  it('写而未发被收养:大段正文零 say → 框架代发进群,记 adopted 不记 unsent', async () => {
    seedRoom()
    mocks.planReply = { waves: [['a']], cycle: false, why: '' }
    coordinator.initializeCollabCoordinator()
    // 这个回合把答复写成大段执行会话正文,一次 say 都不调 —— 2026-08-02 真机上
    // 长文型成员一半的回合就是这个样子。措辞层对抗已实证失效,收养式兜底
    // (2026-08-02 用户裁决)把这段正文走 say 的同一条落地路径代为投进群:
    // 消息不丢,而「忘了按发送」这个事实在「刚才」里单独记账。
    mocks.driveHandler = (sessionId: string) => {
      setTimeout(() => {
        pushInto(sessionId, {
          role: 'assistant',
          agentId: 'a',
          content:
            '好的,我来当这个上帝。配置:狼人一名、预言家一名、猎人一名、村民一名。天黑请闭眼,等我逐个私信发牌之后开始第一夜的行动。',
          source: 'collab-turn',
        })
        emitOn(sessionId, { type: 'stream:start' })
        emitOn(sessionId, { type: 'stream:complete' })
      }, 0)
    }

    await sendUserMessage('开始吧')

    // 那段话以真实 say 的形状进了群:同一 source、署名是本人 —— 下游(级联、
    // 投影、UI)不需要认识"收养"这个概念。
    const adopted = room().messages.filter(
      message => message.source === 'collab-say' && message.agentId === 'a',
    )
    expect(adopted).toHaveLength(1)
    expect(adopted[0].content).toContain('天黑请闭眼')
    const log = buildCollabCoordinatorState(ROOM)?.log ?? []
    expect(log.some(entry => entry.kind === 'adopted' && entry.agentId === 'a')).toBe(true)
    expect(log.some(entry => entry.kind === 'unsent')).toBe(false)
    expect(log.some(entry => entry.kind === 'silent')).toBe(false)
  })

  it('收尾自语低于阈值不被收养:短正文零 say 仍是真沉默', async () => {
    seedRoom()
    mocks.planReply = { waves: [['a']], cycle: false, why: '' }
    coordinator.initializeCollabCoordinator()
    // 「已回复,无补充」这类收尾只言片语不是写好的答复 —— 收养它等于把旁白
    // 播进群里,阈值(COLLAB_UNSENT_PROSE_MIN)把这一类留在沉默侧。
    mocks.driveHandler = (sessionId: string) => {
      setTimeout(() => {
        pushInto(sessionId, {
          role: 'assistant',
          agentId: 'a',
          content: '已回复,无补充。',
          source: 'collab-turn',
        })
        emitOn(sessionId, { type: 'stream:start' })
        emitOn(sessionId, { type: 'stream:complete' })
      }, 0)
    }

    await sendUserMessage('开始吧')

    expect(room().messages.filter(message => message.source === 'collab-say')).toHaveLength(0)
    const log = buildCollabCoordinatorState(ROOM)?.log ?? []
    expect(log.some(entry => entry.kind === 'silent' && entry.agentId === 'a')).toBe(true)
    expect(log.some(entry => entry.kind === 'adopted')).toBe(false)
    expect(log.some(entry => entry.kind === 'unsent')).toBe(false)
  })

  it('「这轮谁都不该说」是**意见不是终审**:留痕之后回落每人自判(2026-08-02 用户定)', async () => {
    seedRoom()
    mocks.planReply = { waves: [], cycle: false, why: '不是找他们的' }
    coordinator.initializeCollabCoordinator()

    await sendUserMessage('自言自语一句')

    // 编排器的意见照样在「刚才」里留痕 —— 但"是否响应"归每位同事自己判。
    expect(
      buildCollabCoordinatorState(ROOM)?.log.some(
        entry => entry.kind === 'planned' && entry.count === 0 && entry.detail === '不是找他们的',
      ),
    ).toBe(true)
    expect(mocks.judged).toHaveLength(1)
    expect(mocks.judged[0].candidates.sort()).toEqual(['a', 'b', 'c', 'd'])
    // 没人自荐 → 真的沉默,消息被消费,一行系统行都不贴(沉默在 IM 房是合法态)。
    expect(driveOrder).toEqual([])
    expect(systemLines()).toEqual([])
  })

  it('空编排回落时有人自荐 → 他就说话:编排器不垄断"是否响应"', async () => {
    seedRoom()
    mocks.planReply = { waves: [], cycle: false, why: '没什么要安排的' }
    mocks.willing.push([{ agentId: 'b', respond: true, outcome: 'yes' }])
    coordinator.initializeCollabCoordinator()
    turnScript = agentId => ({ content: `${agentId} 有话说` })

    await sendUserMessage('随便聊聊')

    expect(driveOrder[0]).toBe('b')
    expect(spoken.map(entry => entry.agentId)).toContain('b')
  })
})

describe('降级', () => {
  it('编排要不到 → 回落 N 路意愿判定,行为与今天一模一样', async () => {
    seedRoom()
    mocks.planReply = null
    mocks.planFailure = 'timeout'
    coordinator.initializeCollabCoordinator()

    await sendUserMessage('大家怎么看')

    expect(mocks.planCalls).toHaveLength(1)
    // 降级之后照旧问每一位 —— `judgeOne` 那条链因此不退役。
    expect(mocks.judged).toHaveLength(1)
    expect(mocks.judged[0].candidates.sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('显式并行模式压根不问协调器', async () => {
    seedRoom({ responseMode: 'parallel' })
    coordinator.initializeCollabCoordinator()

    await sendUserMessage('大家怎么看')

    expect(mocks.planCalls).toEqual([])
    expect(mocks.judged).toHaveLength(1)
  })

  it('强制顺序**本地合成**编排,不花一次调用', async () => {
    seedRoom({ responseMode: 'serial', speakOrder: ['c', 'a'] })
    coordinator.initializeCollabCoordinator()
    let counted = 0
    turnScript = () => (counted++ < 3 ? { content: String(counted) } : null)

    await sendUserMessage('依次说')

    expect(mocks.planCalls).toEqual([])
    expect(mocks.judged).toEqual([])
    // 次序表压过名册序,与接力时代一字不差。
    expect(driveOrder.slice(0, 4)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('缺省(未配)仍然是并行 —— 机制先可选,默认不跟着翻', async () => {
    seedRoom({ responseMode: undefined })
    coordinator.initializeCollabCoordinator()

    await sendUserMessage('大家怎么看')

    expect(mocks.planCalls).toEqual([])
    expect(mocks.judged).toHaveLength(1)
  })
})

describe('闸与打断', () => {
  it('链长闸对编排照常生效', async () => {
    seedRoom({ budgets: { maxChain: 3 } })
    mocks.planReply = { waves: [['a'], ['b'], ['c'], ['d']], cycle: true, why: '轮流说' }
    coordinator.initializeCollabCoordinator()
    turnScript = agentId => ({ content: `${agentId}` })

    await sendUserMessage('开始')

    expect(driveOrder).toHaveLength(3)
    expect(systemLines().join('\n')).toContain('连着聊了 3 条')
  })

  it('圈数天花板 → 停 + 贴行(只有这一种要开口)', async () => {
    seedRoom({ relayLoops: 1 })
    mocks.planReply = { waves: [['a'], ['b']], cycle: true, why: '轮流说' }
    coordinator.initializeCollabCoordinator()
    turnScript = agentId => ({ content: `${agentId}` })

    await sendUserMessage('开始')

    expect(driveOrder).toEqual(['a', 'b'])
    expect(systemLines().join('\n')).toContain('轮了 1 圈')
  })

  it('房间暂停 → 开口说自己被按住了,且一次调用都不花', async () => {
    seedRoom({ frozen: true })
    coordinator.initializeCollabCoordinator()

    await sendUserMessage('在吗')

    expect(mocks.planCalls).toEqual([])
    expect(driveOrder).toEqual([])
    expect(systemLines().join('\n')).toContain('房间已暂停')
  })

  it('预算闸挡住的消息**不消费**:水位不动,预算恢复后重新处理(2026-08-02 三审)', async () => {
    seedRoom()
    mocks.planReply = { waves: [['a']], cycle: false, why: '阿般答' }
    coordinator.initializeCollabCoordinator()
    turnScript = () => ({ content: '来了' })

    // 60s 缓存内直接读到"超预算"(默认日预算 $5)。
    const runtime = roomRuntime(ROOM)
    runtime.budgetCheckedAt = Date.now()
    runtime.budgetSpentUSD = 999

    const message = await sendUserMessage('@阿般 在吗', [{ agentId: 'a', label: '阿般' }])

    // 一分钱不花、一个回合不起 —— 且这条消息**没有被消费**:并行那条路超预算是
    // requeue + 次日恢复,编排这条路把水位推过去的话,「明天自动恢复」就是假的。
    expect(mocks.planCalls).toEqual([])
    expect(driveOrder).toEqual([])
    expect(runtime.state.lastProcessedMessageId).not.toBe(message.id)

    // 预算恢复(次日踢一脚走的就是 reconcile 同源的重入口):消息被补答。
    // (续排那次收工调用不算在内 —— 这里数的是"这条消息买了几次编排"。)
    runtime.budgetSpentUSD = 0
    reconcileRoom(room() as never)
    await flush()
    expect(mocks.planCalls.filter(call => !call.continuation)).toHaveLength(1)
    expect(driveOrder).toEqual(['a'])
  })

  it('用户喊停 → 在飞的编排作废', async () => {
    seedRoom()
    mocks.planReply = { waves: [['a'], ['b'], ['c'], ['d']], cycle: true, why: '轮流说' }
    coordinator.initializeCollabCoordinator()
    turnScript = agentId => ({ content: `${agentId}` })

    await sendUserMessage('开始')
    const before = driveOrder.length
    expect(before).toBeGreaterThan(0)

    driveOrder = []
    await sendUserMessage('停')
    expect(driveOrder).toEqual([])
  })

  it('人再开口 = 新的一趟:旧编排整份换掉,不叠加', async () => {
    seedRoom()
    mocks.planReply = { waves: [['a']], cycle: false, why: '' }
    coordinator.initializeCollabCoordinator()
    turnScript = agentId => ({ content: `${agentId}` })

    await sendUserMessage('第一句')
    expect(mocks.planCalls.filter(call => !call.continuation)).toHaveLength(1)

    mocks.planReply = { waves: [['b']], cycle: false, why: '' }
    await sendUserMessage('第二句')

    expect(mocks.planCalls.filter(call => !call.continuation)).toHaveLength(2)
    expect(driveOrder).toEqual(['a', 'b'])
  })
})

describe('点名必须能应', () => {
  it('被 @ 的人进第一批 —— 由协调器的入参带过去', async () => {
    seedRoom()
    mocks.planReply = { waves: [['c']], cycle: false, why: '' }
    coordinator.initializeCollabCoordinator()
    turnScript = () => null

    await sendUserMessage('@Iris 你看一下', [{ agentId: 'c', label: 'Iris' }])

    expect(mocks.planCalls[0].mentioned).toEqual(['c'])
    expect(driveOrder).toEqual(['c'])
  })

  it('agent 在发言里 @ 了人 → 提到下一批,不重新问协调器', async () => {
    seedRoom()
    mocks.planReply = { waves: [['a'], ['b'], ['c'], ['d']], cycle: false, why: '' }
    coordinator.initializeCollabCoordinator()
    turnScript = (agentId, index) => {
      if (index === 1) return { content: '@老丁 你来', mentions: [{ agentId: 'd', label: '老丁' }] }
      return { content: `${agentId}` }
    }

    await sendUserMessage('开始')

    expect(driveOrder.slice(0, 2)).toEqual(['a', 'd'])
    // 编排开跑后不再问协调器 —— 这是机械插入,不是第二次调用。
    // (走完之后的**续排**是另一件事,不算进"这条消息买了几次编排"。)
    expect(mocks.planCalls.filter(call => !call.continuation)).toHaveLength(1)
  })
})

/**
 * 续排(2026-08-02 用户改定):编排干净走完之后,泵再问一次协调器"要不要继续"。
 * 空 waves = 收工(旧行为);有 waves = 装新编排接着跑。准入门:有人开过口的
 * `exhausted` 才续 —— 静默走完的一趟材料没变,再问只会得到同一个答案。
 */
describe('续排', () => {
  it('协调器说继续 → 新编排接着跑;说收工 → 停', async () => {
    seedRoom()
    mocks.planReply = { waves: [['a']], cycle: false, why: '先让阿般答' }
    // 第一次续排:让小李补充;第二次续排没脚本 = 收工。
    mocks.planQueue.push({ waves: [['b']], cycle: false, why: '小李补充一下' })
    coordinator.initializeCollabCoordinator()
    turnScript = agentId => ({ content: `${agentId}` })

    await sendUserMessage('这事怎么办')

    expect(driveOrder).toEqual(['a', 'b'])
    // 初排 1 次 + 续排 2 次(继续、收工)。
    expect(mocks.planCalls.map(call => call.continuation)).toEqual([false, true, true])
    // 收工那次空答不是终审:回落一轮每人自判(冷却把刚说过的 a/b 筛掉),
    // 没人自荐才真的停。
    expect(mocks.judged).toHaveLength(1)
    // 自然收尾不贴系统行 —— 与"编排本来就走完了"同一条纪律。
    expect(systemLines()).toEqual([])
  })

  it('**编排器没有"等"这个动作**:续排答「等大家反馈」排零人 → 自判接手,想反馈的人开口', async () => {
    seedRoom()
    mocks.planReply = { waves: [['a']], cycle: false, why: 'Atlas 先拟规则' }
    // 真机死锁的复刻:续排说"规则已拟出,等待大家反馈,无需安排发言" —— 排了零人,
    // 而反馈恰恰需要有人说话。修法:空答回落每人自判,想反馈的自己站出来。
    mocks.willing.push([{ agentId: 'c', respond: true, outcome: 'yes' }])
    coordinator.initializeCollabCoordinator()
    turnScript = agentId => ({ content: agentId === 'a' ? '规则拟好了' : '我有反馈' })

    await sendUserMessage('定个狼人杀规则')

    expect(driveOrder[0]).toBe('a')
    expect(driveOrder).toContain('c')
    expect(spoken.map(entry => entry.content)).toContain('我有反馈')
  })

  it('静默走完不续排:没人开过口的一趟,材料没变,不再花一次调用', async () => {
    seedRoom()
    mocks.planReply = { waves: [['a'], ['b']], cycle: false, why: '' }
    coordinator.initializeCollabCoordinator()
    turnScript = () => null

    await sendUserMessage('随便聊聊')

    expect(driveOrder).toEqual(['a', 'b'])
    expect(mocks.planCalls).toHaveLength(1)
  })
})

/**
 * 编排调用是 2–12s 的 await,而用户在这期间可以做任何事。审查(2026-08-02)在这个
 * 窗口里抓到两条 high,两条都因为"作废旧编排"在 await 之前、"装上新编排"在
 * await 之后 —— 中间那段真空里,世代号和编排身份都还没定。
 */
describe('编排在飞的窗口', () => {
  /** 扣住编排调用,回到调用方手里。 */
  async function holdPlan(text: string, reply: NonNullable<typeof mocks.planReply>): Promise<void> {
    mocks.planReply = reply
    mocks.planGate = () => {}
    const message = push({ role: 'user', content: text })
    deliver(message)
    await flush()
  }

  async function releasePlan(): Promise<void> {
    const resolve = mocks.planGate
    mocks.planGate = null
    resolve?.()
    await flush()
  }

  it('**喊停能停掉在飞的编排** —— 它不该"继承"喊停之后的新世代号', async () => {
    seedRoom()
    coordinator.initializeCollabCoordinator()
    turnScript = agentId => ({ content: `${agentId}` })

    await holdPlan('四个人依次说一下', {
      waves: [['a'], ['b'], ['c'], ['d']],
      cycle: false,
      why: '',
    })
    expect(mocks.planCalls).toHaveLength(1)
    expect(driveOrder).toEqual([])

    // 编排还在算的时候喊停:此刻没有任何回合在跑,abort 分支碰不到任何回合 ——
    // 但要掐得断这次调用本身:结果会被 epoch 作废,不掐的话它还会跑满死线计费
    // (2026-08-02 三审)。
    await sendUserMessage('停')
    expect(mocks.planSignals[0]?.aborted).toBe(true)
    await releasePlan()

    // 修之前:整份编排照常装上、四批全跑完。
    expect(driveOrder).toEqual([])
  })

  it('**并发两条消息只落一份编排** —— 后一条顶掉前一条,不叠加', async () => {
    seedRoom()
    coordinator.initializeCollabCoordinator()
    turnScript = agentId => ({ content: `${agentId}` })

    await holdPlan('第一句', { waves: [['a'], ['b']], cycle: false, why: '' })
    const firstGate = mocks.planGate

    // 第二条在第一份编排还在算的时候进来:activeTurns 仍是空的,照样走 engage。
    mocks.planReply = { waves: [['c']], cycle: false, why: '' }
    mocks.planGate = () => {}
    deliver(push({ role: 'user', content: '第二句' }))
    await flush()
    expect(mocks.planCalls).toHaveLength(2)

    // 先放行**第一份**(它已经被第二条顶掉了),再放行第二份。
    firstGate?.()
    await flush()
    await releasePlan()

    // 修之前:第一批跑的是两份编排的并集 ['a','c'],随后按后装的那份推进。
    expect(driveOrder).toEqual(['c'])
  })
})
