import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useWorkspaceStore } from '../workspace'
import {
  rebuildFromLegacyTabs,
  rebuildWorkspace,
  serializeWorkspace,
  type PersistedWorkspace,
} from '../workspace-persistence'
import type { WorkspaceSplit } from '../workspace-tree'

const mocks = vi.hoisted(() => ({
  sessionsStore: {
    isLoading: false,
    sessions: [{ id: 'session-1' }, { id: 'session-2' }, { id: 'session-3' }],
    switchSession: vi.fn(),
    clearCurrentSession: vi.fn(),
    isNewChatDraftId: (sessionId: string) => sessionId.startsWith('draft:'),
  },
}))

vi.mock('@/platform', () => ({
  platformApi: {
    saveUIState: vi.fn().mockResolvedValue({ success: true }),
  },
}))

vi.mock('../sessions', () => ({
  useSessionsStore: () => mocks.sessionsStore,
}))

const valid = (id: string) => mocks.sessionsStore.sessions.some(s => s.id === id)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.sessionsStore.sessions = [{ id: 'session-1' }, { id: 'session-2' }, { id: 'session-3' }]
  setActivePinia(createPinia())
})

describe('workspace store: tabs', () => {
  it('starts as one empty leaf ("main") — the empty-workspace state', () => {
    const store = useWorkspaceStore()
    expect(store.leaves.map(l => l.id)).toEqual(['main'])
    expect(store.hasAnyChatTab).toBe(false)
    expect(store.activeSessionId).toBe('')
  })

  it('openSession appends a tab and activates it; reopening reuses the tab (I3)', () => {
    const store = useWorkspaceStore()
    store.openSession('session-1')
    store.openSession('session-2')
    store.openSession('session-1')

    expect(store.tabsOf('main').map(t => t.sessionId)).toEqual(['session-1', 'session-2'])
    expect(store.activeSessionId).toBe('session-1')
  })

  it('openSession is a no-op when the session is already active (no persist churn)', () => {
    const store = useWorkspaceStore()
    store.openSession('session-1')
    const tabId = store.activeTabIdOf('main')
    store.openSession('session-1')
    expect(store.activeTabIdOf('main')).toBe(tabId)
    expect(store.tabsOf('main')).toHaveLength(1)
  })

  it('closeTab promotes the right neighbor and reports released sessions', () => {
    const store = useWorkspaceStore()
    store.openSession('session-1')
    store.openSession('session-2')
    store.openSession('session-3')
    store.activateTab('main', store.tabsOf('main')[1].id)

    const result = store.closeTab('main', store.tabsOf('main')[1].id)

    expect(result).toEqual({ closedSessionId: 'session-2', released: true })
    expect(store.tabsOf('main').map(t => t.sessionId)).toEqual(['session-1', 'session-3'])
    // Right neighbor (same index after splice) takes over.
    expect(store.activeSessionId).toBe('session-3')
  })

  it('closing the last tab of the only leaf is refused (I1)', () => {
    const store = useWorkspaceStore()
    store.openSession('session-1')
    const result = store.closeTab('main', store.tabsOf('main')[0].id)
    expect(result).toBeUndefined()
    expect(store.tabsOf('main')).toHaveLength(1)
  })

  it('closing the last tab of a split leaf closes the leaf (cascade)', () => {
    const store = useWorkspaceStore()
    store.openSession('session-1')
    const leafId = store.splitLeaf('main', 'session-2', 'right')!

    const result = store.closeTab(leafId, store.tabsOf(leafId)[0].id)

    expect(result).toEqual({ closedSessionId: 'session-2', released: true })
    expect(store.leaves.map(l => l.id)).toEqual(['main'])
    expect(store.activeLeafId).toBe('main')
  })

  it('a session open in two leaves is not "released" until its last tab closes', () => {
    const store = useWorkspaceStore()
    store.openSession('session-1')
    store.openSession('session-2')
    const leafId = store.splitLeaf('main', 'session-2', 'right')!

    const inMain = store.tabsOf('main').find(t => t.sessionId === 'session-2')!
    expect(store.closeTab('main', inMain.id)).toEqual({ closedSessionId: 'session-2', released: false })
    expect(store.closeTab(leafId, store.tabsOf(leafId)[0].id)).toEqual({ closedSessionId: 'session-2', released: true })
  })

  it('moveTab reorders within a leaf', () => {
    const store = useWorkspaceStore()
    store.openSession('session-1')
    store.openSession('session-2')
    const [a, b] = store.tabsOf('main')
    store.moveTab('main', a.id, b.id)
    expect(store.tabsOf('main').map(t => t.sessionId)).toEqual(['session-2', 'session-1'])
  })
})

describe('workspace store: session lifecycle', () => {
  it('closeSessionTabs removes the session everywhere and collapses emptied leaves', () => {
    const store = useWorkspaceStore()
    store.openSession('session-1')
    const leafId = store.splitLeaf('main', 'session-2', 'right')!
    store.openSession('session-2', { leafId: 'main' })

    store.closeSessionTabs('session-2')

    expect(store.leaves.map(l => l.id)).toEqual(['main'])
    expect(store.tabsOf('main').map(t => t.sessionId)).toEqual(['session-1'])
    expect(store.leafById(leafId)).toBeUndefined()
  })

  it('closeSessionTabs on the sole leaf leaves the empty-workspace state', () => {
    const store = useWorkspaceStore()
    store.openSession('session-1')
    store.closeSessionTabs('session-1')
    expect(store.leaves).toHaveLength(1)
    expect(store.hasAnyChatTab).toBe(false)
    expect(store.activeSessionId).toBe('')
  })

  it('closeSessionTabs scoped to one leaf keeps the session open elsewhere', () => {
    const store = useWorkspaceStore()
    store.openSession('session-1')
    store.openSession('session-2')
    const leafId = store.splitLeaf('main', 'session-2', 'right')!

    store.closeSessionTabs('session-2', { onlyLeafId: 'main' })

    expect(store.tabsOf('main').map(t => t.sessionId)).toEqual(['session-1'])
    expect(store.tabsOf(leafId).map(t => t.sessionId)).toEqual(['session-2'])
  })

  it('a draft tab needs no retargeting: the draft id IS the session id (方案 A)', () => {
    const store = useWorkspaceStore()
    store.openSession('session-1')
    // Draft ids are ordinary UUIDs; materialization persists the session
    // under the same id, so the tab simply keeps pointing at it.
    store.openSession('11111111-2222-4333-8444-555555555555')

    expect(store.tabsOf('main').map(t => t.sessionId)).toEqual([
      'session-1',
      '11111111-2222-4333-8444-555555555555',
    ])
    expect(store.activeSessionId).toBe('11111111-2222-4333-8444-555555555555')
  })
})

describe('workspace store: the switch effect', () => {
  it('follows activeSessionId into switchSession once hydrated', async () => {
    const store = useWorkspaceStore()
    store.hydrate(null)
    store.openSession('session-1')
    await nextTick()
    expect(mocks.sessionsStore.switchSession).toHaveBeenCalledWith('session-1')

    store.openSession('session-2')
    await nextTick()
    expect(mocks.sessionsStore.switchSession).toHaveBeenCalledWith('session-2')
  })

  it('clears the current session when the workspace empties', async () => {
    const store = useWorkspaceStore()
    store.hydrate(null)
    store.openSession('session-1')
    await nextTick()

    store.closeSessionTabs('session-1')
    await nextTick()
    expect(mocks.sessionsStore.clearCurrentSession).toHaveBeenCalled()
  })

  it('stays silent before hydration', async () => {
    const store = useWorkspaceStore()
    store.openSession('session-1')
    await nextTick()
    expect(mocks.sessionsStore.switchSession).not.toHaveBeenCalled()
  })
})

describe('workspace persistence', () => {
  it('round-trips a split tree with per-leaf active tabs', () => {
    const store = useWorkspaceStore()
    store.openSession('session-1')
    store.openSession('session-2')
    store.splitLeaf('main', 'session-3', 'right')
    // Activating a tab focuses its leaf, so 'main' is the active leaf again.
    store.activateTab('main', store.tabsOf('main')[0].id)

    const persisted = serializeWorkspace(store.root, store.activeLeafId, () => false)
    const rebuilt = rebuildWorkspace(persisted, valid)

    expect(rebuilt.activeLeafId).toBe('main')
    const root = rebuilt.root as WorkspaceSplit
    expect(root.type).toBe('split')
    const [main, split] = root.children
    expect(main).toMatchObject({ type: 'leaf', id: 'main' })
    if (main.type !== 'leaf' || split.type !== 'leaf') throw new Error('expected leaves')
    expect(main.tabs.map(t => t.sessionId)).toEqual(['session-1', 'session-2'])
    expect(main.tabs.find(t => t.id === main.activeTabId)?.sessionId).toBe('session-1')
    expect(split.tabs.map(t => t.sessionId)).toEqual(['session-3'])
  })

  it('does not serialize draft tabs (draft-ness comes from the injected predicate)', () => {
    const store = useWorkspaceStore()
    store.openSession('session-1')
    store.openSession('draft-uuid')

    const persisted = serializeWorkspace(
      store.root,
      store.activeLeafId,
      id => id === 'draft-uuid',
    )
    expect(persisted.root).toMatchObject({ type: 'leaf', sessions: ['session-1'] })
  })

  it('rebuild drops unknown sessions, dedupes, and collapses empty leaves', () => {
    const persisted: PersistedWorkspace = {
      version: 2,
      activeLeafId: 'gone',
      root: {
        type: 'split',
        id: 'split-1',
        orientation: 'horizontal',
        size: 100,
        children: [
          { type: 'leaf', id: 'main', size: 50, sessions: ['session-1', 'deleted', 'session-1'], activeIndex: 2 },
          { type: 'leaf', id: 'gone', size: 50, sessions: ['deleted'], activeIndex: 0 },
        ],
      },
    }

    const rebuilt = rebuildWorkspace(persisted, valid)

    // The one surviving leaf is promoted to root; the stale activeLeafId
    // falls back to the first leaf.
    expect(rebuilt.root).toMatchObject({ type: 'leaf', id: 'main' })
    expect(rebuilt.activeLeafId).toBe('main')
    if (rebuilt.root.type !== 'leaf') throw new Error('expected leaf')
    expect(rebuilt.root.tabs.map(t => t.sessionId)).toEqual(['session-1'])
  })

  it('migrates v1 flat openTabs, dropping non-chat, empty-id, and unknown entries', () => {
    const rebuilt = rebuildFromLegacyTabs(
      [
        { type: 'chat', sessionId: 'session-1' },
        { type: 'chat', sessionId: '' }, // v1 serialized drafts as ''
        { type: 'workbench' },
        { type: 'chat', sessionId: 'deleted' },
        { type: 'chat', sessionId: 'session-2' },
        { type: 'chat', sessionId: 'session-1' },
      ],
      4,
      valid,
    )

    const rootLeaf = rebuilt.root
    if (rootLeaf.type !== 'leaf') throw new Error('expected leaf')
    expect(rootLeaf.tabs.map(t => t.sessionId)).toEqual(['session-1', 'session-2'])
    // The saved index is clamped into the surviving list.
    expect(rootLeaf.tabs.find(t => t.id === rootLeaf.activeTabId)?.sessionId).toBe('session-2')
  })

  it('hydrate falls back to currentSessionId, then to the empty workspace', () => {
    const store = useWorkspaceStore()
    store.hydrate({ currentSessionId: 'session-2' })
    expect(store.tabsOf('main').map(t => t.sessionId)).toEqual(['session-2'])
    expect(store.hydrated).toBe(true)

    setActivePinia(createPinia())
    const empty = useWorkspaceStore()
    empty.hydrate({ currentSessionId: 'deleted' })
    expect(empty.hasAnyChatTab).toBe(false)
    expect(empty.hydrated).toBe(true)
  })

  it('hydrate is one-shot', () => {
    const store = useWorkspaceStore()
    store.hydrate({ currentSessionId: 'session-1' })
    store.hydrate({ currentSessionId: 'session-2' })
    expect(store.tabsOf('main').map(t => t.sessionId)).toEqual(['session-1'])
  })
})

describe('workspace store: panels', () => {
  it('splitLeaf focuses the new leaf; closeLeaf reports released sessions', () => {
    const store = useWorkspaceStore()
    store.openSession('session-1')
    const leafId = store.splitLeaf('main', 'session-2', 'right')!
    expect(store.activeLeafId).toBe(leafId)
    expect(store.activeSessionId).toBe('session-2')

    const result = store.closeLeaf(leafId)
    expect(result?.releasedSessionIds).toEqual(['session-2'])
    expect(store.leaves.map(l => l.id)).toEqual(['main'])
    expect(store.activeLeafId).toBe('main')
  })

  it('closeLeaf keeps sessions that are still open in another leaf out of the released list', () => {
    const store = useWorkspaceStore()
    store.openSession('session-1')
    const leafId = store.splitLeaf('main', 'session-1', 'right')!
    const result = store.closeLeaf(leafId)
    expect(result?.releasedSessionIds).toEqual([])
  })

  // 已读水位吃的是"看得见"而不是"开着"(agent-im-dm.md P4):后台页签没人在看,
  // 水位不该替用户往前推。
  it('visibleSessionIds = 每个分栏的当前页签,后台页签不算', () => {
    const store = useWorkspaceStore()
    store.openSession('session-1')
    store.openSession('session-2')
    expect([...store.openSessionIds]).toEqual(['session-1', 'session-2'])
    expect([...store.visibleSessionIds]).toEqual(['session-2'])

    store.splitLeaf('main', 'session-3', 'right')
    expect([...store.visibleSessionIds].sort()).toEqual(['session-2', 'session-3'])
  })
})
