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

/* 下钻层是共享的 AgentSpace(它自己另有单测)。这里桩掉它:本组件的契约是
   "把谁、停在哪一面、在忙什么交出去,并把回来的落点转给宿主",不是那一页长什么样。 */
vi.mock('@/components/agents/AgentSpace.vue', () => ({
  default: {
    name: 'AgentSpace',
    props: ['agentId', 'showBack', 'backLabel', 'initialTab', 'work'],
    emits: ['back', 'open-session', 'open-file', 'open-thread'],
    template: `<div class="mock-space" :data-agent="agentId" :data-back="String(showBack)"
      :data-back-label="backLabel" :data-tab="initialTab || ''" :data-work="work?.title || ''">
      <button class="mock-back" @click="$emit('back')" />
      <button class="mock-open-session" @click="$emit('open-session', 'sess-9')" />
      <button class="mock-open-file" @click="$emit('open-file', '/tmp/a.md')" />
    </div>`,
  },
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

    const space = wrapper.find('.mock-space')
    expect(space.exists()).toBe(true)
    expect(wrapper.find('.member-list').exists()).toBe(false)
    expect(space.attributes('data-agent')).toBe('lin')
    expect(wrapper.emitted('focus')?.[0]).toEqual(['lin'])
  })

  it('空间页带「返回成员」,回去还是那张表', async () => {
    const wrapper = mountPanel({ focusAgentId: 'lin' })
    expect(wrapper.find('.mock-space').attributes('data-back')).toBe('true')
    expect(wrapper.find('.mock-space').attributes('data-back-label')).toBe('返回成员(3)')

    await wrapper.find('.mock-back').trigger('click')
    expect(wrapper.find('.member-list').exists()).toBe(true)
    expect(wrapper.emitted('focus')?.at(-1)).toEqual([''])
  })

  it('「在忙什么」跟着下钻的人走 —— 与列表段头同一份判定', () => {
    const wrapper = mountPanel({ focusAgentId: 'lin' })
    expect(wrapper.find('.mock-space').attributes('data-work')).toBe('编辑 session.ts')
  })

  it('深面就地渲染:不再 openAgentSpace 跳去管理页(P2 的反向断言)', async () => {
    const wrapper = mountPanel({ focusAgentId: 'lin', focusTab: 'files' })

    expect(wrapper.find('.mock-space').attributes('data-tab')).toBe('files')
    expect(mocks.openAgentSpace).not.toHaveBeenCalled()
  })

  it('空间页里的行由宿主落地:会话/文件都往上转,自己不导航', async () => {
    const wrapper = mountPanel({ focusAgentId: 'lin' })

    await wrapper.find('.mock-open-session').trigger('click')
    await wrapper.find('.mock-open-file').trigger('click')

    expect(wrapper.emitted('open-session')?.[0]).toEqual(['sess-9'])
    expect(wrapper.emitted('open-file')?.[0]).toEqual(['/tmp/a.md'])
  })

  it('私聊(房里只有一个人)不画「返回成员」—— 返回的是一张只有 TA 的表', () => {
    mocks.sessions = [
      { id: 'dm-1', kind: 'room', name: '小林', updatedAt: 1, room: { memberAgentIds: ['lin'], dm: true } },
    ]
    const wrapper = mountPanel({ sessionId: 'dm-1', focusAgentId: 'lin' })

    expect(wrapper.find('.mock-space').exists()).toBe(true)
    expect(wrapper.find('.mock-space').attributes('data-back')).toBe('false')
  })

  it('外部把落点改成另一个人时面板跟着换', async () => {
    mocks.sessions = [
      { id: 'room-1', kind: 'room', name: '浏览器重构', updatedAt: 2, room: { memberAgentIds: ['lin', 'che'] } },
    ]
    const wrapper = mountPanel({ focusAgentId: 'lin' })
    expect(wrapper.find('.mock-space').attributes('data-agent')).toBe('lin')

    await wrapper.setProps({ focusAgentId: 'che' })
    await nextTick()
    expect(wrapper.find('.mock-space').attributes('data-agent')).toBe('che')
  })
})
