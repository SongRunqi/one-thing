/**
 * D6-a 生产接线的**装配级**测试(docs/design/collab-actor-v3.md §6 D6)。
 *
 * D0-D5 的测试各问各的那一块(房间的账、心智的循环、裁判的 O(1)、手的墙钟);
 * 这一份问的是**接线本身**:一条真的用户消息从 ingress 进去,能不能一路走到房间
 * 转录里的一句回话,并且把该推的都推了。
 *
 * 三件事是刻意用真身的:
 *  - **磁盘**。房账、agent 账、mailbox 都落进一个临时 store —— `DurableMailbox`
 *    的开箱/续播、账的同步原子写,正是接线最容易接错的地方(路径、ownerId、
 *    开箱时机),用内存替身测等于把要测的东西替掉了;
 *  - **纯规则**。发牌、三道闸、mention 白名单、句柄出栈全是真的;
 *  - **入口**。走 `handleCollabRoomSendMessage`,不是直接投信 —— ingress 那一行
 *    「落库之后投房间」就是本期的接线点之一。
 *
 * 唯一的替身是三个端口(心智 / 裁决 / 工作),理由见 `CollabV3RuntimeOptions.ports`:
 * 环闭不闭得上与「今天这个模型想说什么」是两个问题。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeSession {
  id: string
  name: string
  kind?: string
  agentId?: string
  isArchived?: boolean
  modelPinned?: boolean
  permissionMode?: string
  workingDirectory?: string
  collab?: Record<string, unknown>
  room?: {
    memberAgentIds: string[]
    frozen?: boolean
    dm?: boolean
    budgets?: Record<string, number>
  }
  messages: Array<Record<string, unknown>>
}

const AGENTS: Record<string, { id: string; name: string; systemPrompt: string }> = {
  fe: { id: 'fe', name: '小李', systemPrompt: '前端' },
  pm: { id: 'pm', name: '阿明', systemPrompt: '产品' },
}

const mocks = vi.hoisted(() => ({
  storePath: '',
  sessions: new Map<string, unknown>(),
  emitted: [] as Array<{ sessionId: string; event: Record<string, unknown> }>,
  deleteListeners: [] as Array<(ids: readonly string[]) => void>,
  aborted: [] as string[],
  /** 喊停时被显式中断的外部执行会话(E4/G10)。 */
  externallyInterrupted: [] as string[],
}))

/**
 * 外部执行体的中断口(E4/G10)。`engine.abort` 只掐我们这一侧的流,外部 agent 的
 * 思考在别的进程里 —— 喊停必须再走这一道,否则「停了」之后它还在跑工具。
 */
vi.mock('../../../external-agents/index.js', () => ({
  interruptExternalAgentSessions: async (sessionId: string) => {
    mocks.externallyInterrupted.push(sessionId)
  },
}))

vi.mock('../../../stores/paths.js', () => ({
  getStorePath: () => mocks.storePath,
  getOnethingStorePath: () => mocks.storePath,
}))

vi.mock('../../../usage/index.js', () => ({
  getUsageLedger: () => ({ readRecordsInRange: async () => [] }),
}))

vi.mock('../../../usage/bill-side-line.js', () => ({
  billCollabPlanUsage: () => () => {},
}))

vi.mock('../../../providers/index.js', () => ({
  generateChatResponse: async () => '',
}))

vi.mock('../../../engine/stream/provider-helpers.js', () => ({
  getEffectiveProviderConfig: () => ({ providerId: '', providerConfig: null, model: '' }),
  resolveProviderAuth: async () => null,
}))

vi.mock('../../../engine/index.js', () => ({
  getStreamEngine: () => engineStub(),
  getStreamEngineSafe: () => engineStub(),
}))

vi.mock('../../../agents/index.js', () => ({
  findAgent: (id: string) => AGENTS[id],
  listAgents: () => Object.values(AGENTS),
  displayAgent: (id: string) => AGENTS[id],
}))

vi.mock('../../../events/index.js', () => ({
  getEventBus: () => ({
    emit: async (sessionId: string, event: Record<string, unknown>) => {
      mocks.emitted.push({ sessionId, event })
    },
    onAny: () => () => {},
    onAnySession: () => () => {},
  }),
}))

vi.mock('../../../store.js', () => ({
  getSettings: () => ({}),
  getSession: (id: string) => mocks.sessions.get(id),
  getSessionsList: () => [...mocks.sessions.values()],
  addMessage: (sessionId: string, message: Record<string, unknown>) => {
    (mocks.sessions.get(sessionId) as FakeSession | undefined)?.messages.push(message)
  },
  createSession: (id: string, name: string) => createFake(id, name),
  createSessionWithoutFocus: (id: string, name: string) => createFake(id, name),
  updateSessionCollab: (id: string, patch: Record<string, unknown>) => {
    const session = mocks.sessions.get(id) as FakeSession | undefined
    if (!session) return false
    Object.assign(session, patch)
    return true
  },
  updateSessionAgent: (id: string, agentId: string) => {
    const session = mocks.sessions.get(id) as FakeSession | undefined
    if (session) session.agentId = agentId
    return true
  },
  updateSessionArchived: (id: string, archived: boolean) => {
    const session = mocks.sessions.get(id) as FakeSession | undefined
    if (session) session.isArchived = archived
    return true
  },
  updateSessionWorkingDirectory: () => true,
  updateSessionPermissionMode: () => true,
  updateMessageMentions: () => true,
  updateMessageReplyTo: () => true,
  renameSession: () => true,
  onSessionsDeleted: (listener: (ids: readonly string[]) => void) => {
    mocks.deleteListeners.push(listener)
    return () => {
      mocks.deleteListeners = mocks.deleteListeners.filter(entry => entry !== listener)
    }
  },
}))

function engineStub(): Record<string, unknown> {
  return {
    hasCommandTarget: () => true,
    getChannel: () => 'ipc',
    abort: (sessionId: string) => {
      mocks.aborted.push(sessionId)
      return true
    },
    steerMessage: () => {},
    retractSteerMessage: () => {},
  }
}

function createFake(id: string, name: string): FakeSession {
  const session: FakeSession = { id, name, messages: [] }
  mocks.sessions.set(id, session)
  return session
}

/* ── 被测模块(mock 之后再 import) ──────────────────────────────────────── */

const {
  drainCollabV3Runtime,
  initializeCollabV3Runtime,
  isCollabV3RuntimeRunning,
  peekCollabV3Agent,
  peekCollabV3Room,
  peekCollabV3RoomSnapshot,
  shutdownCollabV3Runtime,
  stopCollabV3RoomFloor,
  warmCollabV3Agents,
} = await import('../runtime.js')
const { handleCollabRoomSendMessage } = await import('../../ingress.js')
const { createCollabScriptedMindPort } = await import('../mind-port.js')
const { createCollabScriptedRefereeJudgePort } = await import('../referee-actor.js')
const { collabV3MigrationMarkerPath, readCollabV3MigrationMarker } = await import('../migrate.js')
const { beginCollabV3Turn, endCollabV3Turn, findCollabV3Turn } = await import('../turn-context.js')
const { getCollabAgentActivity } = await import('../../agent-activity.js')
const { readCollabSchedulerLogTail } = await import('../scheduler-log.js')
const { speakIntoCollabRoom } = await import('../../say-tool.js')
const { COLLAB_SAY_SOURCE } = await import('@onething/runtime/collab')
const { isTrustedCollabDrive } = await import('../../drive-guard.js')

const ROOM = 'room-1'

function seedRoom(members: string[] = ['fe', 'pm']): FakeSession {
  const room: FakeSession = {
    id: ROOM,
    name: '产品群',
    kind: 'room',
    room: { memberAgentIds: members },
    messages: [],
  }
  mocks.sessions.set(ROOM, room)
  return room
}

function roomMessages(): Array<Record<string, unknown>> {
  return (mocks.sessions.get(ROOM) as FakeSession).messages
}

beforeEach(() => {
  mocks.storePath = fs.mkdtempSync(path.join(os.tmpdir(), 'collab-v3-wiring-'))
  mocks.sessions.clear()
  mocks.emitted.length = 0
  mocks.deleteListeners.length = 0
  mocks.aborted.length = 0
})

afterEach(async () => {
  await shutdownCollabV3Runtime()
  await new Promise(resolve => setTimeout(resolve, 0))
  fs.rmSync(mocks.storePath, { recursive: true, force: true })
})

describe('D6-a 装配:一条用户消息走完整条环', () => {
  it('@ 直通授牌 → 心智回合 → speak → 转录 + 广播 + 已读水位', async () => {
    seedRoom()
    const mind = createCollabScriptedMindPort([
      { agentId: 'fe', roomId: ROOM, says: ['收到,我来看看'] },
    ])
    // 裁判判"这一轮没别人该说" —— 于是唯一的发言者是被 @ 直通授牌的那位,
    // 这条用例问的就是**直通**那条路。
    const judge = createCollabScriptedRefereeJudgePort([{ roomId: ROOM, grants: [] }])
    await initializeCollabV3Runtime({ ports: { mind, judge } })
    await warmCollabV3Agents()

    const consumed = await handleCollabRoomSendMessage(ROOM, {
      content: '@小李 帮我看下登录页',
      mentions: [{ agentId: 'fe', label: '小李' }],
    })
    expect(consumed).toBe(true)
    await drainCollabV3Runtime()

    // ① 用户那条落了库(ingress 的职责),房间没有重复写第二条。
    const messages = roomMessages()
    expect(messages.filter(message => message.role === 'user')).toHaveLength(1)

    // ② 牌真的发出去了,而且是发给被 @ 的那位。
    expect(mind.calls).toHaveLength(1)
    expect(mind.calls[0]?.agentId).toBe('fe')
    expect(mind.calls[0]?.roomSessionId).toBe(ROOM)
    // drive 里带着房间投影(用户那句话在里面),这是「接对了投影」的判据。
    expect(mind.calls[0]?.driveContent).toContain('帮我看下登录页')

    // ③ 说出去的话进了房间转录,署的是它自己的名。
    const spoken = messages.find(message => message.agentId === 'fe')
    expect(spoken?.content).toBe('收到,我来看看')

    // ④ 链闸记了一格(链数 = 发出去的牌数),牌已经交回。
    const account = peekCollabV3Room(ROOM)?.account
    expect(account?.chainCount).toBe(1)
    expect(account?.floor.active ?? []).toHaveLength(0)

    // ⑤ 已读水位推到了它这一轮读到的地方。
    const agentRoom = peekCollabV3Agent('fe')?.account.rooms[ROOM]
    expect(agentRoom?.readMessageId).toBeTruthy()
    expect(agentRoom?.turns).toBe(1)

    // ⑥ C4 快照走 `collab:coordinator-changed` 播出去过。
    const broadcasts = mocks.emitted.filter(
      entry => entry.event.type === 'collab:coordinator-changed',
    )
    expect(broadcasts.length).toBeGreaterThan(0)
    expect(peekCollabV3RoomSnapshot(ROOM)?.gates.chain.value).toBe(1)
  })

  it('没被 @ 的群消息走裁判:一次调用判一批候选(O(1))', async () => {
    seedRoom()
    const mind = createCollabScriptedMindPort([
      { agentId: 'pm', roomId: ROOM, says: ['我来接'] },
    ])
    const judge = createCollabScriptedRefereeJudgePort([{ roomId: ROOM, grants: ['pm'] }])
    await initializeCollabV3Runtime({ ports: { mind, judge } })
    await warmCollabV3Agents()

    await handleCollabRoomSendMessage(ROOM, { content: '这个需求谁跟一下' })
    await drainCollabV3Runtime()

    // 两个人都举了手,而这一批只买了**一次**调用 —— qm P0-2 的 O(N)→O(1) 就是
    // 这句话:候选数 2,调用数 1。(一拍防抖让两只手进同一批,见
    // `JUDGMENT_DEBOUNCE_MS`;后面还会开第二扇窗,那是**下一条消息**的事。)
    expect(judge.calls[0]?.candidates.map(hand => hand.agentId).sort()).toEqual(['fe', 'pm'])
    // 只有被点到的那位跑了回合。
    expect(mind.calls.map(call => call.agentId)).toEqual(['pm'])
    expect(roomMessages().some(message => message.agentId === 'pm')).toBe(true)
  })
})

describe('D6-a 装配:喊停清三样', () => {
  it('掐流 + 换代作废在外的牌 + 清空举手', async () => {
    // 单成员房:这条用例问的是**喊停**,而多一位同事只会在停下之后又举一次手
    // (那是停之后的新事件,不是没清干净)—— 用最小的房把噪声关掉。
    seedRoom(['fe'])
    const mind = createCollabScriptedMindPort([
      { agentId: 'fe', roomId: ROOM, says: ['我想想'] },
    ])
    const judge = createCollabScriptedRefereeJudgePort([{ roomId: ROOM, grants: [] }])
    mind.hold()
    await initializeCollabV3Runtime({ ports: { mind, judge } })
    await warmCollabV3Agents()

    await handleCollabRoomSendMessage(ROOM, {
      content: '@小李 在吗',
      mentions: [{ agentId: 'fe', label: '小李' }],
    })
    // 回合挂住:牌在外面,登记簿里有一条。
    let epochBefore = 0
    try {
      await vi.waitFor(() => {
        expect(mind.calls.length).toBeGreaterThan(0)
      })
      const before = peekCollabV3Room(ROOM)!.account
      epochBefore = before.floor.epoch
      expect(before.floor.active.length).toBe(1)

      /**
       * 回合登记簿。生产里这一笔由 `engine-mind-port` 在起流之前落下(工具要靠它
       * 找票);剧本化的假端口不驱动引擎,所以这里手工补一条,问的仍然是接线本身
       * ——「喊停按住的是登记簿里那几条执行会话」。
       */
      beginCollabV3Turn({
        agentId: 'fe',
        roomSessionId: ROOM,
        execSessionId: mind.calls[0]!.execSessionId,
        leaseId: mind.calls[0]!.leaseId,
        epoch: peekCollabV3Room(ROOM)!.account.floor.epoch,
        startedAt: Date.now(),
      })

      const stopped = stopCollabV3RoomFloor(ROOM)
      expect(stopped).toBe(true)
      // ① 在飞的执行会话被掐了。
      expect(mocks.aborted).toContain(mind.calls[0]!.execSessionId)
      expect(findCollabV3Turn(mind.calls[0]!.execSessionId)).toBeTruthy()
      /**
       * ①-b 外部执行体**再停一次**(E4/G10)。它是异步的(动态 import),所以等
       * 一下;等不到就是「界面说停了、CLI 还在跑」那个旧状态。
       */
      await vi.waitFor(() => {
        expect(mocks.externallyInterrupted).toContain(mind.calls[0]!.execSessionId)
      })
    } finally {
      // 挂住的端口必须放开,否则收摊会等一个永远不来的回合。
      mind.release()
    }
    await drainCollabV3Runtime()

    const after = peekCollabV3Room(ROOM)!.account
    // ② 换代:代数 +1,在外的牌全部作废。
    expect(after.floor.epoch).toBe(epochBefore + 1)
    expect(after.floor.active).toHaveLength(0)
    // ③ 排着的手一并清空 —— 喊停停的是这一段,不是把它排到下一段。
    expect(after.hands).toHaveLength(0)
    // 被撤牌的那一轮不再往房间里说话。
    expect(roomMessages().some(message => message.content === '我想想')).toBe(false)
  })

  it('不是 v3 房时返回 null,让调用方回落 v2', () => {
    expect(stopCollabV3RoomFloor('chat-1')).toBeNull()
  })
})

describe('D6-a 装配:send_message 走租约', () => {
  it('回合语境里的一句话经房间落库,拿不出票的一句被拒', async () => {
    seedRoom(['fe'])
    const mind = createCollabScriptedMindPort([{ agentId: 'fe', roomId: ROOM, says: [] }])
    mind.hold()
    await initializeCollabV3Runtime({ ports: { mind } })
    await warmCollabV3Agents()

    await handleCollabRoomSendMessage(ROOM, {
      content: '@小李 报个数',
      mentions: [{ agentId: 'fe', label: '小李' }],
    })
    await vi.waitFor(() => {
      expect(mind.calls.length).toBeGreaterThan(0)
    })
    const call = mind.calls[0]!
    const chainBefore = peekCollabV3Room(ROOM)!.account.chainCount

    try {
      // 生产里这一笔由 `engine-mind-port` 落下;这里手工补,问的是**工具那一侧**。
      beginCollabV3Turn({
        agentId: 'fe',
        roomSessionId: ROOM,
        execSessionId: call.execSessionId,
        leaseId: call.leaseId,
        epoch: peekCollabV3Room(ROOM)!.account.floor.epoch,
        startedAt: Date.now(),
      })

      const said = await speakIntoCollabRoom({ sessionId: call.execSessionId, content: '3' })
      expect(said.ok).toBe(true)
      const spoken = roomMessages().find(message => message.id === said.messageId)
      // 落库的是房间写下的那一条:署它的名、带 say 的来源标记。
      expect(spoken?.agentId).toBe('fe')
      expect(spoken?.source).toBe(COLLAB_SAY_SOURCE)
      // **说话不计链**:链数是发出的牌数,牌在发的时候就计过了(§2 的口径变化)。
      expect(peekCollabV3Room(ROOM)!.account.chainCount).toBe(chainBefore)

      // 同一句话再来一次 = 幂等窗命中,同一个 id,群里仍然只有一条。
      const again = await speakIntoCollabRoom({ sessionId: call.execSessionId, content: '3' })
      expect(again.messageId).toBe(said.messageId)
      expect(roomMessages().filter(message => message.content === '3')).toHaveLength(1)

      // 票作废之后开不了口:房间的验票在 `applyCollabRoomSpeak` 的第一行。
      beginCollabV3Turn({
        agentId: 'fe',
        roomSessionId: ROOM,
        execSessionId: call.execSessionId,
        leaseId: 'lease-forged',
        epoch: 0,
        startedAt: Date.now(),
      })
      const refused = await speakIntoCollabRoom({ sessionId: call.execSessionId, content: '4' })
      expect(refused.ok).toBe(false)
      expect(refused.error).toBeTruthy()
    } finally {
      mind.release()
    }
    await drainCollabV3Runtime()
  })
})

describe('D6-a 装配:迁移是一趟单向门', () => {
  it('marker 门控 —— 起两次只迁一次', async () => {
    seedRoom()
    await initializeCollabV3Runtime({ ports: { mind: createCollabScriptedMindPort() } })
    expect(fs.existsSync(collabV3MigrationMarkerPath())).toBe(true)
    const first = readCollabV3MigrationMarker()
    expect(first?.at).toBeTruthy()

    await shutdownCollabV3Runtime()
    await initializeCollabV3Runtime({ ports: { mind: createCollabScriptedMindPort() } })
    // 第二趟整体跳过:marker 里那个时刻一个字节都没变。
    expect(readCollabV3MigrationMarker()?.at).toBe(first?.at)
  })
})

describe('D6-a 装配:生命周期', () => {
  it('起停幂等,而且收摊之后令牌与发言口一起作废', async () => {
    seedRoom()
    await initializeCollabV3Runtime({ ports: { mind: createCollabScriptedMindPort() } })
    await initializeCollabV3Runtime({ ports: { mind: createCollabScriptedMindPort() } })
    expect(isCollabV3RuntimeRunning()).toBe(true)
    // 令牌是 drive 的凭据:起来之后随便一个假令牌都进不去,而真令牌进得去。
    expect(isTrustedCollabDrive({ collabDriveToken: 'nope' })).toBe(false)

    await shutdownCollabV3Runtime()
    await shutdownCollabV3Runtime()
    expect(isCollabV3RuntimeRunning()).toBe(false)
    // 收摊之后没有协调器可以签发令牌 —— fail closed。
    expect(isTrustedCollabDrive({ collabDriveToken: 'nope' })).toBe(false)
    expect(peekCollabV3RoomSnapshot(ROOM)).toBeNull()
  })
})

/**
 * D8 观测体系 O1:**发射时机**(docs/design/collab-v3-observability.md §3.1/§3.2)。
 *
 * O0 把该有的格子接上了真数,而一份没人播的真数与没有是一回事 —— 用户看到的仍然
 * 是上一次顺带播出去的那一帧。这一组问的全部是「变了之后有没有人被告知」。
 */
describe('D8 O1:agent 快照的发射与补水', () => {
  function agentChanges(agentId: string): Array<Record<string, unknown>> {
    return mocks.emitted
      .filter(entry => entry.event.type === 'collab:agent-changed')
      .map(entry => entry.event.activity as Record<string, unknown>)
      .filter(activity => activity.agentId === agentId)
  }

  /**
   * 亮灯与灭灯是**两处**产生点,而中间那一段被节流合并掉是对的 —— 所以这条用例
   * 不数帧数,它数的是「thinking 这一帧到底有没有到过渲染层」。挂住心智端口让
   * 那一态停住,是让它可被观测的唯一办法(不挂住的话整条环在一个节流窗里跑完,
   * 出去的只有终态)。
   */
  it('大脑亮灯与灭灯各有一处产生点,序列合理且 seq 单调', async () => {
    seedRoom(['fe'])
    const mind = createCollabScriptedMindPort([
      { agentId: 'fe', roomId: ROOM, says: ['收到'] },
    ])
    const judge = createCollabScriptedRefereeJudgePort([{ roomId: ROOM, grants: [] }])
    mind.hold()
    await initializeCollabV3Runtime({ ports: { mind, judge } })
    await warmCollabV3Agents()

    await handleCollabRoomSendMessage(ROOM, {
      content: '@小李 看下登录页',
      mentions: [{ agentId: 'fe', label: '小李' }],
    })
    try {
      await vi.waitFor(() => {
        expect(agentChanges('fe').map(activity => (activity.mind as { state: string }).state))
          .toContain('thinking')
      })
      // 「持牌等大脑」与「生成中」在同一份快照里分得开:牌在手上,登记簿还空着。
      const thinking = agentChanges('fe').find(
        activity => (activity.mind as { state: string }).state === 'thinking',
      )
      expect(thinking?.heldLeases).toEqual([
        expect.objectContaining({ roomSessionId: ROOM, executing: false }),
      ])
    } finally {
      mind.release()
    }
    await drainCollabV3Runtime()

    await vi.waitFor(() => {
      expect(agentChanges('fe').at(-1)?.mind).toEqual({ state: 'idle' })
    })
    const changes = agentChanges('fe')
    // 号单调:渲染层拿它做的是「比屏幕上那份新吗」的判断,倒退一次就画错一帧。
    const seqs = changes.map(activity => activity.seq as number)
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b))
    expect(new Set(seqs).size).toBe(seqs.length)
    // 收尾那一份:牌交了、卡没有、积压清了。
    expect(changes.at(-1)?.heldLeases).toEqual([])
  })

  it('快照播到房间会话上 —— agent 快照没有自己的会话,信封挂在它牵涉到的房', async () => {
    seedRoom()
    const mind = createCollabScriptedMindPort([{ agentId: 'fe', roomId: ROOM, says: ['嗯'] }])
    const judge = createCollabScriptedRefereeJudgePort([{ roomId: ROOM, grants: [] }])
    await initializeCollabV3Runtime({ ports: { mind, judge } })
    await warmCollabV3Agents()

    await handleCollabRoomSendMessage(ROOM, {
      content: '@小李 在吗',
      mentions: [{ agentId: 'fe', label: '小李' }],
    })
    await drainCollabV3Runtime()

    const envelopes = mocks.emitted.filter(entry => entry.event.type === 'collab:agent-changed')
    expect(envelopes.length).toBeGreaterThan(0)
    expect(new Set(envelopes.map(entry => entry.sessionId))).toEqual(new Set([ROOM]))
  })

  it('GET 补水读的是当前号,九格从真运行时现算', async () => {
    seedRoom()
    const mind = createCollabScriptedMindPort([{ agentId: 'fe', roomId: ROOM, says: ['嗯'] }])
    const judge = createCollabScriptedRefereeJudgePort([{ roomId: ROOM, grants: [] }])
    await initializeCollabV3Runtime({ ports: { mind, judge } })
    await warmCollabV3Agents()

    await handleCollabRoomSendMessage(ROOM, {
      content: '@小李 在吗',
      mentions: [{ agentId: 'fe', label: '小李' }],
    })
    await drainCollabV3Runtime()

    const [activity] = getCollabAgentActivity(['fe'])
    expect(activity?.agentId).toBe('fe')
    // 跑完一轮之后:大脑空了、牌交了、积压清了、说过话了。
    expect(activity?.mind).toEqual({ state: 'idle' })
    expect(activity?.heldLeases).toEqual([])
    expect(activity?.inbox.depth).toBe(0)
    expect(activity?.lastSpokeAt).toBeGreaterThan(0)
    expect(activity?.deadLetterCount).toBe(0)

    // **读不发号**:补水连着两次,号不动。
    const seq = activity?.seq ?? -1
    expect(getCollabAgentActivity(['fe'])[0]?.seq).toBe(seq)
    // 而它必须是这条通道真的播过的那个号(不是恒 0)。
    expect(seq).toBeGreaterThan(0)
  })

  it('没在跑循环的同事也回一份空闲快照,不是被跳过', async () => {
    seedRoom()
    await initializeCollabV3Runtime({ ports: { mind: createCollabScriptedMindPort() } })
    const [ghost] = getCollabAgentActivity(['ghost'])
    expect(ghost).toMatchObject({ agentId: 'ghost', mind: { state: 'idle' }, deadLetterCount: 0 })
  })
})

describe('D8 O1:房间快照的发射时机', () => {
  function coordinatorStates(): Array<Record<string, unknown>> {
    return mocks.emitted
      .filter(entry => entry.event.type === 'collab:coordinator-changed')
      .map(entry => (entry.event.state as Record<string, unknown>))
  }

  function judgmentStates(): Array<string | undefined> {
    return coordinatorStates().map(
      state => (state.judgment as { state: string } | undefined)?.state,
    )
  }

  /**
   * 防抖与在飞在 O1 之前长得一模一样(房账在开窗那一刻就是 `pending`),而它们的
   * 等待理由完全不同:一个几十毫秒后自解,一个正在烧一次模型调用。裁判端口挂住,
   * 于是「在飞」这一态停住可被观测 —— 真机上它通常只有一两秒。
   */
  it('裁决窗:防抖(钱还没花)与在飞(正在烧)是两个样子,而且各自播过', async () => {
    seedRoom()
    const mind = createCollabScriptedMindPort([{ agentId: 'pm', roomId: ROOM, says: ['我来接'] }])
    const judge = createCollabScriptedRefereeJudgePort([{ roomId: ROOM, hangs: true }])
    await initializeCollabV3Runtime({ ports: { mind, judge } })
    await warmCollabV3Agents()

    await handleCollabRoomSendMessage(ROOM, { content: '这个需求谁跟一下' })

    // ① 那一拍还没过完:虚点。
    await vi.waitFor(() => {
      expect(peekCollabV3RoomSnapshot(ROOM)?.judgment.state).toBe('debouncing')
    }, { interval: 5, timeout: 2_000 })
    // ② 一拍过完:调用起飞(裁判挂着,所以这一态稳定)。
    await vi.waitFor(() => {
      expect(peekCollabV3RoomSnapshot(ROOM)?.judgment.state).toBe('inflight')
    }, { interval: 5, timeout: 2_000 })

    // 两态都**播出去过** —— 只在 GET 里看得见等于没有:界面靠推送活着。
    await vi.waitFor(() => {
      expect(judgmentStates()).toContain('debouncing')
      expect(judgmentStates()).toContain('inflight')
    }, { interval: 10, timeout: 2_000 })
  })

  /**
   * 第三处转变:窗**关掉**。
   *
   * 判完与降级在这一处走同一条路 —— `applyCollabRoomSetPolicy` 在同一次 `decide`
   * 里把窗结掉并立刻按结果发牌,所以 `degraded` 那一格是同一步之内被消费掉的
   * (它的完整成因落在时间轴的 `judge-degraded` 行上,那是 O0 的活)。O1 在这里
   * 该保证的只有一件事:**关窗这一帧没有被吞掉**。
   */
  it('裁决窗关掉的那一帧也播得出去,降级的成因落在时间轴上', async () => {
    seedRoom()
    const mind = createCollabScriptedMindPort([{ agentId: 'pm', roomId: ROOM, says: ['我来接'] }])
    const judge = createCollabScriptedRefereeJudgePort([{ roomId: ROOM, degraded: true }])
    await initializeCollabV3Runtime({ ports: { mind, judge } })
    await warmCollabV3Agents()

    await handleCollabRoomSendMessage(ROOM, { content: '这个需求谁跟一下' })
    await drainCollabV3Runtime()

    // 窗关了,而且这一帧真的播出去过(在飞那一态之后必须有一帧把转圈收掉,
    // 否则状态条会永远停在"正在判"上)。
    await vi.waitFor(() => {
      expect(judgmentStates()).toContain('idle')
    }, { interval: 10, timeout: 2_000 })
    expect(peekCollabV3RoomSnapshot(ROOM)?.judging).toBe(0)

    // 降级本身没有从系统里消失 —— 它在时间轴上,带着成因与耗时。
    const rows = readCollabSchedulerLogTail(ROOM, { types: ['judge-degraded'] })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ type: 'judge-degraded' })
  })

  it('登记簿的起落各推一次房间快照 —— 「持牌 N · 生成中 M」里的 M 要活', async () => {
    seedRoom(['fe'])
    const mind = createCollabScriptedMindPort([{ agentId: 'fe', roomId: ROOM, says: ['我想想'] }])
    const judge = createCollabScriptedRefereeJudgePort([{ roomId: ROOM, grants: [] }])
    mind.hold()
    await initializeCollabV3Runtime({ ports: { mind, judge } })
    await warmCollabV3Agents()

    await handleCollabRoomSendMessage(ROOM, {
      content: '@小李 在吗',
      mentions: [{ agentId: 'fe', label: '小李' }],
    })
    try {
      await vi.waitFor(() => {
        expect(mind.calls.length).toBeGreaterThan(0)
      })
      const lease = peekCollabV3Room(ROOM)!.account.floor.active[0]!
      // 牌在外面、登记簿是空的 = 「持牌等大脑」(v3 特有的第三种状态)。
      expect(peekCollabV3RoomSnapshot(ROOM)?.turns.map(turn => turn.executing)).toEqual([false])

      mocks.emitted.length = 0
      beginCollabV3Turn({
        agentId: 'fe',
        roomSessionId: ROOM,
        execSessionId: mind.calls[0]!.execSessionId,
        leaseId: lease.leaseId,
        epoch: lease.epoch,
        startedAt: Date.now(),
      })
      // 登记那一刻就播,而且播的是**翻面之后**的那一份。
      await vi.waitFor(() => {
        expect(coordinatorStates().length).toBeGreaterThan(0)
      })
      expect(peekCollabV3RoomSnapshot(ROOM)?.turns.map(turn => turn.executing)).toEqual([true])
      expect(
        coordinatorStates().at(-1)?.turns as Array<{ executing: boolean }>,
      ).toEqual([expect.objectContaining({ executing: true })])

      mocks.emitted.length = 0
      endCollabV3Turn(mind.calls[0]!.execSessionId, lease.leaseId)
      await vi.waitFor(() => {
        expect(coordinatorStates().length).toBeGreaterThan(0)
      })
      expect(
        coordinatorStates().at(-1)?.turns as Array<{ executing: boolean }>,
      ).toEqual([expect.objectContaining({ executing: false })])
    } finally {
      mind.release()
    }
    await drainCollabV3Runtime()
  })
})
