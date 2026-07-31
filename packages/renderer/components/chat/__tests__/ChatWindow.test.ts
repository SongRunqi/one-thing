// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Button from '../../common/Button.vue'
import ChatWindow from '../ChatWindow.vue'
import { useWorkspaceStore } from '@/stores/workspace'

const mocks = vi.hoisted(() => {
  return {
    chatPanelSave: vi.fn(),
    chatPanelRestore: vi.fn().mockResolvedValue(true),
    chatPanelScrollToMessage: vi.fn().mockResolvedValue(true),
    sessionsStore: {
      currentSessionId: 'session-1',
      isLoading: false,
      sessions: [
        {
          id: 'session-1',
          name: 'Project chat',
          workingDirectory: '/repo',
        },
        {
          id: 'session-2',
          name: 'Second chat',
          workingDirectory: '/repo',
        },
      ],
      switchSession: vi.fn(),
      clearCurrentSession: vi.fn(),
      isNewChatDraftId: (sessionId: string) => sessionId.startsWith('draft:'),
      discardNewChatDraft: vi.fn(),
      getSessionItem: vi.fn((sessionId: string) =>
        mocks.sessionsStore.sessions.find((item: any) => item.id === sessionId),
      ),
    },
    // 外壳形态:这组用例全是直聊,所以走哪个档都该是旧壳(TabBar + ChatPanel)。
    settingsStore: {
      settings: { ui: { shellMode: 'workbench' }, general: {}, chat: {} } as Record<string, unknown>,
    },
  }
})

vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => mocks.sessionsStore,
}))

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => mocks.settingsStore,
}))

vi.mock('../TabBar.vue', () => ({
  default: {
    name: 'TabBar',
    components: { Button },
    props: ['tabs', 'activeTabId', 'sidePanelAvailable', 'sidePanelCollapsed'],
    emits: ['selectTab', 'closeTab', 'toggleSidePanel'],
    template: `
      <div class="mock-tab-bar">
        <Button
          v-for="tab in tabs"
          :key="tab.id"
          unstyled
          class="tab-button"
          :data-type="tab.type"
          :data-active="tab.id === activeTabId"
          @click="$emit('selectTab', tab.id)"
        >
          {{ tab.type }}
        </Button>
        <Button
          v-for="tab in tabs"
          :key="tab.id + '-close'"
          unstyled
          class="close-tab-btn"
          @click="$emit('closeTab', tab.id)"
        >
          close {{ tab.type }}
        </Button>
        <Button
          unstyled
          class="mock-side-toggle"
          :data-collapsed="String(!!sidePanelCollapsed)"
          @click="$emit('toggleSidePanel')"
        >
          side
        </Button>
      </div>
    `,
  },
}))

// 房面(去复用重构 R1)在直聊上永不挂载,但它是 ChatWindow 的静态 import ——
// 与 ChatPanel 一样打桩,免得把 InputBox 的整条依赖链拖进这组直聊测试。
vi.mock('../room/RoomHeader.vue', () => ({
  default: { name: 'RoomHeader', template: '<div class="mock-room-header" />' },
}))

vi.mock('../room/RoomSurface.vue', () => ({
  default: { name: 'RoomSurface', template: '<div class="mock-room-surface" />' },
}))

vi.mock('../ChatPanel.vue', () => ({
  default: {
    name: 'ChatPanel',
    components: { Button },
    props: ['sessionId', 'active', 'footerTarget', 'outlineRailTarget'],
    emits: ['splitWithBranch', 'openFile'],
    setup(_props: unknown, { expose }: { expose: (exposed: Record<string, unknown>) => void }) {
      expose({
        focusInput: vi.fn(),
        saveSnapshotForCurrentSession: mocks.chatPanelSave,
        restoreSnapshotForCurrentSession: mocks.chatPanelRestore,
        scrollToMessage: mocks.chatPanelScrollToMessage,
      })
      return {}
    },
    template: `
      <div class="mock-chat-panel" :data-active="active">
        <Button unstyled class="open-file" @click="$emit('openFile', '/repo/src/a.ts')">open file</Button>
      </div>
    `,
  },
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
      getAppState: vi.fn().mockResolvedValue({}),
      saveUIState: vi.fn().mockResolvedValue({ success: true }),
      getSessionCacheStats: vi.fn().mockResolvedValue({ size: 0, maxSize: 10, cachedSessionIds: [] }),
      evictSessionCache: vi.fn().mockResolvedValue({ success: true }),
      closeWindow: vi.fn().mockResolvedValue({ success: true }),
    },
  })
}

describe('ChatWindow tab switching', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
    installElectronAPI()
    setActivePinia(createPinia())
    // ChatWindow renders whatever its workspace leaf holds; seed the store
    // the way hydration would.
    useWorkspaceStore().openSession('session-1')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders only the chat tabs of its workspace leaf', async () => {
    const wrapper = mount(ChatWindow)
    await settle()

    const buttons = wrapper.findAll('.tab-button')
    expect(buttons.map(button => button.attributes('data-type'))).toEqual(['chat'])
    expect(buttons[0].attributes('data-active')).toBe('true')
  })

  it('provides a left-column footer region to host the chat composer', async () => {
    const wrapper = mount(ChatWindow)
    await settle()

    const footer = wrapper.find('.layout-container-main .chat-footer')
    const chatPanel = wrapper.findComponent({ name: 'ChatPanel' })

    expect(footer.exists()).toBe(true)
    expect(wrapper.find('.layout-container-footer .chat-footer').exists()).toBe(false)
    expect(chatPanel.props('active')).toBe(true)
    expect(chatPanel.props('footerTarget')).toBe(footer.element)
    expect(chatPanel.props('sessionId')).toBe('session-1')
  })

  it('forwards the shared side-panel props straight through to TabBar and ChatPanel', async () => {
    const wrapper = mount(ChatWindow, {
      props: {
        sidePanelAvailable: true,
        sidePanelCollapsed: false,
        outlineRailTarget: document.createElement('div'),
      },
    })
    await settle()

    const chatPanel = wrapper.findComponent({ name: 'ChatPanel' })
    expect(wrapper.find('.mock-side-toggle').attributes('data-collapsed')).toBe('false')
    expect(chatPanel.props('outlineRailTarget')).toBe(wrapper.props('outlineRailTarget'))

    await wrapper.find('.mock-side-toggle').trigger('click')
    expect(wrapper.emitted('toggleSidePanel')).toHaveLength(1)
  })

  it('emits file opens for the app-level right workbench instead of creating a chat tab', async () => {
    const wrapper = mount(ChatWindow)
    await settle()

    await wrapper.find('.open-file').trigger('click')
    await settle()

    expect(wrapper.emitted('openFile')).toEqual([['/repo/src/a.ts']])
    expect(wrapper.findAll('.tab-button').map(button => button.attributes('data-type'))).toEqual(['chat'])
    expect(mocks.chatPanelSave).not.toHaveBeenCalled()
    expect(mocks.chatPanelRestore).not.toHaveBeenCalled()
  })

  it('scrolls to a target message from the chat tab', async () => {
    const wrapper = mount(ChatWindow)
    await settle()

    const result = await (wrapper.vm as unknown as { scrollToMessage: (messageId: string) => Promise<boolean> })
      .scrollToMessage('message-1')
    await settle()

    expect(result).toBe(true)
    expect(mocks.chatPanelRestore).not.toHaveBeenCalled()
    expect(mocks.chatPanelScrollToMessage).toHaveBeenCalledWith('message-1')
  })

  it('closing the only chat tab of a split panel closes the whole leaf in the store', async () => {
    const workspace = useWorkspaceStore()
    const newLeafId = workspace.splitLeaf('main', 'session-2', 'right')!

    const wrapper = mount(ChatWindow, {
      props: { panelId: newLeafId, canClose: true },
    })
    await settle()

    await wrapper.find('.close-tab-btn').trigger('click')
    await settle()

    // The leaf collapsed away and its session's cache was released.
    expect(workspace.leaves.map(leaf => leaf.id)).toEqual(['main'])
    expect(vi.mocked((window as any).electronAPI.evictSessionCache)).toHaveBeenCalledWith('session-2')
  })

  it('closing the only chat tab of the only panel closes the window instead', async () => {
    const workspace = useWorkspaceStore()
    const wrapper = mount(ChatWindow)
    await settle()

    await wrapper.find('.close-tab-btn').trigger('click')
    await settle()

    // The store still refuses to empty the workspace — the window goes away instead.
    expect(workspace.tabsOf('main')).toHaveLength(1)
    expect(wrapper.findAll('.tab-button').map(button => button.attributes('data-type'))).toEqual(['chat'])
    expect(vi.mocked((window as any).electronAPI.evictSessionCache)).not.toHaveBeenCalled()
    expect(vi.mocked((window as any).electronAPI.closeWindow)).toHaveBeenCalledOnce()
  })

  it('closing a tab with siblings does not close the window', async () => {
    const workspace = useWorkspaceStore()
    workspace.openSession('session-2')
    const wrapper = mount(ChatWindow)
    await settle()

    await wrapper.findAll('.close-tab-btn')[1].trigger('click')
    await settle()

    expect(workspace.tabsOf('main')).toHaveLength(1)
    expect(vi.mocked((window as any).electronAPI.closeWindow)).not.toHaveBeenCalled()
  })

  it('closing a draft tab discards the draft instead of evicting cache', async () => {
    const workspace = useWorkspaceStore()
    workspace.openSession('draft:abc')
    const wrapper = mount(ChatWindow)
    await settle()

    const closeButtons = wrapper.findAll('.close-tab-btn')
    await closeButtons[1].trigger('click')
    await settle()

    expect(mocks.sessionsStore.discardNewChatDraft).toHaveBeenCalledWith('draft:abc')
    expect(vi.mocked((window as any).electronAPI.evictSessionCache)).not.toHaveBeenCalled()
    expect(workspace.tabsOf('main').map(tab => tab.sessionId)).toEqual(['session-1'])
  })
})
