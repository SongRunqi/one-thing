// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MessageList from '../MessageList.vue'

/**
 * 聊天面(say-only)分流门 —— 工作台式外壳 C2′
 * (docs/design/im-workbench-layout.md §3 W2 / W-Q4)。
 *
 * 这一组钉三件事:
 *  1. **覆盖范围**:workbench + `kind='room'`(群聊 / 单成员 dm / agent 互聊)
 *     走新树;直聊、工作会话、classic 一律留在既有 MessageItem 树上。
 *  2. **两棵树互不串**:新树挂起来时 DOM 里一个 MessageItem 都没有 ——
 *     "两套署名同时渲染"因此在结构上不可能。
 *  3. **执行入口**:拿不到 workSessionId 就不画,派出去的事件带真 id。
 */
const mocks = vi.hoisted(() => ({
  board: undefined as unknown,
  chatStore: {
    getSessionPageState: vi.fn(() => undefined),
    getScrollVersion: vi.fn(() => 0),
    getSnapshot: vi.fn(() => null),
    handlePermissionRequest: vi.fn(),
    loadMessagesAround: vi.fn().mockResolvedValue(false),
    loadOlderMessages: vi.fn().mockResolvedValue(false),
    loadUserMessageMarkers: vi.fn(),
    sessionUserMarkers: new Map(),
    isRoomGroupCollapsed: vi.fn(() => false),
    toggleRoomGroupCollapsed: vi.fn(),
    expandRoomGroup: vi.fn(),
  },
  sessionsStore: {
    currentSessionId: 'room-1',
    sessions: [{ id: 'room-1', name: 'Team', kind: 'room', messageCount: 3 }] as unknown[],
    sessionGoals: new Map(),
    sessionGoalHistory: new Map(),
    createBranch: vi.fn(),
    switchSession: vi.fn(),
  },
  settingsStore: {
    settings: { ui: { shellMode: 'workbench' }, general: {}, chat: {} } as Record<string, unknown>,
  },
  agentsStore: {
    agents: [{ id: 'a1', name: '小林', avatar: '🙂' }],
    displayAgent: (agentId?: string | null) => ({
      id: agentId || '',
      name: agentId === 'a1' ? '小林' : '成员',
      title: '架构',
      avatar: '🙂',
      avatarImage: '',
      color: '#a33',
      kind: 'agent',
      status: 'active',
    }),
    openAgentSpace: vi.fn(),
  },
  platformApi: {
    capabilities: { shellTools: true },
    emitCommand: vi.fn().mockResolvedValue({ success: true }),
    executeTool: vi.fn().mockResolvedValue({ success: true, result: '' }),
    getPendingPermissions: vi.fn().mockResolvedValue({ success: true, pending: [] }),
    openImagePreview: vi.fn(),
    updateMessageThinkingTime: vi.fn().mockResolvedValue({ success: true }),
    updateToolCall: vi.fn().mockResolvedValue({ success: true }),
  },
}))

vi.mock('@/stores/chat', () => ({ useChatStore: () => mocks.chatStore }))
vi.mock('@/stores/sessions', () => ({ useSessionsStore: () => mocks.sessionsStore }))
vi.mock('@/stores/settings', () => ({ useSettingsStore: () => mocks.settingsStore }))
vi.mock('@/stores/agents', () => ({ useAgentsStore: () => mocks.agentsStore }))
vi.mock('@/stores/collabBoard', () => ({
  useCollabBoardStore: () => ({
    ensureSubscribed: vi.fn(),
    boardFor: () => mocks.board,
  }),
}))
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
    isTail: vi.fn(() => false),
    onLayoutChange: vi.fn(),
    setAnchor: vi.fn(),
    setTail: vi.fn(),
    writeScrollTop: vi.fn(),
  }),
}))

vi.mock('../MessageItem.vue', () => ({
  default: {
    name: 'MessageItem',
    props: ['message', 'roomMode'],
    template: '<div class="mock-message-item" :data-id="message.id" />',
  },
}))

// markdown 渲染链本身不在本组测试的射程里(它由 message/ 那边的测试负责);
// 这里只要证明**正文确实交给了它**,而不是新树自己写了一个渲染器。
vi.mock('../message/MessageMarkdown.vue', () => ({
  default: {
    name: 'MessageMarkdown',
    props: ['content', 'isUser', 'live', 'isStreaming'],
    template: '<div class="mock-markdown">{{ content }}</div>',
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

const T0 = new Date('2026-07-31T09:00:00').getTime()
const MINUTE = 60 * 1000

const ROOM_MESSAGES = [
  { id: 'm1', role: 'user', content: '@小林 结论呢', timestamp: T0 },
  { id: 'm2', role: 'assistant', agentId: 'a1', content: '## 结论\n\n通过。', timestamp: T0 + MINUTE },
  { id: 'm3', role: 'assistant', agentId: 'a1', content: '剩下的坑在多 profile。', timestamp: T0 + 2 * MINUTE },
]

function mountList(messages: unknown[] = ROOM_MESSAGES) {
  return mount(MessageList, {
    props: { messages: messages as never, sessionId: 'room-1' },
    global: { stubs: { Teleport: true, Transition: false } },
  })
}

describe('聊天面分流门(C2′)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.board = undefined
    mocks.settingsStore.settings = { ui: { shellMode: 'workbench' }, general: {}, chat: {} }
    mocks.sessionsStore.sessions = [{ id: 'room-1', name: 'Team', kind: 'room', messageCount: 3 }]
  })

  it('workbench + 房间 → 走新树,DOM 里一个 MessageItem 都没有', () => {
    const wrapper = mountList()

    expect(wrapper.findAll('.say-row')).toHaveLength(3)
    expect(wrapper.findAll('.mock-message-item')).toHaveLength(0)
    // 旧树的行盒也不许出现 —— 房间的 gap table 只服务旧树
    expect(wrapper.findAll('.message-list-row')).toHaveLength(0)
  })

  it('classic 下房间照旧走既有组件树(逐像素回滚闸)', () => {
    mocks.settingsStore.settings = { ui: { shellMode: 'classic' }, general: {}, chat: {} }
    const wrapper = mountList()

    expect(wrapper.findAll('.say-row')).toHaveLength(0)
    expect(wrapper.findAll('.mock-message-item')).toHaveLength(3)
  })

  it.each([
    ['直聊', 'chat'],
    ['工作会话', 'work'],
    ['无 kind 的普通会话', undefined],
  ])('%s 即便在 workbench 下也留在既有组件树上', (_label, kind) => {
    mocks.sessionsStore.sessions = [{ id: 'room-1', name: 'S', kind, messageCount: 3 }]
    const wrapper = mountList()

    expect(wrapper.findAll('.say-row')).toHaveLength(0)
    expect(wrapper.findAll('.mock-message-item')).toHaveLength(3)
  })

  it('署名只有一套:连发的第二条不重复头像与名字', () => {
    const wrapper = mountList()
    const rows = wrapper.findAll('.say-row')

    expect(rows.map(row => row.classes().includes('is-head'))).toEqual([true, true, false])
    expect(wrapper.findAll('.say-sig')).toHaveLength(2)
    expect(wrapper.findAll('.say-sig-name').map(name => name.text())).toEqual(['我', '小林'])
    // 旧树的署名/头像列一个都不在
    expect(wrapper.find('.collab-sender').exists()).toBe(false)
    expect(wrapper.find('.room-avatar-col').exists()).toBe(false)
  })

  it('正文交给既有 markdown 渲染链,不是新写的渲染器', () => {
    const wrapper = mountList()
    const bodies = wrapper.findAll('.mock-markdown').map(node => node.text())

    expect(bodies).toHaveLength(3)
    expect(bodies[1]).toContain('## 结论')
  })

  it('滚动锚点靠的还是 data-message-id / data-index,新树逐字段保住', () => {
    const wrapper = mountList()
    const rows = wrapper.findAll('.say-row')

    expect(rows.map(row => row.attributes('data-message-id'))).toEqual(['m1', 'm2', 'm3'])
    expect(rows.map(row => row.attributes('data-index'))).toEqual(['0', '1', '2'])
  })

  it('排版走聊天面档:13 / 1.72,派生行高与之同源', () => {
    const style = mountList().find('.message-list-wrapper').attributes('style')

    expect(style).toContain('--message-font-size: 13px')
    expect(style).toContain('--message-line-height: 1.72')
    // 13 × 1.72 = 22.36 → 22px
    expect(style).toContain('--message-line-height-px: 22px')
    expect(style).toContain('--chat-turn-gap: 10px')
  })

  it('用户显式选过字号就整档退让', () => {
    mocks.settingsStore.settings = {
      ui: { shellMode: 'workbench' },
      general: {},
      chat: { chatFontSize: 18 },
    }
    const style = mountList().find('.message-list-wrapper').attributes('style')

    expect(style).toContain('--message-font-size: 18px')
    expect(style).not.toContain('--chat-turn-gap')
  })
})

describe('聊天面:展开执行入口(W3)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.board = undefined
    mocks.settingsStore.settings = { ui: { shellMode: 'workbench' }, general: {}, chat: {} }
    mocks.sessionsStore.sessions = [{ id: 'room-1', name: 'Team', kind: 'room', messageCount: 3 }]
  })

  it('看板上没有带工作台会话的 doing 卡 → 入口整个不画', () => {
    expect(mountList().find('.say-thread-entry').exists()).toBe(false)
  })

  it('卡还没开过工作台(workSessionIds 空)→ 仍然不画,不派空事件', () => {
    mocks.board = {
      tasks: [{ id: 'task-1', title: '换核验证', status: 'doing', assigneeAgentId: 'a1', workSessionIds: [], updatedAt: T0 }],
    }

    expect(mountList().find('.say-thread-entry').exists()).toBe(false)
  })

  it('拿得到 workSessionId → 只在该 agent 最后一段发言末行画一处,派已定契约事件', async () => {
    mocks.board = {
      tasks: [{
        id: 'task-1',
        title: '换核验证',
        status: 'doing',
        assigneeAgentId: 'a1',
        workSessionIds: ['work-0', 'work-9'],
        updatedAt: T0,
      }],
    }

    const wrapper = mountList()
    const entries = wrapper.findAll('.say-thread-entry')
    expect(entries).toHaveLength(1)
    // 末行 = m3
    expect(entries[0].element.closest('.say-row')?.getAttribute('data-message-id')).toBe('m3')

    const events: CustomEvent[] = []
    const listener = (event: Event) => events.push(event as CustomEvent)
    window.addEventListener('onething:open-thread', listener)
    await entries[0].trigger('click')
    window.removeEventListener('onething:open-thread', listener)

    // 尾条 workSessionId = 当前那次执行
    expect(events).toHaveLength(1)
    expect(events[0].detail).toEqual({ workSessionId: 'work-9', title: '换核验证', taskId: 'task-1' })
  })
})
