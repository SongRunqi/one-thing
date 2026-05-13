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
    setup(_props: unknown, { expose }: { expose: (exposed: Record<string, unknown>) => void }) {
      expose({
        focusInput: vi.fn(),
        addFileTab: vi.fn(),
        scrollToMessage: mocks.chatWindowScrollToMessage,
      })
      return {}
    },
    template: '<div class="mock-chat-window" />',
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
})
