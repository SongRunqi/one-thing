// @vitest-environment happy-dom
/**
 * 「摊在右栏这一面上 = 看见了,销未读」。
 *
 * 已读水位只认**主区可见的会话**(`markVisibleSessionsRead` 吃的是
 * `workspaceStore.visibleSessionIds` = 各分栏的当前页签)—— 右栏这一面不在那份
 * 清单上。这一句收在 `ThreadChatDetail` 里而不是各宿主里:"右栏正摊着哪段对话"
 * 只有它知道,于是线程 / 就地私聊 / 房里的「私下」三处宿主都不必各补一遍。
 *
 * 不补的后果很具体:话就摆在眼前,左栏那枚红点却一直亮着。
 */
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ThreadChatDetail from '../ThreadChatDetail.vue'

const mocks = vi.hoisted(() => ({
  unread: new Set<string>(),
  markSessionRead: vi.fn(),
  loadMessages: vi.fn(async () => {}),
  messages: [] as unknown[],
}))

vi.mock('@/components/chat/ChatPanel.vue', () => ({
  default: { name: 'ChatPanel', props: ['sessionId', 'permissionShortcuts'], template: '<div class="mock-chat" />' },
}))
vi.mock('@/composables/useChatSession', () => ({
  useChatSession: () => ({ isGenerating: { value: false } }),
}))
vi.mock('@/stores/chat', () => ({
  useChatStore: () => ({
    getSessionState: () => ({ messages: { value: mocks.messages } }),
    loadMessages: mocks.loadMessages,
  }),
}))
vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => ({
    getSessionItem: (id: string) => ({ id, name: `名-${id}` }),
    isUnreadSession: (id: string) => mocks.unread.has(id),
    markSessionRead: mocks.markSessionRead,
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.unread.clear()
  mocks.messages = []
})

describe('ThreadChatDetail —— 看见即已读', () => {
  it('挂上来时这条会话有未读 → 立刻销掉', () => {
    mocks.unread.add('dm-1')
    mount(ThreadChatDetail, { props: { sessionId: 'dm-1' } })
    expect(mocks.markSessionRead).toHaveBeenCalledWith('dm-1')
  })

  it('本来就读过的会话不多此一举', () => {
    mount(ThreadChatDetail, { props: { sessionId: 'w-1' } })
    expect(mocks.markSessionRead).not.toHaveBeenCalled()
  })

  it('摊着的时候来了新话也算读过(不必切走再回来)', async () => {
    const wrapper = mount(ThreadChatDetail, { props: { sessionId: 'dm-1' } })
    expect(mocks.markSessionRead).not.toHaveBeenCalled()
    mocks.unread.add('dm-1')
    // 未读判定是 store 的响应式读,这里靠换 props 触发一次重算(真机里是水位事件)。
    await wrapper.setProps({ sessionId: 'dm-1 ' })
    await wrapper.setProps({ sessionId: 'dm-1' })
    expect(mocks.markSessionRead).toHaveBeenCalledWith('dm-1')
  })

  it('小字标与标题可换 —— 私聊 / 私下复用的正是这一面', () => {
    const wrapper = mount(ThreadChatDetail, {
      props: { sessionId: 'dm-1', tag: '私聊', title: '小林' },
    })
    expect(wrapper.find('.head-tag').text()).toBe('私聊')
    expect(wrapper.find('.head-title').text()).toBe('小林')
    // 不给就还是线程那一套(既有行为一个字节不变)。
    const plain = mount(ThreadChatDetail, { props: { sessionId: 'w-1' } })
    expect(plain.find('.head-tag').text()).toBe('THREAD')
    expect(plain.find('.head-title').text()).toBe('名-w-1')
  })
})
