// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RoomHeader from '../room/RoomHeader.vue'
import { OPEN_MEMBERS_EVENT } from '@/components/workbench/room-members'

/**
 * 房头两态(去复用重构 R1):群聊 `# 房名 + 主题 + 成员堆`,私聊 `头像 + 名字 +
 * 在忙什么`。样板末节要求这一条上没有页签、没有 AgentSelector。
 */
const mocks = vi.hoisted(() => ({
  session: {} as Record<string, unknown>,
  board: undefined as unknown,
  openAgentSpace: vi.fn(),
}))

vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => ({ sessions: [mocks.session] }),
}))

vi.mock('@/stores/agents', () => ({
  useAgentsStore: () => ({
    displayAgent: (agentId: string) => ({
      id: agentId,
      name: '小林',
      title: '架构',
      avatar: '🙂',
      avatarImage: '',
    }),
    openAgentSpace: mocks.openAgentSpace,
  }),
}))

vi.mock('@/stores/collabBoard', () => ({
  useCollabBoardStore: () => ({
    ensureSubscribed: vi.fn(),
    boardFor: () => mocks.board,
  }),
}))

vi.mock('../RoomMemberStrip.vue', () => ({
  default: {
    name: 'RoomMemberStrip',
    props: { sessionId: String, openSpaceOnClick: Boolean },
    template: '<div class="mock-members" />',
  },
}))

vi.mock('../RoomSettingsDialog.vue', () => ({
  default: { name: 'RoomSettingsDialog', props: ['visible', 'sessionId'], template: '<div class="mock-room-settings" />' },
}))

function mountHeader(props: Record<string, unknown> = {}) {
  return mount(RoomHeader, { props: { sessionId: 'room-1', ...props } })
}

describe('RoomHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.board = undefined
  })

  it('群聊态:# 房名 + 主题 + 成员堆', () => {
    mocks.session = { id: 'room-1', name: '浏览器重构', kind: 'room', room: { memberAgentIds: ['a1', 'a2'] } }
    mocks.board = { tasks: [{ id: 't1', title: 'castlabs 换核', status: 'doing', workSessionIds: [], updatedAt: 1 }] }
    const wrapper = mountHeader()

    expect(wrapper.find('.room-hash').text()).toBe('#')
    expect(wrapper.find('.room-name').text()).toBe('浏览器重构')
    expect(wrapper.find('.room-topic').text()).toBe('castlabs 换核')
    expect(wrapper.find('.mock-members').exists()).toBe(true)
    expect(wrapper.find('.room-solo').exists()).toBe(false)
  })

  it('私聊态:头像 + 名字 + 在忙什么,没有成员堆', () => {
    mocks.session = { id: 'room-1', name: '小林', kind: 'room', room: { memberAgentIds: ['a1'], dm: true } }
    mocks.board = {
      tasks: [{ id: 't1', title: '编辑 session.ts', status: 'doing', assigneeAgentId: 'a1', workSessionIds: ['w1'], updatedAt: 1 }],
    }
    const wrapper = mountHeader()

    expect(wrapper.find('.room-solo-name').text()).toBe('小林')
    expect(wrapper.find('.room-solo-presence').text()).toBe('在忙 · 编辑 session.ts')
    expect(wrapper.find('.mock-members').exists()).toBe(false)
    expect(wrapper.find('.room-hash').exists()).toBe(false)
  })

  it('私聊头像**下钻右栏空间页**(与中栏署名头像同一个口径);在忙徽标派 open-thread(形状不许改)', async () => {
    mocks.session = { id: 'room-1', name: '小林', kind: 'room', room: { memberAgentIds: ['a1'], dm: true } }
    mocks.board = {
      tasks: [{ id: 'task-abcdefgh', title: '换核验证', status: 'doing', assigneeAgentId: 'a1', workSessionIds: ['w1', 'w2'], updatedAt: 1 }],
    }
    const wrapper = mountHeader()

    const spaces: unknown[] = []
    const spaceListener = (event: Event) => spaces.push((event as CustomEvent).detail)
    window.addEventListener(OPEN_MEMBERS_EVENT, spaceListener)
    await wrapper.find('.room-solo-open').trigger('click')
    window.removeEventListener(OPEN_MEMBERS_EVENT, spaceListener)

    expect(spaces).toEqual([{ sessionId: 'room-1', agentId: 'a1' }])
    // 全屏空间页不再是这颗的结果 —— R3 之前它是,同一个动作两种结果
    expect(mocks.openAgentSpace).not.toHaveBeenCalled()

    const seen: unknown[] = []
    const listener = (event: Event) => seen.push((event as CustomEvent).detail)
    window.addEventListener('onething:open-thread', listener)
    await wrapper.find('.room-head-work').trigger('click')
    window.removeEventListener('onething:open-thread', listener)

    expect(seen).toEqual([{ workSessionId: 'w2', title: '换核验证', taskId: 'task-abcdefgh' }])
  })

  it('R2:群聊 ⋯ 菜单有「成员」,点它派 open-members(靶子 = 这间房)', async () => {
    mocks.session = { id: 'room-1', name: '浏览器重构', kind: 'room', room: { memberAgentIds: ['a1', 'a2'] } }
    const wrapper = mountHeader()

    await wrapper.findAll('.room-head-icon').at(-1)!.trigger('click')
    const menu = wrapper.findComponent({ name: 'ContextMenu' })
    expect((menu.props('items') as Array<{ id: string; label: string }>).map(item => item.id))
      .toEqual(['members', 'board', 'settings'])

    const seen: unknown[] = []
    const listener = (event: Event) => seen.push((event as CustomEvent).detail)
    window.addEventListener(OPEN_MEMBERS_EVENT, listener)
    menu.vm.$emit('select', 'members')
    window.removeEventListener(OPEN_MEMBERS_EVENT, listener)

    expect(seen).toEqual([{ sessionId: 'room-1' }])
  })

  it('私聊没有「成员」这一档(那间房只有一个人)', async () => {
    mocks.session = { id: 'room-1', name: '小林', kind: 'room', room: { memberAgentIds: ['a1'], dm: true } }
    const wrapper = mountHeader()

    await wrapper.findAll('.room-head-icon').at(-1)!.trigger('click')
    const items = wrapper.findComponent({ name: 'ContextMenu' }).props('items') as Array<{ id: string }>
    expect(items.map(item => item.id)).not.toContain('members')
  })

  it('没有房 id 就根本没有私聊态 —— 全屏降级分支在这条壳上够不着', () => {
    mocks.session = { id: 'room-1', name: '小林', kind: 'room', room: { memberAgentIds: ['a1'], dm: true } }
    const wrapper = mount(RoomHeader, { props: {} })

    expect(wrapper.find('.room-solo-open').exists()).toBe(false)
    expect(mocks.openAgentSpace).not.toHaveBeenCalled()
  })

  it('成员堆在新房面上是「左键下钻空间页」形态', () => {
    mocks.session = { id: 'room-1', name: '浏览器重构', kind: 'room', room: { memberAgentIds: ['a1', 'a2'] } }
    const strip = mountHeader().findComponent({ name: 'RoomMemberStrip' })
    expect(strip.props('openSpaceOnClick')).toBe(true)
  })

  it('侧栏藏起来时才画侧栏开关(房面没有 TabBar,这颗不能丢)', async () => {
    mocks.session = { id: 'room-1', name: '房', kind: 'room', room: { memberAgentIds: ['a1', 'a2'] } }
    expect(mountHeader().find('.room-head-sidebar').exists()).toBe(false)

    const wrapper = mountHeader({ showSidebarToggle: true })
    await wrapper.find('.room-head-sidebar').trigger('click')
    expect(wrapper.emitted('toggleSidebar')).toHaveLength(1)
  })
})
