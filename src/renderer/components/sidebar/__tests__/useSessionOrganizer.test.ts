import { describe, expect, it, vi } from 'vitest'
import { useSessionOrganizer } from '../useSessionOrganizer'

const sessionsStore = vi.hoisted(() => ({
  sessions: [] as any[],
  currentSessionId: '',
}))

vi.mock('@/stores/sessions', () => ({
  useSessionsStore: () => sessionsStore,
}))

describe('useSessionOrganizer', () => {
  it('keeps New Chat drafts first inside Today without moving pinned chats', () => {
    const now = Date.now()
    sessionsStore.sessions = []
    sessionsStore.currentSessionId = ''
    const organizer = useSessionOrganizer()

    const groups = organizer.getGroupedSessions([
      {
        kind: 'new-chat-draft',
        id: 'draft:old',
        name: 'New Chat',
        createdAt: now - 10,
        updatedAt: now - 10,
      },
      {
        kind: 'new-chat-draft',
        id: 'draft:new',
        name: 'New Chat',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'pinned-session',
        name: 'Pinned',
        createdAt: now,
        updatedAt: now + 1000,
        isPinned: true,
      },
      {
        id: 'today-session',
        name: 'Today',
        createdAt: now,
        updatedAt: now + 500,
      },
    ])

    expect(groups[0].key).toBe('pinned')
    expect(groups[0].sessions[0].id).toBe('pinned-session')
    expect(groups[1].key).toBe('today')
    expect(groups[1].sessions.map(session => session.id).slice(0, 3)).toEqual([
      'draft:new',
      'draft:old',
      'today-session',
    ])
  })
})
