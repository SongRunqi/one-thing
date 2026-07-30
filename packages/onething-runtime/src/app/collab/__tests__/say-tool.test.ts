/**
 * The say executor (W14b 说话即行动) — the moment an utterance becomes a room
 * message, or fails to.
 *
 * What only an app-layer test can pin down: the two entry points resolve to the
 * same room (a room turn speaks into itself, a work session into its parent),
 * the gates now refuse the AGENT rather than silently eating an activation, and
 * identity is settled at the write (mentions whitelisted + re-labelled, replyTo
 * turned into a snapshot of a message that really exists).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { COLLAB_SAY_SOURCE } from '@onething/runtime/collab'

interface FakeMessage {
  id: string
  role: string
  content: string
  agentId?: string
  source?: string
  timestamp: number
  mentions?: Array<{ agentId: string; label: string }>
  replyTo?: { messageId: string; authorLabel: string; excerpt: string }
}

interface FakeSession {
  id: string
  kind?: string
  name?: string
  agentId?: string
  room?: { memberAgentIds: string[]; pmAgentId?: string; frozen?: boolean }
  collab?: { roomSessionId?: string; taskId?: string }
  messages: FakeMessage[]
}

const AGENTS: Record<string, { id: string; name: string; title?: string }> = {
  pm: { id: 'pm', name: '阿明', title: '产品' },
  fe: { id: 'fe', name: '小李', title: '前端' },
}

const mocks = vi.hoisted(() => ({
  sessions: new Map<string, unknown>(),
  emitted: [] as Array<{ sessionId: string; event: Record<string, unknown> }>,
  overBudget: false,
}))

vi.mock('../../store.js', () => ({
  updateSessionWorkingDirectory: vi.fn(),
  getSession: (id: string) => mocks.sessions.get(id),
  addMessage: (sessionId: string, message: FakeMessage) => {
    (mocks.sessions.get(sessionId) as FakeSession | undefined)?.messages.push(message)
  },
}))

vi.mock('../../events/index.js', () => ({
  getEventBus: () => ({
    emit: async (sessionId: string, event: Record<string, unknown>) => {
      mocks.emitted.push({ sessionId, event })
    },
  }),
}))

vi.mock('../../agents/index.js', () => ({ findAgent: (id: string) => AGENTS[id] ?? null }))

vi.mock('../coordinator.js', () => ({
  isRoomOverBudget: async () => mocks.overBudget,
}))

const { clearCollabSayIdempotence, speakIntoCollabRoom } = await import('../say-tool.js')

const ROOM = 'room-1'
const ROOM_B = 'room-2'
const WORK = 'work-1'
/** W18: the agent's execution session — where a room turn actually runs. */
const AGENT_SESSION = 'agent-exec-fe'

function room(): FakeSession {
  return mocks.sessions.get(ROOM) as FakeSession
}

function says(): FakeMessage[] {
  return room().messages.filter(message => message.source === COLLAB_SAY_SOURCE)
}

beforeEach(() => {
  mocks.sessions.clear()
  mocks.emitted.length = 0
  mocks.overBudget = false
  // The duplicate window is module state with a 5s life — two tests saying the
  // same words would otherwise share one delivery.
  clearCollabSayIdempotence()
  mocks.sessions.set(ROOM, {
    id: ROOM,
    kind: 'room',
    name: '官网改版组',
    agentId: 'fe',
    room: { memberAgentIds: ['pm', 'fe'], pmAgentId: 'pm' },
    messages: [],
  } satisfies FakeSession)
  mocks.sessions.set(WORK, {
    id: WORK,
    kind: 'work',
    name: '[任务] 加 status.txt',
    agentId: 'fe',
    collab: { roomSessionId: ROOM, taskId: 'task-1' },
    messages: [],
  } satisfies FakeSession)
  mocks.sessions.set(AGENT_SESSION, {
    id: AGENT_SESSION,
    kind: 'agent',
    name: '[执行] 小李',
    agentId: 'fe',
    collab: { roomSessionId: ROOM },
    messages: [],
  } satisfies FakeSession)
  mocks.sessions.set(ROOM_B, {
    id: ROOM_B,
    kind: 'room',
    name: '内部工具组',
    room: { memberAgentIds: ['fe'] },
    messages: [],
  } satisfies FakeSession)
})

describe('两个入口,一个房间', () => {
  it('writes a signed room message from a room turn', async () => {
    const result = await speakIntoCollabRoom({ sessionId: ROOM, content: '  明天下班前  ' })
    expect(result).toEqual({ ok: true, messageId: expect.any(String) })

    expect(says()).toHaveLength(1)
    expect(says()[0]).toMatchObject({
      role: 'assistant',
      agentId: 'fe',
      content: '明天下班前', // trimmed
      source: COLLAB_SAY_SOURCE,
    })
    // Broadcast on the channel the room already listens to — no new event type.
    expect(mocks.emitted.some(entry =>
      entry.sessionId === ROOM && entry.event.type === 'message:user-created')).toBe(true)
  })

  it('routes a WORK session into its parent room', async () => {
    await speakIntoCollabRoom({ sessionId: WORK, content: '依赖装完了,继续跑' })
    expect(says()).toHaveLength(1)
    expect((mocks.sessions.get(WORK) as FakeSession).messages).toHaveLength(0)
  })

  it('emits no typing at all — the light belongs to the argument stream (W19)', async () => {
    // W13.1 used to bracket a work-session utterance with typing(true/false)
    // here. Since W19 the indicator is driven by the `say` call's arguments
    // streaming, which is already over by the time the executor runs — a pulse
    // here would be a zero-width flicker after the light went out.
    await speakIntoCollabRoom({ sessionId: WORK, content: '说一句' })
    await speakIntoCollabRoom({ sessionId: ROOM, content: '再说一句' })
    expect(mocks.emitted.some(entry => entry.event.type === 'collab:typing')).toBe(false)
  })

  it('refuses a session with no room behind it', async () => {
    mocks.sessions.set('chat-1', { id: 'chat-1', kind: 'chat', messages: [] } satisfies FakeSession)
    const result = await speakIntoCollabRoom({ sessionId: 'chat-1', content: '你好' })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('群聊')
  })

  it('lets one turn say several things', async () => {
    await speakIntoCollabRoom({ sessionId: ROOM, content: '一' })
    await speakIntoCollabRoom({ sessionId: ROOM, content: '二' })
    await speakIntoCollabRoom({ sessionId: ROOM, content: '三' })
    expect(says().map(message => message.content)).toEqual(['一', '二', '三'])
    expect(new Set(says().map(message => message.id)).size).toBe(3)
  })
})

/**
 * W18 §4.6「say(room)」— the turn runs in the agent's own session, so the
 * utterance has to be ROUTED rather than simply "written where it happened".
 */
describe('W18 — say 的房间路由', () => {
  function saysIn(roomSessionId: string): FakeMessage[] {
    return (mocks.sessions.get(roomSessionId) as FakeSession).messages
      .filter(message => message.source === COLLAB_SAY_SOURCE)
  }

  it('sends an execution session into the room its drive pointed at', async () => {
    const result = await speakIntoCollabRoom({ sessionId: AGENT_SESSION, content: '明天下班前' })
    expect(result.ok).toBe(true)
    expect(saysIn(ROOM)).toHaveLength(1)
    expect(saysIn(ROOM)[0]).toMatchObject({ agentId: 'fe', source: COLLAB_SAY_SOURCE })
    // The execution session keeps its own transcript free of the utterance —
    // the room is where it landed.
    expect((mocks.sessions.get(AGENT_SESSION) as FakeSession).messages).toHaveLength(0)
  })

  it('follows the pointer when the same session is driven for another room', async () => {
    ;(mocks.sessions.get(AGENT_SESSION) as FakeSession).collab = { roomSessionId: ROOM_B }
    await speakIntoCollabRoom({ sessionId: AGENT_SESSION, content: '工具那边下周' })
    expect(saysIn(ROOM)).toHaveLength(0)
    expect(saysIn(ROOM_B)).toHaveLength(1)
  })

  it('an explicit room wins over the drive target', async () => {
    await speakIntoCollabRoom({ sessionId: AGENT_SESSION, content: '顺便说一句', room: ROOM_B })
    expect(saysIn(ROOM_B)).toHaveLength(1)
    expect(saysIn(ROOM)).toHaveLength(0)
  })

  it('an explicit room buys no membership — the gates run against the TARGET', async () => {
    ;(mocks.sessions.get(ROOM_B) as FakeSession).room!.memberAgentIds = ['pm']
    const result = await speakIntoCollabRoom({
      sessionId: AGENT_SESSION,
      content: '我插一句',
      room: ROOM_B,
    })
    expect(result.ok).toBe(false)
    expect(saysIn(ROOM_B)).toHaveLength(0)
  })

  it('names the mistake when the room parameter points at nothing', async () => {
    const result = await speakIntoCollabRoom({
      sessionId: AGENT_SESSION,
      content: '在吗',
      room: 'nope',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('room 参数')
  })

  it('refuses an execution session that no drive has pointed anywhere yet', async () => {
    ;(mocks.sessions.get(AGENT_SESSION) as FakeSession).collab = undefined
    const result = await speakIntoCollabRoom({ sessionId: AGENT_SESSION, content: '在吗' })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('群聊')
  })

  it('leaves the room turn indicator alone (the queue owns it)', async () => {
    await speakIntoCollabRoom({ sessionId: AGENT_SESSION, content: '明天下班前' })
    expect(mocks.emitted.some(entry => entry.event.type === 'collab:typing')).toBe(false)
  })
})

describe('闸门收拢到 say —— agent 亲身知道没发出去', () => {
  it('refuses when the room is frozen, and writes nothing', async () => {
    room().room!.frozen = true
    const result = await speakIntoCollabRoom({ sessionId: ROOM, content: '有人吗' })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('未送达')
    expect(says()).toHaveLength(0)
  })

  it('refuses when the room is over budget', async () => {
    mocks.overBudget = true
    const result = await speakIntoCollabRoom({ sessionId: ROOM, content: '有人吗' })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('预算')
    expect(says()).toHaveLength(0)
  })

  it('refuses a member that was just shown the door (roster read fresh)', async () => {
    room().room!.memberAgentIds = ['pm']
    const result = await speakIntoCollabRoom({ sessionId: ROOM, content: '我还在' })
    expect(result.ok).toBe(false)
    expect(says()).toHaveLength(0)
  })

  it('rejects an empty utterance BEFORE the gates (a mistake, not a failure)', async () => {
    room().room!.frozen = true
    const result = await speakIntoCollabRoom({ sessionId: ROOM, content: '   ' })
    expect(result.error).toContain('空')
  })
})

/**
 * todo2 P0-2 — 同一句话只进群一次.
 *
 * 真机形状:一个回合里两条一字不差的消息。doom-loop 护栏阈值是 4,重复两次完全
 * 落在它之下,所以幂等必须在写入处结构保证。
 */
describe('幂等:同一句话只落一条', () => {
  it('writes once and hands the same receipt back the second time', async () => {
    const first = await speakIntoCollabRoom({ sessionId: ROOM, content: '登录页明天下班前' })
    const second = await speakIntoCollabRoom({ sessionId: ROOM, content: '登录页明天下班前' })

    expect(says()).toHaveLength(1)
    // Success, not a refusal: those words ARE in the room — and under the id the
    // caller is told, so a follow-up replyTo quotes the real message.
    expect(second).toEqual({ ok: true, messageId: first.messageId })
    // Nothing broadcast for the duplicate either, or the room would render two.
    expect(mocks.emitted.filter(entry => entry.event.type === 'message:user-created'))
      .toHaveLength(1)
  })

  it('normalizes before comparing — 前后空白不是新消息', async () => {
    await speakIntoCollabRoom({ sessionId: ROOM, content: '明天下班前' })
    await speakIntoCollabRoom({ sessionId: ROOM, content: '  明天下班前\n' })
    expect(says()).toHaveLength(1)
  })

  it('keeps different content, different mentions and different quotes apart', async () => {
    room().messages.push({ id: 'u-1', role: 'user', content: '什么时候好?', timestamp: Date.now() })

    await speakIntoCollabRoom({ sessionId: ROOM, content: '一' })
    await speakIntoCollabRoom({ sessionId: ROOM, content: '二' })
    // Same words to a different person is a different utterance…
    await speakIntoCollabRoom({ sessionId: ROOM, content: '好', mentions: ['pm'] })
    await speakIntoCollabRoom({ sessionId: ROOM, content: '好' })
    // …and so is the same words quoting something.
    await speakIntoCollabRoom({ sessionId: ROOM, content: '好', replyTo: 'u-1' })

    expect(says().map(message => message.content)).toEqual(['一', '二', '好', '好', '好'])
    expect(new Set(says().map(message => message.id)).size).toBe(5)
  })

  it('scopes the window per room and per agent', async () => {
    // 同一个 agent 在另一个房间说同样的话:两个房间各自都该看到。
    ;(mocks.sessions.get(ROOM_B) as FakeSession).room!.memberAgentIds = ['fe']
    await speakIntoCollabRoom({ sessionId: ROOM, content: '同一句话' })
    await speakIntoCollabRoom({ sessionId: AGENT_SESSION, content: '同一句话', room: ROOM_B })

    expect(says()).toHaveLength(1)
    expect((mocks.sessions.get(ROOM_B) as FakeSession).messages).toHaveLength(1)
  })
})

describe('身份在写入时定稿', () => {
  it('stamps whitelisted, roster-labelled mentions', async () => {
    await speakIntoCollabRoom({
      sessionId: ROOM,
      content: '拍个板',
      // 'ghost' is not in the room; the label is never the caller's to choose.
      mentions: ['pm', 'ghost'],
    })
    expect(says()[0].mentions).toEqual([{ agentId: 'pm', label: '阿明' }])
  })

  it('picks up a bare @名字 written in prose', async () => {
    await speakIntoCollabRoom({ sessionId: ROOM, content: '@阿明 你看一下' })
    expect(says()[0].mentions).toEqual([{ agentId: 'pm', label: '阿明' }])
  })

  it('omits the field entirely when nobody is addressed', async () => {
    await speakIntoCollabRoom({ sessionId: ROOM, content: '没点名' })
    expect(says()[0].mentions).toBeUndefined()
  })

  it('turns replyTo into a snapshot of a real message', async () => {
    room().messages.push({
      id: 'u-1',
      role: 'user',
      content: '登录页什么时候能好?',
      timestamp: Date.now(),
    })
    await speakIntoCollabRoom({ sessionId: ROOM, content: '明天', replyTo: 'u-1' })
    expect(says()[0].replyTo).toEqual({
      messageId: 'u-1',
      authorLabel: '用户',
      excerpt: '登录页什么时候能好?',
    })
  })

  it('labels an agent quote from the roster', async () => {
    room().messages.push({
      id: 'a-1',
      role: 'assistant',
      agentId: 'pm',
      content: '排期我留了位置',
      timestamp: Date.now(),
    })
    await speakIntoCollabRoom({ sessionId: ROOM, content: '收到', replyTo: 'a-1' })
    expect(says()[0].replyTo?.authorLabel).toBe('阿明')
  })

  it('ignores a replyTo that names nothing — the words still go out', async () => {
    const result = await speakIntoCollabRoom({ sessionId: ROOM, content: '明天', replyTo: 'nope' })
    expect(result.ok).toBe(true)
    expect(says()[0].replyTo).toBeUndefined()
  })
})
