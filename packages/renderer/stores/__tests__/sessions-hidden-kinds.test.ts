// @vitest-environment happy-dom
/**
 * W18: an agent's execution session is infrastructure, not a conversation.
 *
 * It rides the archived flag (scheduler precedent) so nothing that filters on
 * `isArchived` has to learn a new rule — but the archive is not where it
 * belongs either: nobody archived it and nobody restores it. Both lists must
 * therefore drop it, and the rooms/work rules must stay exactly as they were.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAgentsStore } from '../agents'
import { useSessionsStore } from '../sessions'

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    },
  })
})

beforeEach(() => {
  setActivePinia(createPinia())
  Object.defineProperty(window, 'electronAPI', { configurable: true, value: {} })
})

describe('agent execution sessions stay out of the lists', () => {
  it('appears in neither the sidebar nor the archive', () => {
    const store = useSessionsStore()
    const now = Date.now()
    store.sessions.push(
      { id: 'chat-1', name: '普通会话', createdAt: now, updatedAt: now },
      { id: 'room-1', name: '官网改版组', kind: 'room', createdAt: now, updatedAt: now },
      { id: 'work-1', name: '[任务]', kind: 'work', createdAt: now, updatedAt: now },
      {
        id: 'agent-exec-fe',
        name: '[执行] 小李',
        kind: 'agent',
        isArchived: true,
        createdAt: now,
        updatedAt: now,
      },
      { id: 'old-1', name: '归档的', isArchived: true, createdAt: now, updatedAt: now },
    )

    expect(store.filteredSessions.map(session => session.id)).toEqual(['chat-1'])
    expect(store.archivedSessions.map(session => session.id)).toEqual(['old-1'])
    // Rooms keep their own section, unchanged.
    expect(store.roomSessions.map(session => session.id)).toEqual(['room-1'])
    // W20 opened ONE door — the sidebar's Agent group. The sidebar list (which
    // is what the 今天/昨天 time groups are built from) still must not have it.
    expect(store.agentSessions.map(session => session.id)).toEqual(['agent-exec-fe'])
    expect(store.sidebarSessions.map(session => session.id)).toEqual(['chat-1'])
  })

  it('stays hidden even if it lost the archived flag', () => {
    const store = useSessionsStore()
    const now = Date.now()
    store.sessions.push({
      id: 'agent-exec-fe',
      name: '[执行] 小李',
      kind: 'agent',
      createdAt: now,
      updatedAt: now,
    })
    expect(store.filteredSessions).toEqual([])
    // …and the Agent group still finds it: the group reads the kind, so an
    // execution session is reachable even if the archived flag went missing.
    expect(store.agentSessions.map(session => session.id)).toEqual(['agent-exec-fe'])
  })
})

/**
 * A0 (agent-domain-model.md M2): a service agent's sessions are feature-panel
 * material, never sidebar material. Judged by the agent's `kind`, with the
 * radio-dj id kept as a floor for the two windows where the kind lookup
 * cannot answer: agents not loaded yet, and pre-A0 agents.json without `kind`.
 */
describe('service agent sessions stay out of the public list', () => {
  const now = Date.now()

  function seedSessions() {
    const store = useSessionsStore()
    store.sessions.push(
      { id: 'chat-1', name: '普通会话', createdAt: now, updatedAt: now },
      { id: 'dj-1', name: '电台', agentId: 'radio-dj', createdAt: now, updatedAt: now },
      { id: 'svc-1', name: '播报', agentId: 'news-bot', createdAt: now, updatedAt: now },
      { id: 'coll-1', name: '同事会话', agentId: 'buddy', createdAt: now, updatedAt: now },
    )
    return store
  }

  it('filters radio-dj by the id floor even before agents have loaded', () => {
    const store = seedSessions()
    // agents store untouched — the load never ran. No flicker window: the
    // radio-dj floor holds regardless.
    expect(store.filteredSessions.map(s => s.id)).toEqual(['chat-1', 'svc-1', 'coll-1'])
    expect(store.radioSessions.map(s => s.id)).toEqual(['dj-1'])
  })

  it('filters any service agent by kind once agents are loaded', () => {
    const agentsStore = useAgentsStore()
    agentsStore.agents.push(
      { id: 'news-bot', name: '播报员', systemPrompt: '', kind: 'service', createdAt: now, updatedAt: now },
      { id: 'buddy', name: '同事', systemPrompt: '', kind: 'colleague', createdAt: now, updatedAt: now },
    )
    const store = seedSessions()
    expect(store.filteredSessions.map(s => s.id)).toEqual(['chat-1', 'coll-1'])
    expect(store.radioSessions.map(s => s.id)).toContain('svc-1')
  })

  it('keeps filtering radio-dj when its stored row predates the kind field', () => {
    const agentsStore = useAgentsStore()
    // Old agents.json: the record exists but has no `kind` — absent means
    // colleague, so only the id floor keeps the DJ out of the sidebar.
    agentsStore.agents.push(
      { id: 'radio-dj', name: 'DJ', systemPrompt: '', createdAt: now, updatedAt: now },
    )
    const store = seedSessions()
    expect(store.filteredSessions.map(s => s.id)).toEqual(['chat-1', 'svc-1', 'coll-1'])
    expect(store.radioSessions.map(s => s.id)).toEqual(['dj-1'])
  })

  it('a session with no agentId (default persona) always stays public', () => {
    const store = useSessionsStore()
    store.sessions.push({ id: 'plain', name: '默认', createdAt: now, updatedAt: now })
    expect(store.filteredSessions.map(s => s.id)).toEqual(['plain'])
  })
})
