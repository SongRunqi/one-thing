// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChatWindow from '../ChatWindow.vue'
import { useWorkspaceStore } from '@/stores/workspace'

/**
 * 去复用重构 R1 的分流门(docs/design/im-workbench-layout.md §8 铁律 2/3)。
 *
 * 这一组钉四件事:
 *  1. 房 / 私聊 + workbench → 新面(房头 + RoomSurface),**没有 TabBar**;
 *  2. 直聊 → 旧壳(TabBar + ChatPanel),一个字节不变;
 *  3. classic → 永远旧壳,房也不例外(逐像素回滚闸);
 *  4. 两套聊天面**永不同时挂载**。
 */
const mocks = vi.hoisted(() => ({
  sessions: [
    { id: 'room-1', name: '浏览器重构', kind: 'room', workingDirectory: '/repo' },
    { id: 'chat-1', name: '直聊', workingDirectory: '/repo' },
  ] as any[],
  shellMode: 'workbench' as 'workbench' | 'classic',
}))

vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => ({
    currentSessionId: 'room-1',
    isLoading: false,
    sessions: mocks.sessions,
    switchSession: vi.fn(),
    isNewChatDraftId: (id: string) => id.startsWith('draft:'),
    discardNewChatDraft: vi.fn(),
    renameSession: vi.fn(),
    getSessionItem: (id: string) => mocks.sessions.find(item => item.id === id),
  }),
}))

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({
    settings: { ui: { shellMode: mocks.shellMode }, general: {}, chat: {} },
  }),
}))

vi.mock('../TabBar.vue', () => ({
  default: { name: 'TabBar', template: '<div class="mock-tab-bar" />' },
}))

vi.mock('../ChatPanel.vue', () => ({
  default: { name: 'ChatPanel', props: ['sessionId'], template: '<div class="mock-chat-panel" />' },
}))

vi.mock('../room/RoomHeader.vue', () => ({
  default: {
    name: 'RoomHeader',
    props: ['sessionId', 'showSidebarToggle', 'isInspectorOpen'],
    template: '<div class="mock-room-header" :data-session="sessionId" />',
  },
}))

vi.mock('../room/RoomSurface.vue', () => ({
  default: {
    name: 'RoomSurface',
    props: ['sessionId'],
    template: '<div class="mock-room-surface" :data-session="sessionId" />',
  },
}))

vi.mock('../PracticeStrip.vue', () => ({
  default: { name: 'PracticeStrip', template: '<div class="mock-practice-strip" />' },
}))

async function settle() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

function installElectronAPI() {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      getSessionCacheStats: vi.fn().mockResolvedValue({ size: 0, maxSize: 10, cachedSessionIds: [] }),
      evictSessionCache: vi.fn().mockResolvedValue({ success: true }),
      closeWindow: vi.fn().mockResolvedValue({ success: true }),
    },
  })
}

function seat(sessionId: string) {
  setActivePinia(createPinia())
  useWorkspaceStore().openSession(sessionId)
}

describe('ChatWindow 房/私聊分流', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.shellMode = 'workbench'
    vi.stubGlobal('localStorage', { getItem: vi.fn(() => null), setItem: vi.fn(), removeItem: vi.fn() })
    installElectronAPI()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('房 + workbench:房头取代 TabBar,中栏是新面', async () => {
    seat('room-1')
    const wrapper = mount(ChatWindow, { props: { showPracticeStrip: true } })
    await settle()

    expect(wrapper.find('.mock-room-header').exists()).toBe(true)
    expect(wrapper.find('.mock-room-surface').attributes('data-session')).toBe('room-1')
    // 旧壳的三件在这一面上一个都没有。
    expect(wrapper.find('.mock-tab-bar').exists()).toBe(false)
    expect(wrapper.find('.mock-chat-panel').exists()).toBe(false)
    expect(wrapper.find('.chat-footer').exists()).toBe(false)
    // 练习条是直聊的东西,不进房。
    expect(wrapper.find('.mock-practice-strip').exists()).toBe(false)
  })

  it('直聊 + workbench:旧壳原样,房面一行都不挂', async () => {
    seat('chat-1')
    const wrapper = mount(ChatWindow, { props: { showPracticeStrip: true } })
    await settle()

    expect(wrapper.find('.mock-tab-bar').exists()).toBe(true)
    expect(wrapper.find('.mock-chat-panel').exists()).toBe(true)
    expect(wrapper.find('.chat-footer').exists()).toBe(true)
    expect(wrapper.find('.mock-practice-strip').exists()).toBe(true)
    expect(wrapper.find('.mock-room-header').exists()).toBe(false)
    expect(wrapper.find('.mock-room-surface').exists()).toBe(false)
  })

  it('classic:房也走旧壳 —— 逐像素回滚闸', async () => {
    mocks.shellMode = 'classic'
    seat('room-1')
    const wrapper = mount(ChatWindow)
    await settle()

    expect(wrapper.find('.mock-tab-bar').exists()).toBe(true)
    expect(wrapper.find('.mock-chat-panel').exists()).toBe(true)
    expect(wrapper.find('.mock-room-surface').exists()).toBe(false)
    expect(wrapper.find('.mock-room-header').exists()).toBe(false)
  })

  it('两套聊天面永不同时挂载', async () => {
    for (const [sessionId, shellMode] of [
      ['room-1', 'workbench'],
      ['chat-1', 'workbench'],
      ['room-1', 'classic'],
    ] as const) {
      mocks.shellMode = shellMode
      seat(sessionId)
      const wrapper = mount(ChatWindow)
      await settle()
      const mounted = [
        wrapper.find('.mock-room-surface').exists(),
        wrapper.find('.mock-chat-panel').exists(),
      ].filter(Boolean)
      expect(mounted).toHaveLength(1)
      wrapper.unmount()
    }
  })
})
