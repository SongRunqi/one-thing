// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChatContainer from '../ChatContainer.vue'

const mocks = vi.hoisted(() => ({
  sessionsStore: {
    currentSessionId: 'session-1',
    sessions: [{ id: 'session-1', name: 'Search target' }],
    createSession: vi.fn(),
    createSessionWithoutSwitch: vi.fn(),
    switchSession: vi.fn(),
  },
  chatStore: {
    sessionMessages: new Map<string, Array<{ id: string }>>(),
    loadMessagesAround: vi.fn(),
  },
  chatWindowScrollToMessage: vi.fn(),
}))

vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => mocks.sessionsStore,
}))

vi.mock('@/stores/chat', () => ({
  useChatStore: () => mocks.chatStore,
}))

vi.mock('@/components/chat/ChatWindow.vue', () => ({
  default: {
    name: 'ChatWindow',
    props: ['sessionId'],
    emits: ['switchSession'],
    setup(_props: unknown, { expose }: { expose: (exposed: Record<string, unknown>) => void }) {
      expose({
        focusInput: vi.fn(),
        addFileTab: vi.fn(),
        scrollToMessage: mocks.chatWindowScrollToMessage,
      })
      return {}
    },
    template: '<button class="mock-chat-window" @click="$emit(\'switchSession\', \'session-new\')">{{ sessionId }}</button>',
  },
}))

vi.mock('@/components/chat/DiffOverlay.vue', () => ({
  default: {
    name: 'DiffOverlay',
    template: '<div class="mock-diff-overlay" />',
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
    mocks.sessionsStore.currentSessionId = 'session-1'
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

  it('switches the active main panel when a child command creates a new session', async () => {
    const wrapper = mount(ChatContainer)
    await settle()

    await wrapper.find('.mock-chat-window').trigger('click')
    await settle()

    expect(mocks.sessionsStore.switchSession).toHaveBeenCalledWith('session-new')
    expect(wrapper.find('.mock-chat-window').text()).toBe('session-new')
  })

  it('switches only the invoking split panel for a child new-session command', async () => {
    const wrapper = mount(ChatContainer)
    await settle()

    const vm = wrapper.vm as unknown as {
      splitPanel: (panelId: string, sessionId: string) => void
    }
    vm.splitPanel('main', 'session-2')
    await settle()

    const panels = wrapper.findAll('.mock-chat-window')
    expect(panels).toHaveLength(2)

    await panels[1].trigger('click')
    await settle()

    expect(mocks.sessionsStore.switchSession).not.toHaveBeenCalled()
    expect(wrapper.findAll('.mock-chat-window').map(panel => panel.text())).toEqual([
      'session-1',
      'session-new',
    ])
  })
})
