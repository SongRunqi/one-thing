/**
 * `dm` 工具的执行器(docs/design/agent-im-dm.md D5/§3.4)。
 *
 * 纯规则测不到、只有在 store 边界上才成立的四件事:
 *  1. 成功路径的三步是**既有链路**:建房(ensureAgentDmRoom)→ 用 say 的执行器
 *     落库(显式指定房间,于是转义/白名单/幂等窗全继承)→ 入队激活对方;
 *  2. 每一种拒绝都说清是哪一种(退休 ≠ service ≠ 查无此人 ≠ 自己),因为模型
 *     要据此改做别的事;
 *  3. 拒绝时**不建房**、不落消息、不入队 —— 一次失败的 dm 不该在侧栏留下一间
 *     空房;
 *  4. say 侧的拒绝(冻结/超预算)原样透传,而且透传时不会去激活任何人。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

interface FakeSession {
  id: string
  name: string
  kind?: string
  agentId?: string
  room?: { memberAgentIds?: string[]; dm?: boolean }
  messages: unknown[]
}

const AGENTS: Record<string, { id: string; name: string; kind?: string; status?: string }> = {
  fe: { id: 'fe', name: '小李' },
  pm: { id: 'pm', name: '阿明' },
  dj: { id: 'dj', name: '电台 DJ', kind: 'service' },
  gone: { id: 'gone', name: '老王', status: 'retired' },
}

const mocks = vi.hoisted(() => ({
  sessions: new Map<string, unknown>(),
  created: [] as string[],
  currentSessionId: 'chat-user-was-here',
  said: [] as Array<{ sessionId: string; content: string; room?: string }>,
  sayResult: { ok: true, messageId: 'msg-1' } as { ok: boolean; messageId?: string; error?: string },
  enqueued: [] as Array<{ roomSessionId: string; activations: unknown; sourceMessageId?: string }>,
}))

vi.mock('../../store.js', () => ({
  getSession: (id: string) => mocks.sessions.get(id),
  createSession: (id: string, name: string) => {
    const session: FakeSession = { id, name, messages: [] }
    mocks.sessions.set(id, session)
    mocks.created.push(id)
    mocks.currentSessionId = id
    return session
  },
  getCurrentSessionId: () => mocks.currentSessionId,
  setCurrentSessionId: (id: string) => { mocks.currentSessionId = id },
  updateSessionAgent: vi.fn(),
  updateSessionCollab: (
    id: string,
    fields: { kind?: string | null; room?: FakeSession['room'] | null },
  ) => {
    const session = mocks.sessions.get(id) as FakeSession | undefined
    if (!session) return false
    if (fields.kind !== undefined) session.kind = fields.kind ?? undefined
    if (fields.room !== undefined) session.room = fields.room ?? undefined
    return true
  },
  renameSession: (id: string, name: string) => {
    const session = mocks.sessions.get(id) as FakeSession | undefined
    if (session) session.name = name
  },
  updateSessionArchived: vi.fn(),
}))

vi.mock('../../agents/index.js', () => ({ findAgent: (id: string) => AGENTS[id] ?? null }))

vi.mock('../say-tool.js', () => ({
  speakIntoCollabRoom: async (input: { sessionId: string; content: string; room?: string }) => {
    mocks.said.push(input)
    return mocks.sayResult
  },
}))

vi.mock('../queue.js', () => ({
  enqueue: (
    roomSessionId: string,
    _runtime: unknown,
    activations: unknown,
    sourceMessageId?: string,
  ) => {
    mocks.enqueued.push({ roomSessionId, activations, sourceMessageId })
  },
}))

vi.mock('../room-runtime.js', () => ({
  roomRuntime: (roomSessionId: string) => ({ roomSessionId }),
}))

const { DmTool, sendCollabDm } = await import('../dm-tool.js')

const EXEC = 'agent-exec-fe-room-1'
const PAIR_ROOM = 'agent-dm-room-fe--pm'

function ctx(sessionId: string) {
  return { sessionId, messageId: 'm-1', metadata: vi.fn() } as never
}

beforeEach(() => {
  mocks.sessions.clear()
  mocks.created.length = 0
  mocks.said.length = 0
  mocks.enqueued.length = 0
  mocks.currentSessionId = 'chat-user-was-here'
  mocks.sayResult = { ok: true, messageId: 'msg-1' }
  mocks.sessions.set(EXEC, {
    id: EXEC,
    name: '小李 · 官网改版组',
    kind: 'agent',
    agentId: 'fe',
    messages: [],
  } satisfies FakeSession)
})

describe('成功路径', () => {
  it('建房 → 用 say 的执行器落进那间房 → 激活对方', async () => {
    const result = await sendCollabDm({ sessionId: EXEC, to: 'pm', message: '接口这块想跟你对一下' })

    expect(result).toEqual({
      ok: true,
      roomSessionId: PAIR_ROOM,
      messageId: 'msg-1',
      peerName: '阿明',
    })
    expect(mocks.created).toEqual([PAIR_ROOM])
    // 房间是**显式**指定的:发言落在哪间房不靠会话指针猜。
    expect(mocks.said).toEqual([
      { sessionId: EXEC, content: '接口这块想跟你对一下', room: PAIR_ROOM },
    ])
    // 激活理由是 'mention' —— dm 就是点名,该走满格链长闸、该被去重。
    expect(mocks.enqueued).toEqual([{
      roomSessionId: PAIR_ROOM,
      activations: [{ agentId: 'pm', reason: 'mention' }],
      sourceMessageId: 'msg-1',
    }])
  })

  it('第二次 dm 同一个人复用同一间房(幂等由 id 构造保证)', async () => {
    await sendCollabDm({ sessionId: EXEC, to: 'pm', message: '第一句' })
    await sendCollabDm({ sessionId: EXEC, to: 'pm', message: '第二句' })
    expect(mocks.created).toEqual([PAIR_ROOM])
    expect(mocks.enqueued).toHaveLength(2)
  })

  it('工具回执点名对方,并说明用户也看得见(D4 透明制)', async () => {
    const result = await DmTool.execute({ to: 'pm', message: '在吗' }, ctx(EXEC))
    expect(result.output).toContain('阿明')
    expect(result.output).toContain('用户也看得见')
    expect(result.metadata).toMatchObject({ ok: true, roomSessionId: PAIR_ROOM, messageId: 'msg-1' })
  })
})

describe('拒绝路径:说清是哪一种,而且什么都不留下', () => {
  const cases: Array<{ name: string; to: string; contains: string }> = [
    { name: '已退休', to: 'gone', contains: '已注销' },
    { name: 'service agent', to: 'dj', contains: '不是同事' },
    { name: '查无此人', to: 'ghost', contains: '没有 id 为「ghost」的同事' },
    { name: '自己', to: 'fe', contains: '不能给自己发私聊' },
    { name: '空 to', to: '   ', contains: 'to 填花名册里的 agent id' },
  ]

  for (const testCase of cases) {
    it(`${testCase.name}:拒绝有话说,不建房、不落消息、不入队`, async () => {
      const result = await sendCollabDm({ sessionId: EXEC, to: testCase.to, message: '在吗' })
      expect(result.ok).toBe(false)
      expect(result.error).toContain(testCase.contains)
      expect(mocks.created).toEqual([])
      expect(mocks.said).toEqual([])
      expect(mocks.enqueued).toEqual([])
    })
  }

  it('普通 chat 会话不给 dm:直播式对话里没有"私下问问"这件事', async () => {
    mocks.sessions.set('chat-1', {
      id: 'chat-1',
      name: '普通会话',
      agentId: 'fe',
      messages: [],
    } satisfies FakeSession)
    const result = await sendCollabDm({ sessionId: 'chat-1', to: 'pm', message: '在吗' })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('dm 只在群聊/私聊/工作台的回合里可用')
    expect(mocks.created).toEqual([])
    expect(mocks.said).toEqual([])
  })

  it('工作台会话可以 dm(干活时问同事一句是正当的)', async () => {
    mocks.sessions.set('work-1', {
      id: 'work-1',
      name: '工作台',
      kind: 'work',
      agentId: 'fe',
      messages: [],
    } satisfies FakeSession)
    const result = await sendCollabDm({ sessionId: 'work-1', to: 'pm', message: '这个字段你那边叫什么' })
    expect(result.ok).toBe(true)
    expect(mocks.said[0]?.room).toBe(PAIR_ROOM)
  })

  it('会话没有属主 agent(不是一个 agent 的回合):发不出去', async () => {
    mocks.sessions.set('chat-1', { id: 'chat-1', name: '普通会话', messages: [] } satisfies FakeSession)
    const result = await sendCollabDm({ sessionId: 'chat-1', to: 'pm', message: '在吗' })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('没有可用的发言身份')
    expect(mocks.created).toEqual([])
  })

  it('工具层把拒绝原样交给模型,并标 ok:false', async () => {
    const result = await DmTool.execute({ to: 'gone', message: '在吗' }, ctx(EXEC))
    expect(result.title).toContain('未送达')
    expect(result.output).toContain('已注销')
    expect(result.metadata).toEqual({ ok: false })
  })
})

describe('say 侧的拒绝原样透传', () => {
  it('冻结/超预算:错误话术不改写,而且不激活任何人', async () => {
    mocks.sayResult = { ok: false, error: '房间已暂停,你的发言没有送达。' }
    const result = await sendCollabDm({ sessionId: EXEC, to: 'pm', message: '在吗' })
    expect(result).toEqual({ ok: false, error: '房间已暂停,你的发言没有送达。' })
    // 房已经建出来了(校验都过了),但没有人被拉起来 —— 送不达就没有对话。
    expect(mocks.enqueued).toEqual([])
  })
})
