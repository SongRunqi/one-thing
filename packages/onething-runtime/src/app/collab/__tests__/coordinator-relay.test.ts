/**
 * 顺序模式(接力)在**装配层**的闭环 —— docs/design/collab-speaking-order.md。
 *
 * 纯规则(环怎么排、传给谁、还传不传)在 `collab/__tests__/speaking-order.test.ts`。
 * 这里钉的是它接进房间之后的三件事:
 *
 *  1. **不买意愿判定** —— 顺序模式的成本与确定性全押在这一条上;
 *  2. **一次只发一张牌**,后说的人读得到先说的那句话;
 *  3. 终止条件真的把棒子停下来,而且只有"圈数用完"那一种会开口。
 *
 * 头号用例是设计文档 §1 那个:四人房、一条「从 1 数到 10」。判定形态下它的成败
 * 取决于连续约 30 次 yes/no 全答对;接力形态下它必须是确定的。
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
  pmAgentId?: string
  frozen?: boolean
  dm?: true
  responseMode?: 'parallel' | 'serial'
  speakOrder?: string[]
  relayLoops?: number
  budgets?: { maxChain?: number; maxConcurrentTurns?: number }
}

interface FakeSession {
  id: string
  name: string
  kind?: string
  agentId?: string
  isArchived?: boolean
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
  /** 每一次意愿判定都记一笔 —— 顺序模式下这个数组必须一直是空的。 */
  judged: [] as Array<{ roomSessionId: string; candidates: string[] }>,
}))

vi.mock('@onething/core/storage', () => ({
  readJsonFile: <T>(_path: string, fallback: T) => (mocks.stateFile as T) ?? fallback,
  writeJsonFile: (_path: string, data: unknown) => {
    mocks.stateFile = JSON.parse(JSON.stringify(data))
  },
}))

vi.mock('../../stores/paths.js', () => ({ getStorePath: () => '/tmp/onething-collab-relay-test' }))

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
    abort: () => {},
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
}))

vi.mock('../willingness-runner.js', () => ({
  judgeWillingness: async (roomSessionId: string, candidates: Array<{ id: string }>) => {
    mocks.judged.push({ roomSessionId, candidates: candidates.map(candidate => candidate.id) })
    return []
  },
}))

// 回合收尾会 `void import('./digest-runner.js')`(刻意的动态引入:它挂着整个
// provider 栈)。不 mock 的话每一棒都在 stderr 里吐一次解析失败 —— 功能上被它
// 自己的 catch 吞掉,但会把真正的失败淹掉。
vi.mock('../digest-runner.js', () => ({
  ensureCollabDigestsForRoom: async () => {},
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
let nextId = 0

/**
 * 每一棒该说什么。返回 null = 这一棒没话说(接力的"沉默"出口:回合跑完了,
 * 一次 `say` 都没调)。`mentions` 用来演抢棒。
 */
let turnScript: (agentId: string, baton: number) => {
  content: string
  mentions?: Array<{ agentId: string; label: string }>
} | null = () => null

/** 棒子实际落位的次序 —— 每一次 drive 记一笔。 */
let batonOrder: string[] = []
/** 真的说出口的那些(说话人 + 正文)。 */
let spoken: Array<{ agentId: string; content: string }> = []

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

/** 被 `holdNextTurn` 扣住、等 `releaseHeldTurn()` 才收尾的那些回合。 */
let heldTurns: Array<() => void> = []
let holdNextTurn = false

function releaseHeldTurns(): void {
  const pending = heldTurns
  heldTurns = []
  for (const release of pending) release()
}

/** 一个会说话的假引擎:每收到一个 drive 就按 `turnScript` 跑完一整棒。 */
function bindFakeEngine(): void {
  mocks.driveHandler = (sessionId: string) => {
    const agentId = sessionId.replace('agent-exec-', '').replace(/-room-\d+$/, '')
    batonOrder.push(agentId)
    const baton = batonOrder.length
    const hold = holdNextTurn
    if (hold) holdNextTurn = false
    const run = () => {
      // W18/W14b:思考记录留在自己的执行会话,只有 `say` 进房间。
      pushInto(sessionId, {
        role: 'assistant',
        agentId,
        content: '(想了想)',
        source: 'collab-turn',
      })
      const line = turnScript(agentId, baton)
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
      emitOn(sessionId, { type: 'stream:start' })
      emitOn(sessionId, { type: 'stream:complete' })
    }
    if (hold) heldTurns.push(() => setTimeout(run, 0))
    else setTimeout(run, 0)
  }
}

function deliver(message: FakeMessage): void {
  for (const entry of [...mocks.typeListeners]) {
    if (entry.type === 'message:user-created') entry.handler({ sessionId: ROOM, event: { message } })
  }
}

async function flush(): Promise<void> {
  // 接力是一条长链(一棒收尾 → 传棒 → 下一棒),每一环都要跨一次宏任务。
  for (let round = 0; round < 60; round++) {
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
    room: {
      memberAgentIds: ['a', 'b', 'c', 'd'],
      responseMode: 'serial',
      ...patch,
    },
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
  mocks.stateFile = null
  batonOrder = []
  spoken = []
  heldTurns = []
  holdNextTurn = false
  turnScript = () => null
  bindFakeEngine()
})

describe('验收:四人房「按顺序从 1 数到 10」', () => {
  it('棒子依次落在 a,b,c,d,a,… 上,数完之后走满一圈静默才停', async () => {
    seedRoom()
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
    // 10 棒说了话 + 4 棒静默凑满一圈 = 停。
    expect(batonOrder).toHaveLength(14)
    // 自然收尾不解释什么 —— 一行系统行都不该有。
    expect(systemLines()).toEqual([])
  })

  it('全程一次意愿判定都没买', async () => {
    seedRoom()
    coordinator.initializeCollabCoordinator()
    let counted = 0
    turnScript = () => (counted++ < 10 ? { content: String(counted) } : null)

    await sendUserMessage('大家按顺序从 1 数到 10')

    expect(mocks.judged).toEqual([])
  })
})

describe('起棒', () => {
  it('没有 @ → 环首起棒;列表次序压过名册序', async () => {
    seedRoom({ speakOrder: ['c', 'a'] })
    coordinator.initializeCollabCoordinator()
    turnScript = agentId => ({ content: `${agentId} 说话` })

    await sendUserMessage('都说说吧')

    expect(batonOrder.slice(0, 4)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('@ 到人 → 从环上最靠前的那位起棒', async () => {
    seedRoom()
    coordinator.initializeCollabCoordinator()
    turnScript = () => null

    await sendUserMessage('@老丁 @小李 你们看一下', [
      { agentId: 'd', label: '老丁' },
      { agentId: 'b', label: '小李' },
    ])

    expect(batonOrder[0]).toBe('b')
  })

  it('房间暂停时开口说自己被按住了,并且一棒都不发', async () => {
    seedRoom({ frozen: true })
    coordinator.initializeCollabCoordinator()

    await sendUserMessage('在吗')

    expect(batonOrder).toEqual([])
    expect(systemLines().join('\n')).toContain('房间已暂停')
  })
})

describe('传棒', () => {
  it('@ 抢棒压过环序', async () => {
    seedRoom()
    coordinator.initializeCollabCoordinator()
    turnScript = (agentId, baton) => {
      if (baton === 1) {
        return { content: '@老丁 你来', mentions: [{ agentId: 'd', label: '老丁' }] }
      }
      return baton <= 3 ? { content: `${agentId} 接着说` } : null
    }

    await sendUserMessage('开始')

    // a 说完点了 d → d **提到下一批**,跳过 b、c。
    //
    // 编排化之后这里与接力时代差一格:接力是"从 d 在环上的位置继续"(a,d,a),
    // 编排是"把 d 提上来,其余批次原样跟在后面"(a,d,b,…)。后者更符合点名的
    // 本意 —— 被点的人先答,而没被点的人并没有因此失去他们那一轮。
    expect(batonOrder.slice(0, 3)).toEqual(['a', 'd', 'b'])
  })

  it('圈数用完 → 停,并且这一种要开口', async () => {
    seedRoom({ relayLoops: 1 })
    coordinator.initializeCollabCoordinator()
    turnScript = agentId => ({ content: `${agentId} 说话` })

    await sendUserMessage('每人说一句')

    expect(batonOrder).toEqual(['a', 'b', 'c', 'd'])
    expect(systemLines().join('\n')).toContain('轮了 1 圈')
  })

  it('链长闸对接力照常生效', async () => {
    seedRoom({ budgets: { maxChain: 3 } })
    coordinator.initializeCollabCoordinator()
    turnScript = agentId => ({ content: `${agentId} 说话` })

    await sendUserMessage('开始')

    expect(batonOrder).toHaveLength(3)
    expect(systemLines().join('\n')).toContain('连着聊了 3 条')
  })
})

describe('一根棒子', () => {
  /**
   * 有人正在说话时用户 @ 了另一位 → 路由判 engage(点名必须能应),于是队里多了
   * 一条 relay。而正在跑的那一棒收尾时**也**要传棒 —— 两条一起跑,环里就有了
   * 两根棒子:发言速率翻倍、次序交错,而且两根都各自受圈数闸约束,谁都不觉得
   * 自己越界。接力的全部意义是"同一时刻只有一个人拿着棒子"。
   */
  it('中途 @ 另一位不会让环里多出一根棒子', async () => {
    seedRoom()
    coordinator.initializeCollabCoordinator()
    turnScript = agentId => ({ content: `${agentId} 说话` })

    // 第一棒扣住不收尾 —— 制造"有人正在说话"。
    holdNextTurn = true
    await sendUserMessage('开始')
    expect(batonOrder).toEqual(['a'])

    // 这时用户点了 c:c 没在说话,路由判 engage。
    const second = push({
      role: 'user',
      content: '@Iris 你也看看',
      mentions: [{ agentId: 'c', label: 'Iris' }],
    })
    deliver(second)
    await flush()

    // 放开第一棒,让它收尾并试图传棒。
    releaseHeldTurns()
    await flush()

    // 每一位在任一时刻最多持一根棒:相邻两棒不可能是同一个人,而且总棒数不会
    // 因为一条 @ 就翻倍。两根棒子的症状是 batonOrder 里出现 a,c,b,d,a,c… 这种
    // 交错的双序列。
    const speakersAfterMention = batonOrder.slice(1)
    expect(speakersAfterMention[0]).toBe('c')
    // 一根棒子:c 之后按环走 d,而不是"c(用户那根) + b(a 传下来的那根)"并存。
    expect(batonOrder.slice(0, 3)).toEqual(['a', 'c', 'd'])
  })

  /** 起棒侧的同一条不变量:队里已有一条没起跑的棒子时,新消息**改派**它而不是再造一根。 */
  it('没人在说话但队里有棒子时,新消息改派它而不是另起一根', async () => {
    seedRoom()
    coordinator.initializeCollabCoordinator()
    turnScript = agentId => ({ content: `${agentId} 说话` })

    // 扣住第一棒,让第二棒排在队里起不来。
    holdNextTurn = true
    await sendUserMessage('开始')
    const runtime = (await import('../room-runtime.js')).roomRuntime(ROOM)
    // 手动往队里塞一条待起跑的 relay,模拟"棒子已排队还没轮到"。
    runtime.queue.push({
      id: 'pending-relay',
      agentId: 'b',
      reason: 'relay',
      stage: 'queued',
    })

    deliver(push({
      role: 'user',
      content: '@Iris 你来',
      mentions: [{ agentId: 'c', label: 'Iris' }],
    }))
    await flush()

    // 队里仍然只有一条,而且已经改派给被点名的那位。
    const relays = runtime.queue.filter(record => record.reason === 'relay')
    expect(relays).toHaveLength(1)
    expect(relays[0].agentId).toBe('c')
  })
})

describe('模式边界', () => {
  it('并行模式一行不改 —— 照旧买判定,不生成 relay 激活', async () => {
    seedRoom({ responseMode: 'parallel' })
    coordinator.initializeCollabCoordinator()

    await sendUserMessage('大家怎么看')

    expect(mocks.judged).toHaveLength(1)
    expect(mocks.judged[0].candidates.sort()).toEqual(['a', 'b', 'c', 'd'])
    expect(batonOrder).toEqual([])
  })

  it('私聊房不走接力,即使配了 serial', async () => {
    mocks.sessions.set(ROOM, {
      id: ROOM,
      name: '和小李的私聊',
      kind: 'room',
      room: { memberAgentIds: ['b'], dm: true, responseMode: 'serial' },
      messages: [],
    } satisfies FakeSession)
    coordinator.initializeCollabCoordinator()
    turnScript = () => null

    await sendUserMessage('在吗')

    // 免判激活照旧把唯一那位拉起来,而且只有一棒 —— 没有环在转。
    expect(batonOrder).toEqual(['b'])
  })

  it('新的用户消息重开一趟:圈数计数归零', async () => {
    seedRoom({ relayLoops: 1 })
    coordinator.initializeCollabCoordinator()
    turnScript = agentId => ({ content: `${agentId} 说话` })

    await sendUserMessage('第一轮')
    expect(batonOrder).toHaveLength(4)

    await sendUserMessage('再来一轮')
    expect(batonOrder).toHaveLength(8)
  })
})
