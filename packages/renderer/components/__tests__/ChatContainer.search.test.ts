// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick, reactive } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ChatContainer from '../ChatContainer.vue'
import { useWorkspaceStore } from '@/stores/workspace'

const mocks = vi.hoisted(() => ({
  sessionsStore: null as any,
  chatStore: {
    sessionMessages: new Map<string, Array<{ id: string }>>(),
    loadMessagesAround: vi.fn(),
    loadInitialMessagePage: vi.fn(),
  },
  chatWindowFocusInput: vi.fn(),
  chatWindowScrollToMessage: vi.fn(),
}))

vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => mocks.sessionsStore,
}))

vi.mock('@/stores/chat', () => ({
  useChatStore: () => mocks.chatStore,
}))

// 外壳形态(R1 的房面闸要读它)。这组用例全是直聊,走哪个档都该是旧壳。
vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({ settings: { ui: { shellMode: 'workbench' }, general: {}, chat: {} } }),
}))

vi.mock('@/components/chat/ChatWindow.vue', () => ({
  default: {
    name: 'ChatWindow',
    props: ['panelId'],
    emits: ['switchSession'],
    setup(props: { panelId?: string }, { expose }: { expose: (exposed: Record<string, unknown>) => void }) {
      expose({
        focusInput: mocks.chatWindowFocusInput,
        scrollToMessage: mocks.chatWindowScrollToMessage,
      })
      const workspace = useWorkspaceStore()
      return { workspace }
    },
    template: '<button class="mock-chat-window" @click="$emit(\'switchSession\', \'session-new\')">{{ workspace.activeSessionIdOf(panelId) }}</button>',
  },
}))

vi.mock('@/components/chat/ChatSidePanel.vue', () => ({
  default: {
    name: 'ChatSidePanel',
    props: ['sessionId', 'workingDirectory', 'agentId', 'lastProvider', 'lastModel', 'collapsed'],
    template: '<aside class="mock-chat-side-panel" :data-session-id="sessionId" />',
  },
}))

async function settle() {
  await nextTick()
  await Promise.resolve()
  await nextTick()
}

describe('ChatContainer search navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
    setActivePinia(createPinia())
    mocks.sessionsStore = reactive({
      currentSessionId: 'session-1',
      isLoading: false,
      sessions: [{ id: 'session-1', name: 'Search target' }],
      createSession: vi.fn(),
      createSessionWithoutSwitch: vi.fn(),
      openNewChatDraft: vi.fn(),
      switchSession: vi.fn(),
      clearCurrentSession: vi.fn(() => {
        mocks.sessionsStore.currentSessionId = ''
      }),
      isNewChatDraftId: (sessionId: string) => sessionId.startsWith('draft:'),
      getSessionItem: (sessionId: string) => mocks.sessionsStore.sessions.find((item: any) => item.id === sessionId),
    })
    mocks.sessionsStore.openNewChatDraft = vi.fn((name: string) => {
      // Mirrors the real store: a draft lands as a tab in the focused leaf.
      useWorkspaceStore().openSession('draft:one')
      mocks.sessionsStore.currentSessionId = 'draft:one'
      return { id: 'draft:one', name }
    })
    mocks.sessionsStore.switchSession.mockImplementation(async (sessionId: string) => {
      mocks.sessionsStore.currentSessionId = sessionId
      return { id: sessionId }
    })
    mocks.chatStore.sessionMessages = new Map([
      ['session-1', [{ id: 'already-loaded' }]],
    ])
    mocks.chatStore.loadMessagesAround.mockImplementation(async (sessionId: string, messageId: string) => {
      mocks.chatStore.sessionMessages.set(sessionId, [{ id: messageId }])
      return true
    })
    mocks.chatWindowScrollToMessage.mockResolvedValue(true)

    const workspace = useWorkspaceStore()
    workspace.hydrate({ currentSessionId: 'session-1' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads the anchor page before scrolling to a search message outside the current slice', async () => {
    const wrapper = mount(ChatContainer)
    await settle()

    const result = await (wrapper.vm as unknown as {
      jumpToMessage: (sessionId: string, messageId: string) => Promise<boolean>
    }).jumpToMessage('session-1', 'target-message')

    expect(result).toBe(true)
    expect(mocks.chatStore.loadMessagesAround).toHaveBeenCalledWith('session-1', 'target-message')
    expect(mocks.chatWindowScrollToMessage).toHaveBeenCalledWith('target-message')
  })

  it('a panel session switch opens the session in that panel and drives the global switch', async () => {
    const wrapper = mount(ChatContainer)
    await settle()

    await wrapper.find('.mock-chat-window').trigger('click')
    await settle()

    expect(mocks.sessionsStore.switchSession).toHaveBeenCalledWith('session-new')
    expect(wrapper.find('.mock-chat-window').text()).toBe('session-new')
  })

  it('focuses the composer after creating a draft from the empty state', async () => {
    useWorkspaceStore().closeSessionTabs('session-1')
    mocks.sessionsStore.currentSessionId = ''
    const wrapper = mount(ChatContainer)
    await settle()

    await wrapper.find('.new-chat-btn').trigger('click')
    await settle()

    expect(mocks.sessionsStore.openNewChatDraft).toHaveBeenCalledWith('New Chat')
    expect(wrapper.find('.mock-chat-window').text()).toBe('draft:one')
    expect(mocks.chatWindowFocusInput).toHaveBeenCalled()
  })

  it('splitting focuses the new panel and switches to its session (which loads it)', async () => {
    mocks.sessionsStore.sessions.push({ id: 'session-2', name: 'Split target' })
    const wrapper = mount(ChatContainer)
    await settle()

    const vm = wrapper.vm as unknown as {
      splitPanel: (panelId: string, sessionId: string) => void
    }
    vm.splitPanel('main', 'session-2')
    await settle()

    const panels = wrapper.findAll('.mock-chat-window')
    expect(panels).toHaveLength(2)
    expect(panels.map(panel => panel.text())).toEqual(['session-1', 'session-2'])
    // Data loading is owned by switchSession, driven by the workspace effect.
    expect(mocks.sessionsStore.switchSession).toHaveBeenCalledWith('session-2')
  })

  it('interacting with any panel focuses it, so its switches update the global session', async () => {
    const wrapper = mount(ChatContainer)
    await settle()

    const vm = wrapper.vm as unknown as {
      splitPanel: (panelId: string, sessionId: string) => void
    }
    vm.splitPanel('main', 'session-2')
    await settle()

    const panels = wrapper.findAll('.mock-chat-window')
    expect(panels).toHaveLength(2)

    mocks.sessionsStore.switchSession.mockClear()

    // The main (unfocused) panel switching its own session refocuses it and
    // updates the global current session — panel focus follows interaction.
    await panels[0].trigger('click')
    await settle()

    expect(mocks.sessionsStore.switchSession).toHaveBeenCalledWith('session-new')
    expect(wrapper.findAll('.mock-chat-window').map(panel => panel.text())).toEqual([
      'session-new',
      'session-2',
    ])
  })

  it('opening a session lands in the focused panel, not always the first one', async () => {
    mocks.sessionsStore.sessions.push({ id: 'session-2', name: 'Split target' }, { id: 'session-3', name: 'New chat target' })
    const wrapper = mount(ChatContainer)
    await settle()

    const vm = wrapper.vm as unknown as {
      splitPanel: (panelId: string, sessionId: string) => void
    }
    vm.splitPanel('main', 'session-2')
    await settle()

    const panels = wrapper.findAll('.mock-chat-window')
    expect(panels).toHaveLength(2)

    // The split panel is focused; a sidebar click elsewhere in the app goes
    // through openSession and lands there.
    useWorkspaceStore().openSession('session-3')
    await settle()

    expect(wrapper.findAll('.mock-chat-window').map(panel => panel.text())).toEqual([
      'session-1',
      'session-3',
    ])
  })
})
