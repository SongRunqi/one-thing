// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MembersWorkbench from '../MembersWorkbench.vue'

const mocks = vi.hoisted(() => ({
  openAgentSpace: vi.fn(),
  loadBoard: vi.fn(),
  agents: [
    { id: 'lin', name: '小林', title: '架构', avatar: '🧭', description: '盯架构边界与迁移。' },
    { id: 'che', name: '阿澈', title: '测试', avatar: '🧪' },
    { id: 'shi', name: '老石', title: '前端', avatar: '🪨', status: 'retired' },
  ] as Array<Record<string, unknown>>,
  board: {
    roomSessionId: 'room-1',
    tasks: [
      {
        id: 'task-aaaaaaaa',
        title: '编辑 session.ts',
        status: 'doing',
        assigneeAgentId: 'lin',
        workSessionIds: ['work-1'],
        updatedAt: 2,
      },
    ],
  },
  sessions: [] as Array<Record<string, unknown>>,
}))

const BASE_SESSIONS: Array<Record<string, unknown>> = [
  { id: 'chat-1', kind: 'chat', agentId: 'lin', name: '直聊一', updatedAt: 3 },
  { id: 'room-1', kind: 'room', name: '浏览器重构', updatedAt: 2, room: { memberAgentIds: ['lin', 'che', 'shi'] } },
]

vi.mock('@/stores/agents', () => ({
  useAgentsStore: () => ({
    agents: mocks.agents,
    hasLoaded: true,
    loadAgents: vi.fn().mockResolvedValue([]),
    openAgentSpace: mocks.openAgentSpace,
    displayAgent: (agentId: string) => {
      const agent = mocks.agents.find(item => item.id === agentId)
      if (!agent) return { id: agentId, name: '已注销', kind: 'colleague', status: 'retired' }
      return { ...agent, kind: 'colleague', status: agent.status || 'active' }
    },
  }),
}))

vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => ({
    sessions: mocks.sessions,
    agentPresence: () => ({
      dmRoomId: '',
      roomSessionIds: [],
      execSessionIds: [],
      workSessionIds: [],
    }),
    agentDirectChatSessions: (agentId: string) =>
      mocks.sessions.filter(session => session.agentId === agentId),
  }),
}))

vi.mock('@/stores/collabBoard', () => ({
  useCollabBoardStore: () => ({
    ensureSubscribed: vi.fn(),
    load: mocks.loadBoard,
    boardFor: () => mocks.board,
  }),
}))

vi.mock('@/components/common/AgentAvatar.vue', () => ({
  default: { name: 'AgentAvatar', props: ['avatar', 'avatarImage', 'size'], template: '<i class="mock-avatar" />' },
}))

function mountPanel(props: Record<string, unknown> = {}) {
  return mount(MembersWorkbench, { props: { sessionId: 'room-1', ...props } })
}

describe('MembersWorkbench', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.sessions = BASE_SESSIONS.map(session => ({ ...session }))
  })

  it('列表按在场分三段,段头带计数', () => {
    const wrapper = mountPanel()
    const heads = wrapper.findAll('.member-group-head').map(node => node.text())

    expect(heads).toEqual(['在忙 — 1', '空闲 — 1', '已注销 — 1'])
    expect(wrapper.findAll('.member-row')).toHaveLength(3)
    expect(wrapper.find('.member-row').text()).toContain('编辑 session.ts')
    expect(wrapper.findAll('.member-row').at(2)!.classes()).toContain('is-off')
  })

  it('点成员在**同一个面板里**下钻空间页,并回报落点(不新开 tab)', async () => {
    const wrapper = mountPanel()
    await wrapper.find('.member-row').trigger('click')

    expect(wrapper.find('.member-space').exists()).toBe(true)
    expect(wrapper.find('.member-list').exists()).toBe(false)
    expect(wrapper.find('.space-name').text()).toBe('小林')
    expect(wrapper.find('.space-subtitle').text()).toBe('架构 · 同事')
    expect(wrapper.find('.space-desc').text()).toContain('盯架构边界')
    expect(wrapper.emitted('focus')?.[0]).toEqual(['lin'])
  })

  it('空间页带「返回成员」,回去还是那张表', async () => {
    const wrapper = mountPanel({ focusAgentId: 'lin' })
    expect(wrapper.find('.space-back').exists()).toBe(true)

    await wrapper.find('.space-back').trigger('click')
    expect(wrapper.find('.member-list').exists()).toBe(true)
    expect(wrapper.emitted('focus')?.at(-1)).toEqual([''])
  })

  it('计数行读履历页那份归类', async () => {
    const wrapper = mountPanel({ focusAgentId: 'lin' })
    const rows = wrapper.findAll('.space-row').map(node => node.text().replace(/\s+/g, ''))

    expect(rows).toEqual(['与你的对话1', '群聊0', '干过的活0', '私下0'])
  })

  it('深面(文件 / 配置)不在右栏重做,点一下走既有空间页', async () => {
    const wrapper = mountPanel({ focusAgentId: 'lin' })
    const tabs = wrapper.findAll('.space-tab')

    await tabs.at(2)!.trigger('click')
    expect(mocks.openAgentSpace).toHaveBeenCalledWith('lin', 'config')

    await tabs.at(1)!.trigger('click')
    expect(mocks.openAgentSpace).toHaveBeenCalledWith('lin', 'files')
  })

  it('私聊(房里只有一个人)不画「返回成员」—— 返回的是一张只有 TA 的表', () => {
    mocks.sessions = [
      { id: 'dm-1', kind: 'room', name: '小林', updatedAt: 1, room: { memberAgentIds: ['lin'], dm: true } },
    ]
    const wrapper = mountPanel({ sessionId: 'dm-1', focusAgentId: 'lin' })

    expect(wrapper.find('.member-space').exists()).toBe(true)
    expect(wrapper.find('.space-back').exists()).toBe(false)
  })

  it('外部把落点改成另一个人时面板跟着换', async () => {
    mocks.sessions = [
      { id: 'room-1', kind: 'room', name: '浏览器重构', updatedAt: 2, room: { memberAgentIds: ['lin', 'che'] } },
    ]
    const wrapper = mountPanel({ focusAgentId: 'lin' })
    expect(wrapper.find('.space-name').text()).toBe('小林')

    await wrapper.setProps({ focusAgentId: 'che' })
    await nextTick()
    expect(wrapper.find('.space-name').text()).toBe('阿澈')
  })
})
