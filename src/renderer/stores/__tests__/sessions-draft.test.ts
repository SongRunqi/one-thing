// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSessionsStore } from '../sessions'
import { useChatStore } from '../chat'

const { electronApi } = vi.hoisted(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    },
  })
  return {
    electronApi: {
      createSession: vi.fn(),
      activateSession: vi.fn(),
      getSessionMessagesPage: vi.fn(),
      getSessionUserMarkers: vi.fn(),
      onSystemThemeChanged: vi.fn(() => vi.fn()),
      getSettings: vi.fn().mockResolvedValue({ success: true, settings: {} }),
      getProviders: vi.fn().mockResolvedValue({ success: true, providers: [] }),
    },
  }
})

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  Object.defineProperty(window, 'electronAPI', {
    configurable: true,
    value: electronApi,
  })
})

describe('sessions draft New Chat', () => {
  it('opens a Today draft without creating a persisted session', () => {
    const store = useSessionsStore()
    const yesterday = Date.now() - 86_400_000
    store.sessions.push({
      id: 'old-empty',
      name: 'New Chat',
      createdAt: yesterday,
      updatedAt: yesterday,
      messageCount: 0,
    })

    const draft = store.openNewChatDraft('New Chat')

    expect(draft.kind).toBe('new-chat-draft')
    expect(store.currentSessionId).toBe(draft.id)
    expect(store.currentSession?.id).toBe(draft.id)
    expect(store.sidebarSessions[0].id).toBe(draft.id)
    expect(store.filteredSessions[0].id).toBe('old-empty')
    expect(store.sessions.some(session => session.id === draft.id)).toBe(false)
    expect(electronApi.createSession).not.toHaveBeenCalled()
  })

  it('creates another draft when current draft already has composer text', () => {
    const store = useSessionsStore()
    const chatStore = useChatStore()
    const first = store.openNewChatDraft('New Chat')
    chatStore.setComposerDraft(first.id, {
      messageInput: 'unfinished prompt',
      quotedText: '',
      attachments: [],
    })

    const second = store.openNewChatDraft('New Chat')

    expect(second.id).not.toBe(first.id)
    expect(store.currentSessionId).toBe(second.id)
    expect(store.newChatDrafts.map(item => item.id)).toEqual([second.id, first.id])
    expect(chatStore.getComposerDraft(first.id)?.messageInput).toBe('unfinished prompt')
    expect(electronApi.createSession).not.toHaveBeenCalled()
  })

  it('keeps draft and composer text when switching to another chat', async () => {
    const store = useSessionsStore()
    const chatStore = useChatStore()
    const now = Date.now()
    store.sessions.push({
      id: 'real-existing',
      name: 'Existing Chat',
      createdAt: now,
      updatedAt: now,
      messageCount: 1,
    })
    const draft = store.openNewChatDraft('New Chat')
    chatStore.setComposerDraft(draft.id, {
      messageInput: 'keep this draft',
      quotedText: '',
      attachments: [],
    })
    electronApi.activateSession.mockResolvedValue({
      success: true,
      session: {
        id: 'real-existing',
        name: 'Existing Chat',
        createdAt: now,
        updatedAt: now,
        messageCount: 1,
      },
    })
    electronApi.getSessionMessagesPage.mockResolvedValue({
      success: true,
      messages: [],
      pageState: {
        nextCursor: null,
        backwardsCursor: null,
        hasMoreBefore: false,
        hasMoreAfter: false,
        totalCount: 0,
      },
    })

    await store.switchSession('real-existing')

    expect(store.currentSessionId).toBe('real-existing')
    expect(store.newChatDrafts.map(item => item.id)).toContain(draft.id)
    expect(store.sidebarSessions[0].id).toBe(draft.id)
    expect(chatStore.getComposerDraft(draft.id)?.messageInput).toBe('keep this draft')
    expect(electronApi.createSession).not.toHaveBeenCalled()
  })

  it('materializes the draft on first send instead of reusing an old empty session', async () => {
    const store = useSessionsStore()
    const yesterday = Date.now() - 86_400_000
    store.sessions.push({
      id: 'old-empty',
      name: 'New Chat',
      createdAt: yesterday,
      updatedAt: yesterday,
      messageCount: 0,
    })
    const draft = store.openNewChatDraft('New Chat')

    electronApi.createSession.mockResolvedValue({
      success: true,
      session: {
        id: 'real-new',
        name: 'New Chat',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 0,
      },
    })
    electronApi.activateSession.mockResolvedValue({
      success: true,
      session: {
        id: 'real-new',
        name: 'New Chat',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messageCount: 0,
      },
    })
    electronApi.getSessionMessagesPage.mockResolvedValue({
      success: true,
      messages: [],
      pageState: {
        nextCursor: null,
        backwardsCursor: null,
        hasMoreBefore: false,
        hasMoreAfter: false,
        totalCount: 0,
      },
    })

    const materialized = await store.materializeNewChatDraft(draft.id, 'New Chat')

    expect(materialized?.id).toBe('real-new')
    expect(electronApi.createSession).toHaveBeenCalledWith('New Chat')
    expect(store.newChatDrafts).toEqual([])
    expect(store.currentSessionId).toBe('real-new')
    expect(store.sessions[0].id).toBe('real-new')
    expect(store.sessions.some(session => session.id === draft.id)).toBe(false)
  })
})
