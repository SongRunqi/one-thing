import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCollabBoardStore } from '../collabBoard'

const mocks = vi.hoisted(() => ({
  handlers: [] as Array<(envelope: { sessionId: string; event: unknown }) => void>,
}))

vi.mock('@/platform', () => ({
  platformApi: {
    onSessionEvent: (handler: (envelope: { sessionId: string; event: unknown }) => void) => {
      mocks.handlers.push(handler)
      return () => {}
    },
    getCollabBoard: vi.fn().mockResolvedValue({ success: false }),
  },
}))

function emitTyping(sessionId: string, agentId: string, typing: boolean): void {
  for (const handler of mocks.handlers) {
    handler({ sessionId, event: { type: 'collab:typing', agentId, typing } })
  }
}

beforeEach(() => {
  mocks.handlers.length = 0
  setActivePinia(createPinia())
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-07-28T10:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('collabBoard store: IM typing indicator (§2.4)', () => {
  it('adds a member on typing:true and drops it on typing:false', () => {
    const store = useCollabBoardStore()
    store.ensureSubscribed()

    expect(store.typingAgents('room-1')).toEqual([])

    emitTyping('room-1', 'agent-li', true)
    expect(store.typingAgents('room-1')).toEqual(['agent-li'])

    emitTyping('room-1', 'agent-li', false)
    expect(store.typingAgents('room-1')).toEqual([])
  })

  it('keeps arrival order and removes only the named member', () => {
    const store = useCollabBoardStore()
    store.ensureSubscribed()

    emitTyping('room-1', 'agent-li', true)
    emitTyping('room-1', 'agent-yan', true)
    expect(store.typingAgents('room-1')).toEqual(['agent-li', 'agent-yan'])

    emitTyping('room-1', 'agent-li', false)
    expect(store.typingAgents('room-1')).toEqual(['agent-yan'])
  })

  it('re-affirming typing does not reshuffle the name order', () => {
    const store = useCollabBoardStore()
    store.ensureSubscribed()

    emitTyping('room-1', 'agent-li', true)
    emitTyping('room-1', 'agent-yan', true)
    // The coordinator restates true before every drive.
    emitTyping('room-1', 'agent-li', true)

    expect(store.typingAgents('room-1')).toEqual(['agent-li', 'agent-yan'])
  })

  it('scopes typing per room', () => {
    const store = useCollabBoardStore()
    store.ensureSubscribed()

    emitTyping('room-1', 'agent-li', true)
    emitTyping('room-2', 'agent-yan', true)

    expect(store.typingAgents('room-1')).toEqual(['agent-li'])
    expect(store.typingAgents('room-2')).toEqual(['agent-yan'])
    expect(store.typingAgents('room-3')).toEqual([])
  })

  it('expires a true that never got its false after 60s', () => {
    const store = useCollabBoardStore()
    store.ensureSubscribed()

    emitTyping('room-1', 'agent-li', true)

    vi.advanceTimersByTime(59_000)
    expect(store.typingAgents('room-1')).toEqual(['agent-li'])

    vi.advanceTimersByTime(2_000)
    expect(store.typingAgents('room-1')).toEqual([])
  })

  it('refreshes the deadline on a restated true', () => {
    const store = useCollabBoardStore()
    store.ensureSubscribed()

    emitTyping('room-1', 'agent-li', true)
    vi.advanceTimersByTime(50_000)
    emitTyping('room-1', 'agent-li', true)

    vi.advanceTimersByTime(30_000)
    expect(store.typingAgents('room-1')).toEqual(['agent-li'])
  })

  it('expires members independently', () => {
    const store = useCollabBoardStore()
    store.ensureSubscribed()

    emitTyping('room-1', 'agent-li', true)
    vi.advanceTimersByTime(30_000)
    emitTyping('room-1', 'agent-yan', true)

    vi.advanceTimersByTime(31_000)
    expect(store.typingAgents('room-1')).toEqual(['agent-yan'])
  })

  it('ignores a false for a member that never typed, and malformed events', () => {
    const store = useCollabBoardStore()
    store.ensureSubscribed()

    emitTyping('room-1', 'agent-ghost', false)
    for (const handler of mocks.handlers) {
      handler({ sessionId: 'room-1', event: { type: 'collab:typing' } })
      handler({ sessionId: 'room-1', event: { type: 'collab:typing', agentId: 'agent-li' } })
      handler({ sessionId: 'room-1', event: undefined })
    }

    // A missing `typing` field is not a true — only an explicit true starts one.
    expect(store.typingAgents('room-1')).toEqual([])
  })

  it('returns an empty roster for a missing session id', () => {
    const store = useCollabBoardStore()
    store.ensureSubscribed()

    emitTyping('room-1', 'agent-li', true)
    expect(store.typingAgents(undefined)).toEqual([])
    expect(store.typingAgents('')).toEqual([])
  })
})
