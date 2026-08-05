// @vitest-environment happy-dom
/**
 * 私聊房的房头(docs/design/agent-im-dm.md §4.3)。
 *
 * 一对一没有"成员列",身份就是那一个人:成员条换成大头像 + 名字 + 职位,占的
 * 是同一个位置(房头结构不变,换的是里面站着谁)。AgentSelector 早就被 room
 * 分支关掉了(身份即房间),这里把它钉住,免得日后有人"顺手"为 dm 房放开。
 * 看板入口保留:私聊房的板就是「我交给小李的活」清单,只是不主动展开 ——
 * 展开唯一的路是点这颗按钮派出去的 window 事件。
 */
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TabBar from '../TabBar.vue'
import type { Tab } from '@/types/tabs'

const mocks = vi.hoisted(() => {
  const agents = [
    { id: 'fe', name: '小李', title: '工程师', avatar: '🔧' },
    { id: 'pm', name: '小王', title: '产品经理', avatar: '📐' },
  ]
  return {
    agents,
    sessions: [] as Array<Record<string, unknown>>,
    boards: {} as Record<string, { tasks: Array<Record<string, unknown>> }>,
    loadBoard: vi.fn(async () => {}),
    openSession: vi.fn(),
    agentsStore: {
      get agents() { return agents },
      hasLoaded: true,
      loadAgents: vi.fn(),
      // 房头身份 → 空间页(agent-im-chat-ui.md C3 入口①)。
      openAgentSpace: vi.fn(),
      displayAgent: (agentId?: string | null) =>
        agents.find(agent => agent.id === agentId)
        ?? { id: agentId ?? '', name: '已注销', kind: 'colleague', status: 'retired' },
    },
  }
})

vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => ({ get sessions() { return mocks.sessions } }),
}))
vi.mock('@/stores/agents', () => ({
  DEFAULT_AGENT_ID: 'default',
  useAgentsStore: () => mocks.agentsStore,
}))
vi.mock('@/stores/collabBoard', () => ({
  useCollabBoardStore: () => ({
    boardFor: (roomSessionId: string) => mocks.boards[roomSessionId],
    load: mocks.loadBoard,
  }),
}))
vi.mock('@/stores/workspace', () => ({
  useWorkspaceStore: () => ({ openSession: mocks.openSession }),
}))
vi.mock('../AgentSelector.vue', () => ({
  default: { name: 'AgentSelector', template: '<div class="mock-agent-selector" />' },
}))
vi.mock('../RoomMemberStrip.vue', () => ({
  default: { name: 'RoomMemberStrip', template: '<div class="mock-member-strip" />' },
}))

const tabs: Tab[] = [{ id: 'chat', type: 'chat', sessionId: 'session-1' }]

function mountTabBar() {
  return mount(TabBar, {
    props: {
      tabs,
      activeTabId: 'chat',
      sessionId: 'session-1',
      chatSessionNames: { 'session-1': '小李' },
      cachedSessionIds: new Set<string>(),
      isBranchSession: false,
      showSidebarToggle: false,
      showSplitButton: true,
      canClose: true,
      panelFocused: true,
    },
  })
}

beforeEach(() => {
  mocks.sessions = []
  mocks.boards = {}
  mocks.loadBoard.mockClear()
  mocks.openSession.mockClear()
  mocks.agentsStore.openAgentSpace.mockClear()
})

const DM_ROOM = {
  id: 'session-1',
  name: '小李',
  kind: 'room',
  room: { dm: true, memberAgentIds: ['fe'] },
}

function doingCard(overrides: Record<string, unknown> = {}) {
  return {
    id: 'task-abcdefgh-1',
    title: '修登录',
    status: 'doing',
    assigneeAgentId: 'fe',
    workSessionIds: ['work-1', 'work-2'],
    updatedAt: 100,
    ...overrides,
  }
}

describe('TabBar 私聊房房头', () => {
  it('换成一个人的身份:大头像 + 名字 + 职位,成员条不挂', () => {
    mocks.sessions = [{
      id: 'session-1',
      name: '小李',
      kind: 'room',
      room: { dm: true, memberAgentIds: ['fe'] },
    }]
    const wrapper = mountTabBar()

    const identity = wrapper.find('.dm-identity')
    expect(identity.exists()).toBe(true)
    expect(identity.find('.dm-identity-name').text()).toBe('小李')
    expect(identity.find('.dm-identity-title').text()).toBe('工程师')
    expect(identity.text()).toContain('🔧')
    expect(wrapper.find('.mock-member-strip').exists()).toBe(false)
  })

  /* 三入口归一(agent-im-chat-ui.md C3):房头身份是其中一处,点它进空间页。 */
  it('点房头身份进「我与 TA」的空间', async () => {
    mocks.sessions = [{
      id: 'session-1',
      name: '小李',
      kind: 'room',
      room: { dm: true, memberAgentIds: ['fe'] },
    }]
    const wrapper = mountTabBar()

    await wrapper.find('.dm-identity-open').trigger('click')
    expect(mocks.agentsStore.openAgentSpace).toHaveBeenCalledWith('fe')
  })

  it('composer 身份不可切:私聊房照样没有 AgentSelector', () => {
    mocks.sessions = [{
      id: 'session-1',
      name: '小李',
      kind: 'room',
      room: { dm: true, memberAgentIds: ['fe'] },
    }]
    expect(mountTabBar().find('.mock-agent-selector').exists()).toBe(false)
  })

  it('看板入口保留、默认收起:开板只有"点它"这一条路', async () => {
    mocks.sessions = [{
      id: 'session-1',
      name: '小李',
      kind: 'room',
      room: { dm: true, memberAgentIds: ['fe'] },
    }]
    let opens = 0
    const listener = () => { opens += 1 }
    window.addEventListener('onething:collab-open-board', listener)
    try {
      const wrapper = mountTabBar()
      const board = wrapper.find('.board-btn')
      expect(board.exists()).toBe(true)
      // 挂载不开板 —— 进私聊房不该被工作台糊一脸。
      expect(opens).toBe(0)
      await board.trigger('click')
      expect(opens).toBe(1)
    } finally {
      window.removeEventListener('onething:collab-open-board', listener)
    }
  })

  it('普通群不受影响:成员条在,身份块不在', () => {
    mocks.sessions = [{
      id: 'session-1',
      name: '官网改版组',
      kind: 'room',
      room: { memberAgentIds: ['fe', 'pm'] },
    }]
    const wrapper = mountTabBar()
    expect(wrapper.find('.mock-member-strip').exists()).toBe(true)
    expect(wrapper.find('.dm-identity').exists()).toBe(false)
  })

  it('双成员 dm 房走群那一路:成员条在、身份块不在', () => {
    mocks.sessions = [{
      id: 'session-1',
      name: '小李 ⇄ 小王',
      kind: 'room',
      room: { dm: true, memberAgentIds: ['fe', 'pm'] },
    }]
    const wrapper = mountTabBar()
    expect(wrapper.find('.mock-member-strip').exists()).toBe(true)
    expect(wrapper.find('.dm-identity').exists()).toBe(false)
  })

  /* §4.3:agent 互聊是沟通场,不是干活现场 —— 正经活回大群立卡,所以这间房里
     的看板入口没有意义。房间设置(预算/暂停)照旧,收掉的只有看板那一颗。 */
  it('双成员 dm 房不挂看板入口,房间设置照旧', () => {
    mocks.sessions = [{
      id: 'session-1',
      name: '小李 ⇄ 小王',
      kind: 'room',
      room: { dm: true, memberAgentIds: ['fe', 'pm'] },
    }]
    const wrapper = mountTabBar()
    expect(wrapper.find('.board-btn').exists()).toBe(false)
    expect(wrapper.find('.room-settings-btn').exists()).toBe(true)
  })

  it('群房与单成员私聊的看板入口零变化(正控)', () => {
    mocks.sessions = [{
      id: 'session-1',
      name: '官网改版组',
      kind: 'room',
      room: { memberAgentIds: ['fe', 'pm'] },
    }]
    expect(mountTabBar().find('.board-btn').exists()).toBe(true)
    mocks.sessions = [DM_ROOM]
    expect(mountTabBar().find('.board-btn').exists()).toBe(true)
  })

  it('普通会话:三样都不该出现,AgentSelector 照旧', () => {
    mocks.sessions = [{ id: 'session-1', name: '普通会话' }]
    const wrapper = mountTabBar()
    expect(wrapper.find('.dm-identity').exists()).toBe(false)
    expect(wrapper.find('.mock-member-strip').exists()).toBe(false)
    expect(wrapper.find('.board-btn').exists()).toBe(false)
    expect(wrapper.find('.mock-agent-selector').exists()).toBe(true)
  })
})

/**
 * 工作状态徽标(§4.3)。私聊的本义是"工具流水不进对话面",代价是用户看不见
 * TA 在忙什么;徽标是那道缝 —— 看板上这个人名下有一张 doing 且真开过工作台的
 * 卡才画,点开是那张卡最新一次执行的只读转录。
 */
describe('TabBar 私聊房工作状态徽标', () => {
  it('doing + 活跃 worker 才画,点开跳最新那条工作台会话', async () => {
    mocks.sessions = [DM_ROOM]
    mocks.boards = { 'session-1': { tasks: [doingCard()] } }

    const wrapper = mountTabBar()
    const badge = wrapper.find('.dm-work-badge')
    expect(badge.exists()).toBe(true)
    expect(badge.text()).toBe('正在干活 · #task-abc')

    await badge.trigger('click')
    // workSessionIds 的尾条 = 当前那次执行,不是第一次。
    expect(mocks.openSession).toHaveBeenCalledWith('work-2')
  })

  it('进房自己补拉一次看板 —— 私聊房的板默认收起,不拉就永远是冷的', () => {
    mocks.sessions = [DM_ROOM]
    mountTabBar()
    expect(mocks.loadBoard).toHaveBeenCalledWith('session-1')
  })

  it('没有活跃工作台就不渲染:空徽标是一个没有内容的承诺', () => {
    mocks.sessions = [DM_ROOM]
    mocks.boards = {
      'session-1': {
        tasks: [
          // 别人的活
          doingCard({ id: 'task-other', assigneeAgentId: 'pm' }),
          // 自己的活,但还没开工作台
          doingCard({ id: 'task-nowork', workSessionIds: [] }),
          // 自己的活,已经干完了
          doingCard({ id: 'task-done', status: 'done' }),
        ],
      },
    }
    expect(mountTabBar().find('.dm-work-badge').exists()).toBe(false)
  })

  it('看板还没拉到就不画,绝不先画一个空徽标占位', () => {
    mocks.sessions = [DM_ROOM]
    expect(mountTabBar().find('.dm-work-badge').exists()).toBe(false)
  })

  it('普通群不挂徽标:那儿有成员条和看板按钮,状态另有出口', () => {
    mocks.sessions = [{
      id: 'session-1',
      name: '官网改版组',
      kind: 'room',
      room: { memberAgentIds: ['fe', 'pm'] },
    }]
    mocks.boards = { 'session-1': { tasks: [doingCard()] } }
    expect(mountTabBar().find('.dm-work-badge').exists()).toBe(false)
  })
})

describe('TabBar 其它会话形态', () => {
  it('普通会话:三样都不该出现,AgentSelector 照旧(回归钉)', () => {
    mocks.sessions = [{ id: 'session-1', name: '普通会话' }]
    const wrapper = mountTabBar()
    expect(wrapper.find('.dm-identity').exists()).toBe(false)
    expect(wrapper.find('.mock-member-strip').exists()).toBe(false)
    expect(wrapper.find('.board-btn').exists()).toBe(false)
    expect(wrapper.find('.mock-agent-selector').exists()).toBe(true)
  })
})
