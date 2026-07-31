// @vitest-environment happy-dom
/**
 * 左栏「以活为脊」的门与接线(C1,docs/design/im-workbench-layout.md §3 W1)。
 *
 * 钉三件事:
 *  1. **classic 逐像素回滚闸** —— 这一区连挂都不挂,一次看板 IPC 都不发,
 *     四区重排的 `order` 声明也全部关在 `data-shell-mode` 门里;
 *  2. workbench 下卡片按 updatedAt 倒序、三档状态标各画各的、空态塌陷成一行;
 *  3. 点卡 = 开这张卡所在的房(走既有 openSession 链路)。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Sidebar from '../Sidebar.vue'

const mocks = vi.hoisted(() => ({
  capabilities: { collabRooms: true },
  shellMode: 'workbench' as string,
  boards: {} as Record<string, unknown>,
  pendingAsks: new Set<string>(),
  typing: {} as Record<string, string[]>,
  busyRooms: new Set<string>(),
  unread: new Set<string>(),
  load: vi.fn(async (_roomSessionId: string) => {}),
  ensureSubscribed: vi.fn(),
  openSession: vi.fn(),
  sessions: [] as Array<Record<string, unknown>>,
  roomSessions: [] as Array<Record<string, unknown>>,
}))

vi.mock('@/platform', () => ({
  platformApi: {
    get capabilities() { return mocks.capabilities },
    get environment() { return 'test' },
    ensureCollabDmRoom: vi.fn(async () => ({ success: true, roomSessionId: 'agent-dm-fe' })),
  },
}))
vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => ({
    get sessions() { return mocks.sessions },
    get roomSessions() { return mocks.roomSessions },
    currentSessionId: '',
    // 群房既是侧栏「群聊」区的行,也是场账(useSceneLedger)的「场」——
    // 未读/在忙都从那份清单里数,所以两处必须是同一批房。
    get groupRoomSessions() { return mocks.roomSessions },
    userDmRoomSessions: [],
    agentPairDmRoomSessions: [],
    agentSessions: [],
    filteredSessions: [],
    sidebarSessions: [],
    radioSessions: [],
    findUserDmRoom: () => undefined,
    isUnreadSession: (sessionId: string) => mocks.unread.has(sessionId),
    loadSessions: vi.fn(async () => {}),
    isNewChatDraftId: () => false,
    updateSessionPin: vi.fn(),
    deleteSession: vi.fn(),
    renameSession: vi.fn(),
  }),
}))
vi.mock('@/stores/chat', () => ({
  useChatStore: () => ({ isSessionGenerating: () => false }),
}))
vi.mock('@/stores/workspace', () => ({
  useWorkspaceStore: () => ({ openSession: mocks.openSession }),
}))
vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({ settings: { ui: { shellMode: mocks.shellMode } } }),
}))
vi.mock('@/stores/agents', () => ({
  DEFAULT_AGENT_ID: 'default',
  useAgentsStore: () => ({
    agents: [],
    colleagues: [],
    hasLoaded: true,
    loadAgents: vi.fn(async () => []),
    displayAgent: (agentId: string) => ({ id: agentId, name: agentId ? `名-${agentId}` : '已注销', avatar: '🙂' }),
  }),
}))
vi.mock('@/stores/collabBoard', () => ({
  useCollabBoardStore: () => ({
    get boards() { return mocks.boards },
    ensureSubscribed: mocks.ensureSubscribed,
    load: mocks.load,
    hasPendingAsk: (sessionId: string) => mocks.pendingAsks.has(sessionId),
    isRoomTurnActive: (sessionId: string) => mocks.busyRooms.has(sessionId),
    typingAgents: (sessionId: string) => mocks.typing[sessionId] ?? [],
  }),
}))
vi.mock('../useSessionOrganizer', () => ({
  useSessionOrganizer: () => ({
    getProjectGroupedSessions: () => [],
    toggleCollapse: vi.fn(),
  }),
}))

function mountSidebar() {
  return mount(Sidebar, {
    global: {
      stubs: {
        SidebarHeader: true,
        SidebarActionGroup: true,
        SessionList: true,
        SessionContextMenu: true,
        RoomCreateDialog: true,
        Teleport: true,
      },
    },
  })
}

function task(patch: Record<string, unknown>) {
  return {
    rev: 1,
    title: '',
    createdBy: { type: 'user' },
    workSessionIds: [],
    rejections: 0,
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  }
}

beforeEach(() => {
  mocks.capabilities.collabRooms = true
  mocks.shellMode = 'workbench'
  mocks.boards = {}
  mocks.pendingAsks.clear()
  mocks.typing = {}
  mocks.busyRooms.clear()
  mocks.unread.clear()
  mocks.sessions = []
  mocks.roomSessions = [{ id: 'room-1', name: '一组' }, { id: 'room-2', name: '二组' }]
  mocks.load.mockClear()
  mocks.ensureSubscribed.mockClear()
  mocks.openSession.mockClear()
})

describe('classic 回滚闸', () => {
  it('classic 下左栏不挂「进行中」区,也不碰看板', () => {
    mocks.shellMode = 'classic'
    mocks.boards = { 'room-1': { version: 1, tasks: [task({ id: 'a', status: 'doing' })] } }
    const wrapper = mountSidebar()
    expect(wrapper.find('.sidebar-active-work').exists()).toBe(false)
    expect(mocks.ensureSubscribed).not.toHaveBeenCalled()
    expect(mocks.load).not.toHaveBeenCalled()
  })

  it('四区重排的 order 声明全部关在 data-shell-mode 门里(classic 一个像素不变)', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'packages/renderer/components/sidebar/Sidebar.vue'),
      'utf8',
    )
    const rules = source
      .split('\n')
      .map((line, index) => ({ line: line.trim(), index }))
      .filter(entry => /^order:\s/.test(entry.line))
    expect(rules.length).toBeGreaterThan(0)
    const lines = source.split('\n')
    for (const rule of rules) {
      // 往上找到这条声明所属的选择器行,必须带着 workbench 门。
      let cursor = rule.index
      while (cursor > 0 && !lines[cursor].includes('{')) cursor -= 1
      expect(lines[cursor]).toContain("data-shell-mode='workbench'")
    }
  })
})

describe('workbench 下的「进行中」区', () => {
  it('web 端(没有 rooms 能力)不挂这一区 —— 不留一行永远为空的说明', () => {
    mocks.capabilities.collabRooms = false
    const wrapper = mountSidebar()
    expect(wrapper.find('.sidebar-active-work').exists()).toBe(false)
  })

  it('没有在跑的活时塌陷成一行,不留一块空白', () => {
    const wrapper = mountSidebar()
    expect(wrapper.find('.sidebar-active-work').exists()).toBe(true)
    expect(wrapper.find('.active-work-empty').text()).toBe('没有在跑的活')
    expect(wrapper.findAll('.work-card')).toHaveLength(0)
  })

  it('跨房聚合按 updatedAt 倒序,三档状态标各画各的', () => {
    mocks.boards = {
      'room-1': {
        version: 1,
        tasks: [
          task({ id: 'a', status: 'doing', title: '换核验证', assigneeAgentId: 'fe', updatedAt: 30 }),
          task({ id: 'b', status: 'todo', title: '不该出现', updatedAt: 99 }),
        ],
      },
      'room-2': {
        version: 1,
        tasks: [
          task({ id: 'c', status: 'blocked', title: '元素拾取', blockReason: '等你放行 bash', updatedAt: 20 }),
          task({ id: 'd', status: 'review', title: 'profile 隔离', updatedAt: 10 }),
        ],
      },
    }
    const wrapper = mountSidebar()
    const cards = wrapper.findAll('.work-card')
    expect(cards.map(card => card.find('.work-card-title').text()))
      .toEqual(['换核验证', '元素拾取', 'profile 隔离'])
    expect(cards.map(card => card.find('.work-card-state').text()))
      .toEqual(['执行中', '待审批', '已交付'])
    // blocked 的原因当补语挂出去,不另起一档状态。
    expect(cards[1].find('.work-card-note').text()).toBe('等你放行 bash')
    expect(cards[0].classes()).toContain('tone-running')
    expect(cards[1].classes()).toContain('tone-awaiting')
    expect(cards[2].classes()).toContain('tone-delivered')
  })

  it('doing 卡卡在权限上时改报待审批(读的是既有 pendingAsks,不是新账)', () => {
    mocks.pendingAsks.add('w-1')
    mocks.boards = {
      'room-1': {
        version: 1,
        tasks: [task({ id: 'a', status: 'doing', title: '换核', workSessionIds: ['w-1'] })],
      },
    }
    const wrapper = mountSidebar()
    expect(wrapper.find('.work-card-state').text()).toBe('待审批')
  })

  it('「正在执行」听 typing,「在忙」与未读听同一份场账(不新起第四套口径)', () => {
    mocks.typing = { 'room-1': ['fe'] }
    mocks.busyRooms.add('room-2')
    mocks.unread.add('room-2')
    mocks.boards = {
      'room-1': {
        version: 1,
        tasks: [task({ id: 'a', status: 'doing', assigneeAgentId: 'fe', updatedAt: 30 })],
      },
      'room-2': {
        version: 1,
        tasks: [task({ id: 'b', status: 'doing', assigneeAgentId: 'be', updatedAt: 20 })],
      },
    }
    const wrapper = mountSidebar()
    const cards = wrapper.findAll('.work-card')
    // room-1:没人在跑一轮,但负责人正在打字 → 亮。
    expect(cards[0].find('.work-card-live').exists()).toBe(true)
    expect(cards[0].find('.sidebar-unread-dot').exists()).toBe(false)
    // room-2:场账说这间房在忙,且这张卡正是负责人此刻那张 → 亮;未读点同源。
    expect(cards[1].find('.work-card-live').exists()).toBe(true)
    expect(cards[1].find('.sidebar-unread-dot').exists()).toBe(true)
  })

  it('房已经不在会话列表里的旧快照不画卡', () => {
    mocks.roomSessions = [{ id: 'room-2' }]
    mocks.boards = {
      'room-1': { version: 1, tasks: [task({ id: 'a', status: 'doing', title: '死链' })] },
    }
    const wrapper = mountSidebar()
    expect(wrapper.findAll('.work-card')).toHaveLength(0)
  })

  it('点卡 = 打开这张卡所在的房(既有 openSession 链路)', async () => {
    mocks.boards = {
      'room-2': { version: 1, tasks: [task({ id: 'a', status: 'doing', title: '换核' })] },
    }
    const wrapper = mountSidebar()
    await wrapper.find('.work-card').trigger('click')
    expect(mocks.openSession).toHaveBeenCalledWith('room-2')
  })

  // ── C3:点卡除了开房,还要把右栏切到这张卡的线程 ──────────────────────────
  it('点卡同时派 onething:open-thread(靶子 = 尾条工作台会话)', async () => {
    mocks.boards = {
      'room-2': {
        version: 1,
        tasks: [task({ id: 'a', status: 'doing', title: '换核', workSessionIds: ['w-old', 'w-1'] })],
      },
    }
    const events: CustomEvent[] = []
    const listener = (event: Event) => events.push(event as CustomEvent)
    window.addEventListener('onething:open-thread', listener)
    try {
      const wrapper = mountSidebar()
      await wrapper.find('.work-card').trigger('click')
      expect(mocks.openSession).toHaveBeenCalledWith('room-2')
      expect(events).toHaveLength(1)
      expect(events[0].detail).toEqual({ workSessionId: 'w-1', title: '换核', taskId: 'a' })
    } finally {
      window.removeEventListener('onething:open-thread', listener)
    }
  })

  it('还没开过工作台的卡只开房,不派空事件', async () => {
    mocks.boards = {
      'room-2': { version: 1, tasks: [task({ id: 'a', status: 'doing', title: '刚领的活' })] },
    }
    const events: Event[] = []
    const listener = (event: Event) => events.push(event)
    window.addEventListener('onething:open-thread', listener)
    try {
      const wrapper = mountSidebar()
      await wrapper.find('.work-card').trigger('click')
      expect(mocks.openSession).toHaveBeenCalledWith('room-2')
      expect(events).toHaveLength(0)
    } finally {
      window.removeEventListener('onething:open-thread', listener)
    }
  })
})

describe('跨房补齐是定向的', () => {
  it('只补开过工作台的房,没干过活的房一次都不拉', async () => {
    mocks.sessions = [
      { id: 'room-1', kind: 'room', updatedAt: 5 },
      { id: 'room-2', kind: 'room', updatedAt: 5 },
      { id: 'w-1', kind: 'work', updatedAt: 9, collab: { roomSessionId: 'room-2' } },
    ]
    mountSidebar()
    await new Promise(resolve => setTimeout(resolve, 0))
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mocks.load.mock.calls.map(call => call[0])).toEqual(['room-2'])
  })

  it('没有任何会话时不发一次补齐', async () => {
    mountSidebar()
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(mocks.load).not.toHaveBeenCalled()
  })
})
