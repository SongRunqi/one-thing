// @vitest-environment happy-dom
/**
 * 侧栏未读徽标(docs/design/agent-im-dm.md §6 P4 / D9)。
 *
 * 三处显隐:联系人行(该 agent 的私聊房)、群聊行、「私下」行;外加收起状态下的
 * 「私下」组头替组内那些看不见的行说话。
 *
 * 组件里**不做判定**:未读永远问 store 的 `isUnreadSession`(联系人行只多一步
 * agent → 房 的翻译)。所以这里 mock 掉那一个函数,验证的是"徽标听不听话",
 * 判定本身在 stores/__tests__/sessions-read-marks.test.ts。
 */
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Sidebar from '../Sidebar.vue'

const mocks = vi.hoisted(() => ({
  capabilities: { collabRooms: true },
  unread: new Set<string>(),
  dmRooms: new Map<string, { id: string }>(),
  sessionsStore: {
    sessions: [] as Array<Record<string, unknown>>,
    currentSessionId: '',
    groupRoomSessions: [] as Array<Record<string, unknown>>,
    agentPairDmRoomSessions: [] as Array<Record<string, unknown>>,
    agentSessions: [] as Array<Record<string, unknown>>,
    filteredSessions: [] as Array<Record<string, unknown>>,
    sidebarSessions: [] as Array<Record<string, unknown>>,
    radioSessions: [] as Array<Record<string, unknown>>,
    findUserDmRoom: (agentId: string) => mocks.dmRooms.get(agentId),
    isUnreadSession: (sessionId: string) => mocks.unread.has(sessionId),
    loadSessions: vi.fn(async () => {}),
    isNewChatDraftId: () => false,
    updateSessionPin: vi.fn(),
    deleteSession: vi.fn(),
    renameSession: vi.fn(),
  },
  colleagues: [
    { id: 'default', name: '主助理', avatar: '🙂' },
    { id: 'fe', name: '小李', title: '工程师', avatar: '🔧' },
  ],
}))

vi.mock('@/platform', () => ({
  platformApi: {
    get capabilities() { return mocks.capabilities },
    ensureCollabDmRoom: vi.fn(async () => ({ success: true, roomSessionId: 'agent-dm-fe' })),
  },
}))
vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => mocks.sessionsStore,
}))
vi.mock('@/stores/chat', () => ({
  useChatStore: () => ({ isSessionGenerating: () => false }),
}))
vi.mock('@/stores/workspace', () => ({
  useWorkspaceStore: () => ({ openSession: vi.fn() }),
}))
vi.mock('@/stores/agents', () => ({
  DEFAULT_AGENT_ID: 'default',
  useAgentsStore: () => ({
    get agents() { return mocks.colleagues },
    get colleagues() { return mocks.colleagues },
    hasLoaded: true,
    loadAgents: vi.fn(async () => []),
    requestAgentDetail: vi.fn(),
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

const ROOM = { id: 'room-1', name: '官网改版组' }
const PAIR = { id: 'agent-dm-room-fe--pm', name: '小李 ⇄ 小王' }

beforeEach(() => {
  mocks.capabilities.collabRooms = true
  mocks.unread.clear()
  mocks.dmRooms.clear()
  mocks.sessionsStore.currentSessionId = ''
  mocks.sessionsStore.groupRoomSessions = []
  mocks.sessionsStore.agentPairDmRoomSessions = []
})

describe('侧栏未读徽标', () => {
  it('全读完时一枚点都不画(首启不爆徽标的可见面)', () => {
    mocks.dmRooms.set('fe', { id: 'agent-dm-fe' })
    mocks.sessionsStore.groupRoomSessions = [ROOM]
    mocks.sessionsStore.agentPairDmRoomSessions = [PAIR]
    const wrapper = mountSidebar()
    expect(wrapper.findAll('.sidebar-unread-dot')).toHaveLength(0)
  })

  it('联系人行:TA 的私聊房未读才亮,没建过房的联系人不亮', () => {
    mocks.dmRooms.set('fe', { id: 'agent-dm-fe' })
    mocks.unread.add('agent-dm-fe')
    const wrapper = mountSidebar()

    const rows = wrapper.findAll('.sidebar-contact-item')
    expect(rows.map(row => row.find('.sidebar-room-name').text())).toEqual(['主助理', '小李'])
    // 主助理还没聊过(没有房),不该有点;小李那行有。
    expect(rows[0].find('.sidebar-unread-dot').exists()).toBe(false)
    expect(rows[1].find('.sidebar-unread-dot').exists()).toBe(true)
    expect(rows[1].classes()).toContain('has-unread')
  })

  it('群聊行:未读的群亮点,读过的不亮', () => {
    mocks.sessionsStore.groupRoomSessions = [ROOM, { id: 'room-2', name: '选品组' }]
    mocks.unread.add('room-2')
    const wrapper = mountSidebar()

    const rows = wrapper.findAll('.sidebar-room-item:not(.sidebar-contact-item):not(.sidebar-subgroup-item)')
    expect(rows[0].find('.sidebar-unread-dot').exists()).toBe(false)
    expect(rows[1].find('.sidebar-unread-dot').exists()).toBe(true)
  })

  it('「私下」:收起时组头替组内说话,展开后改由各行自己说', async () => {
    mocks.sessionsStore.agentPairDmRoomSessions = [PAIR]
    mocks.unread.add(PAIR.id)
    const wrapper = mountSidebar()

    const toggle = wrapper.find('.sidebar-subgroup')
    expect(toggle.find('.sidebar-unread-dot').exists()).toBe(true)

    await toggle.trigger('click')
    // 展开后组头闭嘴,点落到那一行上 —— 同一件事不画两遍。
    expect(wrapper.find('.sidebar-subgroup').find('.sidebar-unread-dot').exists()).toBe(false)
    expect(wrapper.find('.sidebar-subgroup-item').find('.sidebar-unread-dot').exists()).toBe(true)
  })

  it('「私下」组头:组内全读完就不亮', () => {
    mocks.sessionsStore.agentPairDmRoomSessions = [PAIR]
    const wrapper = mountSidebar()
    expect(wrapper.find('.sidebar-subgroup').find('.sidebar-unread-dot').exists()).toBe(false)
  })
})
