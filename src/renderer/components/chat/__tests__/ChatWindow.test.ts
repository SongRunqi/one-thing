// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Button from '../../common/Button.vue'
import ChatWindow from '../ChatWindow.vue'

const mocks = vi.hoisted(() => {
  return {
    chatPanelSave: vi.fn(),
    chatPanelRestore: vi.fn().mockResolvedValue(true),
    chatPanelScrollToMessage: vi.fn().mockResolvedValue(true),
    sessionsStore: {
      currentSessionId: 'session-1',
      sessions: [
        {
          id: 'session-1',
          name: 'Project chat',
          workingDirectory: '/repo',
        },
      ],
      switchSession: vi.fn(),
      getSessionItem: vi.fn((sessionId: string) =>
        mocks.sessionsStore.sessions.find((item: any) => item.id === sessionId),
      ),
    },
  }
})

vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => mocks.sessionsStore,
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

vi.mock('../ChatSidePanel.vue', () => ({
  default: {
    name: 'ChatSidePanel',
    props: ['sessionId', 'workingDirectory', 'collapsed'],
    emits: ['outlineTargetChange'],
    methods: {
      emitOutlineTarget(this: any) {
        this.$emit('outlineTargetChange', this.collapsed ? null : this.$el.querySelector('.mock-outline-target'))
      },
    },
    mounted(this: any) {
      this.emitOutlineTarget()
    },
    updated(this: any) {
      this.emitOutlineTarget()
    },
    template: `
      <aside class="mock-chat-side-panel" :data-collapsed="String(!!collapsed)">
        <div v-if="!collapsed" class="mock-outline-target" />
      </aside>
    `,
  },
}))

vi.mock('../../SettingsPanel.vue', () => ({
  default: {
    name: 'SettingsPanel',
    template: '<div class="mock-settings-panel" />',
  },
}))

async function settle() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

function installElectronAPI(activeTabIndex = 0) {
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: {
      getAppState: vi.fn().mockResolvedValue({
        openTabs: [
          { type: 'chat', sessionId: 'session-1' },
          {
            type: 'workbench',
            workspaceRoot: '/repo',
            initialFilePath: '/repo/src/a.ts',
            activeFilePath: '/repo/src/a.ts',
            title: 'repo',
          },
        ],
        activeTabIndex,
      }),
      saveUIState: vi.fn().mockResolvedValue({ success: true }),
    },
  })
}

let getRectSpy: ReturnType<typeof vi.spyOn> | null = null

function installChatShell(width: number) {
  getRectSpy?.mockRestore()
  vi.stubGlobal('ResizeObserver', class ResizeObserver {
    observe() {}
    disconnect() {}
  })
  getRectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: 800,
    width,
    height: 800,
    toJSON: () => ({}),
  } as DOMRect)
}

function installWideChatShell() {
  installChatShell(1200)
}

function installNarrowChatShell() {
  installChatShell(900)
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
    installWideChatShell()
  })

  afterEach(() => {
    getRectSpy?.mockRestore()
    getRectSpy = null
    vi.unstubAllGlobals()
  })

  it('does not restore persisted workbench tabs into the chat window', async () => {
    const wrapper = mount(ChatWindow, {
      props: {
        sessionId: 'session-1',
      },
    })
    await settle()

    const buttons = wrapper.findAll('.tab-button')
    expect(buttons.map(button => button.attributes('data-type'))).toEqual(['chat'])
  })

  it('provides a left-column footer region to host the chat composer', async () => {
    const wrapper = mount(ChatWindow, {
      props: {
        sessionId: 'session-1',
      },
    })
    await settle()

    const footer = wrapper.find('.layout-container-main .chat-footer')
    const chatPanel = wrapper.findComponent({ name: 'ChatPanel' })

    expect(footer.exists()).toBe(true)
    expect(wrapper.find('.layout-container-footer .chat-footer').exists()).toBe(false)
    expect(chatPanel.props('active')).toBe(true)
    expect(chatPanel.props('footerTarget')).toBe(footer.element)
  })

  it('passes the side panel outline target to ChatPanel on wide chat windows', async () => {
    const wrapper = mount(ChatWindow, {
      props: {
        sessionId: 'session-1',
      },
    })
    await settle()

    const sidePanel = wrapper.find('.mock-chat-side-panel')
    const outlineTarget = wrapper.find('.mock-outline-target')
    const chatPanel = wrapper.findComponent({ name: 'ChatPanel' })

    expect(sidePanel.exists()).toBe(true)
    expect(outlineTarget.exists()).toBe(true)
    expect(chatPanel.props('outlineRailTarget')).toBe(outlineTarget.element)
  })

  it('collapses the right side panel to zero width', async () => {
    const wrapper = mount(ChatWindow, {
      props: {
        sessionId: 'session-1',
      },
    })
    await settle()

    await wrapper.find('.mock-side-toggle').trigger('click')
    await settle()

    const sidePanel = wrapper.find('.mock-chat-side-panel')
    const sidebarRegion = wrapper.find('.layout-container-sidebar')
    const containerStyle = wrapper.find('.layout-container').attributes('style')
    const chatPanel = wrapper.findComponent({ name: 'ChatPanel' })

    expect(containerStyle).toContain('--layout-container-sidebar-width: 0px')
    expect(sidebarRegion.classes()).toContain('collapsed')
    expect(sidePanel.attributes('data-collapsed')).toBe('true')
    expect(chatPanel.props('outlineRailTarget')).toBeNull()
  })

  it('expands the right side panel from the persistent toggle on narrow chat windows', async () => {
    vi.mocked(localStorage.getItem).mockReturnValue('true')
    installNarrowChatShell()

    const wrapper = mount(ChatWindow, {
      props: {
        sessionId: 'session-1',
      },
    })
    await settle()

    expect(wrapper.find('.mock-side-toggle').exists()).toBe(true)
    expect(wrapper.find('.mock-chat-side-panel').exists()).toBe(false)

    await wrapper.find('.mock-side-toggle').trigger('click')
    await settle()

    const sidePanel = wrapper.find('.mock-chat-side-panel')
    const outlineTarget = wrapper.find('.mock-outline-target')
    const containerStyle = wrapper.find('.layout-container').attributes('style')
    const chatPanel = wrapper.findComponent({ name: 'ChatPanel' })

    expect(containerStyle).toContain('--layout-container-sidebar-width: 268px')
    expect(sidePanel.exists()).toBe(true)
    expect(sidePanel.attributes('data-collapsed')).toBe('false')
    expect(chatPanel.props('outlineRailTarget')).toBe(outlineTarget.element)
  })

  it('emits file opens for the app-level right workbench instead of creating a chat tab', async () => {
    const wrapper = mount(ChatWindow, {
      props: {
        sessionId: 'session-1',
      },
    })
    await settle()

    await wrapper.find('.open-file').trigger('click')
    await settle()

    expect(wrapper.emitted('openFile')).toEqual([['/repo/src/a.ts']])
    expect(wrapper.findAll('.tab-button').map(button => button.attributes('data-type'))).toEqual(['chat'])
    expect(mocks.chatPanelSave).not.toHaveBeenCalled()
    expect(mocks.chatPanelRestore).not.toHaveBeenCalled()
  })

  it('scrolls to a target message from the chat tab without restoring a workbench tab', async () => {
    installElectronAPI(1)
    const wrapper = mount(ChatWindow, {
      props: {
        sessionId: 'session-1',
      },
    })
    await settle()

    const result = await (wrapper.vm as unknown as { scrollToMessage: (messageId: string) => Promise<boolean> })
      .scrollToMessage('message-1')
    await settle()

    expect(result).toBe(true)
    expect(mocks.chatPanelRestore).not.toHaveBeenCalled()
    expect(mocks.chatPanelScrollToMessage).toHaveBeenCalledWith('message-1')
  })
})
