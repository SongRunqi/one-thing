// @vitest-environment happy-dom
/**
 * E2 — 提问卡在消息流里的**归位**。
 *
 * 带 `toolCallId` 的贴在发起它的那次工具调用所属的消息之后(与审批卡认同一个
 * 耐久相关键);找不到落点的落到会话末尾而**不是被丢掉** —— 一张位置不完美的卡
 * 仍然答得了,一张不画的卡答不了(而不答的代价是那次提问走到 deadline)。
 */
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MessageList from '../MessageList.vue'

const T0 = Date.now()

const mocks = vi.hoisted(() => ({
  interactions: {
    pending: [] as unknown[],
    settled: [] as unknown[],
    ensureForSession: vi.fn(),
    respond: vi.fn(),
    decline: vi.fn(),
  },
  chatStore: {
    getSessionPageState: vi.fn(() => undefined),
    getScrollVersion: vi.fn(() => 0),
    getSnapshot: vi.fn(() => null),
    handlePermissionRequest: vi.fn(),
    loadMessagesAround: vi.fn().mockResolvedValue(false),
    loadOlderMessages: vi.fn().mockResolvedValue(false),
    loadUserMessageMarkers: vi.fn(),
    sessionUserMarkers: new Map(),
  },
  sessionsStore: {
    currentSessionId: 'session-1',
    sessions: [{ id: 'session-1', name: 'Test', messageCount: 2 }],
    sessionGoals: new Map(),
    sessionGoalHistory: new Map(),
    createBranch: vi.fn(),
    switchSession: vi.fn(),
  },
  settingsStore: { settings: { general: {}, chat: {} } },
  platformApi: {
    capabilities: { shellTools: true },
    emitCommand: vi.fn().mockResolvedValue({ success: true }),
    executeTool: vi.fn().mockResolvedValue({ success: true, result: '' }),
    getPendingPermissions: vi.fn().mockResolvedValue({ success: true, pending: [] }),
    updateMessageThinkingTime: vi.fn().mockResolvedValue({ success: true }),
    updateToolCall: vi.fn().mockResolvedValue({ success: true }),
  },
}))

vi.mock('@/stores/chat', () => ({ useChatStore: () => mocks.chatStore }))
vi.mock('@/stores/collabBoard', () => ({
  useCollabBoardStore: () => ({ ensurePendingForSession: vi.fn() }),
}))
vi.mock('@/stores/interactions', () => ({
  useInteractionsStore: () => ({
    ensureForSession: mocks.interactions.ensureForSession,
    pendingFor: () => mocks.interactions.pending,
    settledFor: () => mocks.interactions.settled,
    respond: mocks.interactions.respond,
    decline: mocks.interactions.decline,
  }),
}))
vi.mock('@/stores/sessions', () => ({ useSessionsStore: () => mocks.sessionsStore }))
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => mocks.settingsStore }))
vi.mock('@/platform', () => ({ platformApi: mocks.platformApi }))

vi.mock('@/composables/usePermissionShortcuts', () => ({ usePermissionShortcuts: vi.fn() }))

vi.mock('@/composables/useFollowScroll', async () => {
  const { ref } = await import('vue')
  return {
    shouldShowScrollToBottomButton: vi.fn(() => false),
    useFollowScroll: () => ({
      allowOneScroll: vi.fn(),
      checkReattach: vi.fn(),
      isSwitching: vi.fn(() => false),
      isFollowing: ref(true),
      onScroll: vi.fn(),
      onWheel: vi.fn(),
      snapToBottom: vi.fn(),
    }),
  }
})

vi.mock('@/composables/useMessageScrollCoordinator', () => ({
  useMessageScrollCoordinator: () => ({
    clear: vi.fn(),
    isAnchored: vi.fn(() => false),
    onLayoutChange: vi.fn(),
    setAnchor: vi.fn(),
    setTail: vi.fn(),
    writeScrollTop: vi.fn(),
  }),
}))

vi.mock('../MessageItem.vue', () => ({
  default: {
    name: 'MessageItem',
    props: ['message'],
    template: '<div class="mock-message-item" :data-message-id="message.id">{{ message.content }}</div>',
  },
}))

vi.mock('../EmptyState.vue', () => ({
  default: { name: 'EmptyState', template: '<div class="mock-empty-state" />' },
}))
vi.mock('../AssistantMessageNavRail.vue', () => ({
  default: { name: 'AssistantMessageNavRail', template: '<div class="mock-assistant-nav" />' },
}))
vi.mock('../UserMessageNavRail.vue', () => ({
  default: { name: 'UserMessageNavRail', template: '<div class="mock-user-nav" />' },
}))
vi.mock('../assistant-message-outline', () => ({
  ASSISTANT_OUTLINE_ANCHOR_ATTR: 'data-assistant-outline-anchor',
  buildAssistantMessageOutlineMarkers: vi.fn(() => []),
  shouldShowAssistantMessageOutline: vi.fn(() => false),
}))

const MESSAGES = [
  { id: 'msg-1', role: 'user', content: '开工', timestamp: T0 },
  {
    id: 'msg-2',
    role: 'assistant',
    content: '我先问一句',
    timestamp: T0 + 1,
    toolCalls: [{ id: 'call-1', name: 'AskUserQuestion' }],
  },
  { id: 'msg-3', role: 'assistant', content: '继续', timestamp: T0 + 2 },
]

function ask(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'ask-1',
    sessionId: 'session-1',
    toolCallId: 'call-1',
    origin: 'external-agent',
    questions: [{ id: 'q1', question: '用哪一套配色?', options: [{ label: '暖' }, { label: '冷' }] }],
    deadlineAt: T0 + 120_000,
    createdAt: T0,
    ...overrides,
  }
}

function mountList(messages: unknown[] = MESSAGES) {
  return mount(MessageList, {
    props: { messages: messages as never, sessionId: 'session-1' },
    global: { stubs: { Teleport: true, Transition: false } },
  })
}

/**
 * 一次答完的提问在消息里长这样(真机 `messages.jsonl` 原样):题面在 `arguments`,
 * 答案在 CLI 念回来的那句 `result` 里。已办卡跨重载存活靠的就是这一条。
 */
function answeredAskToolCall(id = 'call-hist'): Record<string, unknown> {
  return {
    id,
    toolId: 'AskUserQuestion',
    toolName: 'AskUserQuestion',
    status: 'completed',
    timestamp: T0,
    endTime: T0 + 9_000,
    arguments: {
      questions: [{ question: '用哪一套配色?', header: '配色', options: [{ label: '暖' }, { label: '冷' }] }],
    },
    result: 'Your questions have been answered: "用哪一套配色?"="暖". You can now continue.',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.interactions.pending = []
  mocks.interactions.settled = []
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(performance.now())
    return 1
  })
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: { getPendingPermissions: vi.fn().mockResolvedValue({ success: true, pending: [] }) },
  })
})

describe('MessageList: 提问卡归位', () => {
  it('带 toolCallId 的卡贴在那次工具调用所属的消息之后', () => {
    mocks.interactions.pending = [ask()]
    const wrapper = mountList()

    const rows = wrapper.findAll('.mock-message-item, .interaction-card')
    const classes = rows.map(row => (row.classes().includes('interaction-card') ? 'card' : row.attributes('data-message-id')))
    expect(classes).toEqual(['msg-1', 'msg-2', 'card', 'msg-3'])
  })

  it('没有落点的卡挂在会话末尾,而不是被丢掉', () => {
    mocks.interactions.pending = [ask({ id: 'ask-2', toolCallId: undefined })]
    const wrapper = mountList()

    const rows = wrapper.findAll('.mock-message-item, .interaction-card')
    const classes = rows.map(row => (row.classes().includes('interaction-card') ? 'card' : row.attributes('data-message-id')))
    expect(classes).toEqual(['msg-1', 'msg-2', 'msg-3', 'card'])
  })

  it('已结算的卡留在原地(历史态),与还欠着的按提问时间同列', () => {
    mocks.interactions.pending = [ask({ id: 'ask-new', createdAt: T0 + 10 })]
    mocks.interactions.settled = [{
      request: ask({ id: 'ask-old', createdAt: T0 }),
      answer: { id: 'ask-old', answers: { q1: { selected: ['暖'] } }, outcome: 'answered' },
      settledAt: T0 + 5,
    }]
    const wrapper = mountList()

    const cards = wrapper.findAll('.interaction-card')
    expect(cards).toHaveLength(2)
    expect(cards[0]!.attributes('data-testid')).toBe('interaction-card-ask-old')
    expect(cards[0]!.attributes('data-state')).toBe('answered')
    expect(cards[1]!.attributes('data-state')).toBe('open')
  })

  it('点提交把答案交给账本(按会话 + 整份 request)', async () => {
    mocks.interactions.pending = [ask()]
    const wrapper = mountList()

    await wrapper.findAll('.option')[0]!.trigger('click')
    await wrapper.get('[data-testid="interaction-submit"]').trigger('click')

    expect(mocks.interactions.respond).toHaveBeenCalledTimes(1)
    const [sessionId, request, answers] = mocks.interactions.respond.mock.calls[0]!
    expect(sessionId).toBe('session-1')
    expect((request as { id: string }).id).toBe('ask-1')
    expect(answers).toEqual({ q1: { selected: ['暖'] } })
  })

  it('点跳过走 decline', async () => {
    mocks.interactions.pending = [ask()]
    const wrapper = mountList()

    await wrapper.get('[data-testid="interaction-decline"]').trigger('click')
    expect(mocks.interactions.decline).toHaveBeenCalledTimes(1)
    expect(mocks.interactions.respond).not.toHaveBeenCalled()
  })

  /**
   * 重开会话 = 两本内存账都是空的(pending 反查回来没有,settled 那本从来不跨窗口)。
   * 此时已办卡只能从消息里的那次工具调用推出来 —— 它是答案唯一的持久落点。
   */
  it('两本内存账都空时(等同重开会话),已办卡仍从消息里推得出来', () => {
    const wrapper = mountList([
      MESSAGES[0],
      { ...MESSAGES[1], toolCalls: [answeredAskToolCall()] },
      MESSAGES[2],
    ])

    const cards = wrapper.findAll('.interaction-card')
    expect(cards).toHaveLength(1)
    expect(cards[0]!.attributes('data-state')).toBe('answered')
    expect(cards[0]!.get('[data-testid="interaction-answer-call-hist:0"]').text()).toBe('暖')
    // 已办卡不带操作(这正是「答完了框还杵着」的那一条)。
    expect(wrapper.find('[data-testid="interaction-submit"]').exists()).toBe(false)
    // 归位仍按 toolCallId:贴在发起它的那条消息之后。
    const rows = wrapper.findAll('.mock-message-item, .interaction-card')
    const order = rows.map(row => (row.classes().includes('interaction-card') ? 'card' : row.attributes('data-message-id')))
    expect(order).toEqual(['msg-1', 'msg-2', 'card', 'msg-3'])
  })

  it('活的记录赢:同一次提问不会既画一张活的又画一张推出来的', () => {
    mocks.interactions.settled = [{
      request: ask({ id: 'call-hist', toolCallId: 'call-hist' }),
      answer: { id: 'call-hist', answers: { q1: { selected: ['冷'] } }, outcome: 'answered' },
      settledAt: T0 + 5,
    }]
    const wrapper = mountList([
      MESSAGES[0],
      { ...MESSAGES[1], toolCalls: [answeredAskToolCall()] },
      MESSAGES[2],
    ])

    const cards = wrapper.findAll('.interaction-card')
    expect(cards).toHaveLength(1)
    // 画的是活账那一份(它的答案是「冷」,推出来的那份是「暖」)。
    expect(cards[0]!.get('[data-testid="interaction-answer-q1"]').text()).toBe('冷')
  })

  it('还没答完的那次提问不会被推成一张已办卡', () => {
    const wrapper = mountList([
      MESSAGES[0],
      { ...MESSAGES[1], toolCalls: [{ ...answeredAskToolCall(), status: 'executing', result: undefined }] },
      MESSAGES[2],
    ])
    expect(wrapper.findAll('.interaction-card')).toHaveLength(0)
  })

  it('会话上屏时补一次水(事件不会为重载的窗口补发)', async () => {
    mountList()
    await Promise.resolve()
    expect(mocks.interactions.ensureForSession).toHaveBeenCalledWith('session-1')
  })
})
