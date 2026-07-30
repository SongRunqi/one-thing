// @vitest-environment happy-dom
/**
 * 侧栏「联系人」区(docs/design/agent-im-dm.md §4.1 / D1)。
 *
 * 通讯录取的是名册(社交面 `colleagues`)而不是会话列表 —— 没聊过的同事也得
 * 站在那儿,不然"第一次找小李"就没有入口。点一下 = `ensureCollabDmRoom`
 * 幂等建房 + 打开;失败(退休 / service / web 端没有 rooms)必须看得见。
 */
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Sidebar from '../Sidebar.vue'

const mocks = vi.hoisted(() => {
  const colleagues: Array<{
    id: string
    name: string
    title?: string
    avatar?: string
  }> = [
    { id: 'fe', name: '小李', title: '工程师', avatar: '🔧' },
    { id: 'default', name: '主助理', avatar: '🙂' },
    { id: 'pm', name: '小王', title: '产品经理', avatar: '📐' },
  ]
  return {
    capabilities: { collabRooms: true },
    ensureCollabDmRoom: vi.fn(async (_agentId: string): Promise<{
      success: boolean
      roomSessionId?: string
      error?: string
    }> => ({ success: true, roomSessionId: 'agent-dm-fe' })),
    openSession: vi.fn(),
    loadSessions: vi.fn(async () => {}),
    requestAgentDetail: vi.fn(),
    openAgentSpace: vi.fn(),
    loadAgents: vi.fn(async () => []),
    sessionsStore: {
      sessions: [] as Array<Record<string, unknown>>,
      currentSessionId: '',
      groupRoomSessions: [] as Array<Record<string, unknown>>,
      agentPairDmRoomSessions: [] as Array<Record<string, unknown>>,
      agentSessions: [] as Array<Record<string, unknown>>,
      filteredSessions: [] as Array<Record<string, unknown>>,
      sidebarSessions: [] as Array<Record<string, unknown>>,
      radioSessions: [] as Array<Record<string, unknown>>,
      findUserDmRoom: vi.fn((_agentId: string) => undefined as undefined | { id: string }),
      isUnreadSession: vi.fn((_sessionId: string) => false),
      loadSessions: vi.fn(async () => {}),
      isNewChatDraftId: () => false,
      updateSessionPin: vi.fn(),
      deleteSession: vi.fn(),
      renameSession: vi.fn(),
    },
    colleagues,
  }
})

vi.mock('@/platform', () => ({
  platformApi: {
    get capabilities() { return mocks.capabilities },
    ensureCollabDmRoom: (agentId: string) => mocks.ensureCollabDmRoom(agentId),
  },
}))
vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => {
    mocks.sessionsStore.loadSessions = mocks.loadSessions
    return mocks.sessionsStore
  },
}))
vi.mock('@/stores/chat', () => ({
  useChatStore: () => ({ isSessionGenerating: () => false }),
}))
vi.mock('@/stores/workspace', () => ({
  useWorkspaceStore: () => ({ openSession: mocks.openSession }),
}))
vi.mock('@/stores/agents', () => ({
  DEFAULT_AGENT_ID: 'default',
  useAgentsStore: () => ({
    get agents() { return mocks.colleagues },
    get colleagues() { return mocks.colleagues },
    hasLoaded: true,
    loadAgents: mocks.loadAgents,
    requestAgentDetail: mocks.requestAgentDetail,
    openAgentSpace: mocks.openAgentSpace,
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
        CollapsePanel: true,
        Teleport: true,
      },
    },
  })
}

beforeEach(() => {
  mocks.capabilities.collabRooms = true
  mocks.ensureCollabDmRoom.mockReset()
  mocks.ensureCollabDmRoom.mockResolvedValue({ success: true, roomSessionId: 'agent-dm-fe' })
  mocks.openSession.mockReset()
  mocks.loadSessions.mockReset()
  mocks.requestAgentDetail.mockReset()
  mocks.openAgentSpace.mockReset()
  mocks.sessionsStore.currentSessionId = ''
  mocks.sessionsStore.groupRoomSessions = []
  mocks.sessionsStore.agentPairDmRoomSessions = []
  mocks.sessionsStore.findUserDmRoom = vi.fn(() => undefined)
})

/**
 * 「私下」= 双成员 dm 房(agent 互聊,§4.1/D4)。群聊区**里**的折叠子分组:
 * 透明制要求它看得见(不是暗通道),而它又是旁支,所以默认收起。
 */
describe('Sidebar 群聊区 ·「私下」折叠分组', () => {
  const PAIR = { id: 'agent-dm-room-fe--pm', name: '小李 ⇄ 小王' }

  it('没有 agent 互聊房时,分组整块不渲染', () => {
    const wrapper = mountSidebar()
    expect(wrapper.find('.sidebar-subgroup').exists()).toBe(false)
  })

  it('默认收起:只有一行折叠头 + 计数,房间行要点开才出现', async () => {
    mocks.sessionsStore.agentPairDmRoomSessions = [PAIR]
    const wrapper = mountSidebar()

    const toggle = wrapper.find('.sidebar-subgroup')
    expect(toggle.exists()).toBe(true)
    expect(toggle.find('.sidebar-subgroup-label').text()).toBe('私下')
    expect(toggle.find('.sidebar-subgroup-count').text()).toBe('1')
    expect(wrapper.find('.sidebar-subgroup-item').exists()).toBe(false)

    await toggle.trigger('click')
    const rows = wrapper.findAll('.sidebar-subgroup-item')
    expect(rows).toHaveLength(1)
    expect(rows[0].find('.sidebar-room-name').text()).toBe('小李 ⇄ 小王')
  })

  it('房间行走与群聊行同一条打开链路', async () => {
    mocks.sessionsStore.agentPairDmRoomSessions = [PAIR]
    const wrapper = mountSidebar()
    await wrapper.find('.sidebar-subgroup').trigger('click')
    await wrapper.find('.sidebar-subgroup-item').trigger('click')
    expect(mocks.openSession).toHaveBeenCalledWith(PAIR.id)
  })

  it('群聊区那一列不受影响:普通群仍然直接铺在外面', () => {
    mocks.sessionsStore.groupRoomSessions = [{ id: 'room-1', name: '官网改版组' }]
    mocks.sessionsStore.agentPairDmRoomSessions = [PAIR]
    const wrapper = mountSidebar()
    const plain = wrapper.findAll('.sidebar-room-item:not(.sidebar-contact-item):not(.sidebar-subgroup-item)')
    expect(plain.map(row => row.find('.sidebar-room-name').text())).toEqual(['官网改版组'])
  })
})

describe('Sidebar 联系人区', () => {
  it('把名册画成联系人行:头像 + 名字 + 职位,主助理置顶', () => {
    const wrapper = mountSidebar()
    const rows = wrapper.findAll('.sidebar-contact-item')
    expect(rows).toHaveLength(3)
    // D1/M5:主助理是第一位联系人,其余保持名册顺序。
    expect(rows.map(row => row.find('.sidebar-room-name').text()))
      .toEqual(['主助理', '小李', '小王'])
    expect(rows[1].find('.sidebar-contact-title').text()).toBe('工程师')
    // 没有职位的一行不该凭空长出一个空标签。
    expect(rows[0].find('.sidebar-contact-title').exists()).toBe(false)
    expect(rows[1].text()).toContain('🔧')
  })

  it('点一下 = 幂等建房 → 刷新列表 → 打开那间房', async () => {
    const wrapper = mountSidebar()
    await wrapper.findAll('.sidebar-contact-item')[1].trigger('click')
    await flushPromises()

    expect(mocks.ensureCollabDmRoom).toHaveBeenCalledWith('fe')
    // 新建的房要先进列表,openSession 才认得它(RoomCreateDialog 同款动线)。
    expect(mocks.loadSessions).toHaveBeenCalled()
    expect(mocks.openSession).toHaveBeenCalledWith('agent-dm-fe')
    expect(wrapper.find('.sidebar-contacts-error').exists()).toBe(false)
  })

  it('建房被拒:一行墨说出来,绝不静默无反应', async () => {
    mocks.ensureCollabDmRoom.mockResolvedValue({ success: false, error: '这个 agent 已退休' })
    const wrapper = mountSidebar()
    await wrapper.findAll('.sidebar-contact-item')[1].trigger('click')
    await flushPromises()

    expect(mocks.openSession).not.toHaveBeenCalled()
    expect(wrapper.find('.sidebar-contacts-error').text()).toBe('这个 agent 已退休')
  })

  it('已经聊过的联系人才点亮 —— 房是惰性建的', async () => {
    mocks.sessionsStore.findUserDmRoom = vi.fn((agentId: string) =>
      agentId === 'fe' ? { id: 'agent-dm-fe' } : undefined)
    mocks.sessionsStore.currentSessionId = 'agent-dm-fe'
    const wrapper = mountSidebar()
    const rows = wrapper.findAll('.sidebar-contact-item')
    expect(rows[1].classes()).toContain('is-active')
    expect(rows[0].classes()).not.toContain('is-active')
  })

  it('右键给「打开空间」+「配置 Agent」,两条都走归一的 openAgentSpace', async () => {
    const wrapper = mountSidebar()
    await wrapper.findAll('.sidebar-contact-item')[1].trigger('contextmenu')

    const menu = wrapper.findComponent({ name: 'ContextMenu' })
    expect(menu.props('items')).toEqual([
      { id: 'agent-space', label: '打开空间' },
      { id: 'configure-agent', label: '配置 Agent' },
    ])
    expect(menu.props('show')).toBe(true)

    menu.vm.$emit('select', 'configure-agent')
    await wrapper.vm.$nextTick()
    expect(mocks.openAgentSpace).toHaveBeenCalledWith('fe', 'config')
  })

  /* 三入口归一(agent-im-chat-ui.md C3):右键必须真的把空间页停在那一面,
     否则用户点完还得自己再切一次 tab。 */
  it('「打开空间」带上 tab 意图,直接把空间页停在会话那一面', async () => {
    const wrapper = mountSidebar()
    await wrapper.findAll('.sidebar-contact-item')[1].trigger('contextmenu')

    const menu = wrapper.findComponent({ name: 'ContextMenu' })
    menu.vm.$emit('select', 'agent-space')
    await wrapper.vm.$nextTick()
    expect(mocks.openAgentSpace).toHaveBeenCalledWith('fe', 'sessions')
  })

  /* §4.1「Agent 组」退役:基础设施转录放在通讯录层级是错位的,它整块搬进了
     履历页「群聊」栏。侧栏从此只剩 联系人 / 群聊 / 会话 三段。 */
  it('Agent 组已退役:哪怕有执行会话,侧栏也不再长出那一块', () => {
    mocks.sessionsStore.sessions = [
      { id: 'room-1', name: '官网改版组', kind: 'room', updatedAt: 5 },
      {
        id: 'agent-exec-fe-room-1',
        name: '[执行] 小李',
        kind: 'agent',
        agentId: 'fe',
        updatedAt: 5,
        collab: { roomSessionId: 'room-1' },
      },
    ]
    mocks.sessionsStore.agentSessions = [mocks.sessionsStore.sessions[1]]

    const wrapper = mountSidebar()
    expect(wrapper.find('.sidebar-agents').exists()).toBe(false)
    expect(wrapper.find('.sidebar-agent-exec').exists()).toBe(false)
    expect(wrapper.find('.sidebar-agent-detail').exists()).toBe(false)
    // 联系人区不受影响 —— 行为守恒只针对被退役的那一块。
    expect(wrapper.findAll('.sidebar-contact-item')).toHaveLength(3)

    mocks.sessionsStore.sessions = []
    mocks.sessionsStore.agentSessions = []
  })

  it('web 端整块不渲染:私聊是房,rooms 是 desktop-only 能力', () => {
    mocks.capabilities.collabRooms = false
    const wrapper = mountSidebar()
    expect(wrapper.find('.sidebar-contacts').exists()).toBe(false)
    expect(wrapper.findAll('.sidebar-contact-item')).toHaveLength(0)
  })
})
