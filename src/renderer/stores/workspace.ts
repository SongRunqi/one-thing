/**
 * Workspace store: the single owner of "which sessions are open, in which
 * split panel, with which tab active".
 *
 * Replaces the previous three-way split of this state (per-ChatWindow
 * `useTabs`, ChatContainer-local `usePanelLayout`, and reverse watches on
 * `sessionsStore.currentSessionId`), which produced last-writer-wins
 * persistence between split panels, tab loss on component unmount, and
 * stale/duplicate tabs on restore. See docs/design/workspace-store.md.
 *
 * Data flow is one-way: user actions mutate this store; a single effect
 * follows `activeSessionId` and drives `sessionsStore.switchSession` (which
 * owns data loading and `currentSessionId`). Components render from here and
 * never hold tab state of their own.
 *
 * Invariants (maintained by every mutation):
 * - I1: every leaf has ≥1 tab, except the sole leaf of an empty workspace.
 * - I2: `activeTabId` points into its leaf's tabs; `activeLeafId` points at
 *   an existing leaf.
 * - I3: within one leaf, chat tabs are unique per session (the same session
 *   may be open in several leaves).
 * - I4: split nodes have ≥2 children; degenerate splits collapse.
 */
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { platformApi } from '@/platform'
import type { ChatTab } from '@/types/tabs'
import { useSessionsStore } from './sessions'
import {
  activeSessionOf,
  closeLeaf as closeLeafInTree,
  collectLeaves,
  createChatTab,
  createLeaf,
  equalizeSiblings as equalizeSiblingsInTree,
  findLeaf,
  MAIN_LEAF_ID,
  splitLeaf as splitLeafInTree,
  type SplitDirection,
  type WorkspaceLeaf,
  type WorkspaceNode,
} from './workspace-tree'
import {
  rebuildFromLegacyTabs,
  rebuildWorkspace,
  serializeWorkspace,
  type LegacyPersistedTab,
  type PersistedWorkspace,
} from './workspace-persistence'

export interface WorkspaceHydrationSource {
  currentSessionId?: string
  openTabs?: LegacyPersistedTab[]
  activeTabIndex?: number
  workspace?: PersistedWorkspace
}

export interface CloseTabResult {
  closedSessionId: string
  /** true when the session is no longer open in any leaf (safe to evict its cache / discard its draft). */
  released: boolean
}

export interface CloseLeafResult {
  /** Sessions whose last open tab lived in the closed leaf. */
  releasedSessionIds: string[]
}

const PERSIST_DEBOUNCE_MS = 150

export const useWorkspaceStore = defineStore('workspace', () => {
  const root = ref<WorkspaceNode>(createLeaf(MAIN_LEAF_ID, 100))
  const activeLeafId = ref(MAIN_LEAF_ID)
  const hydrated = ref(false)

  const leaves = computed(() => collectLeaves(root.value))
  const activeLeaf = computed<WorkspaceLeaf | undefined>(
    () => findLeaf(root.value, activeLeafId.value) ?? leaves.value[0],
  )
  const activeSessionId = computed(() => activeSessionOf(activeLeaf.value))
  const hasAnyChatTab = computed(() => leaves.value.some(leaf => leaf.tabs.length > 0))
  const openSessionIds = computed(() => {
    const ids = new Set<string>()
    for (const leaf of leaves.value) {
      for (const tab of leaf.tabs) ids.add(tab.sessionId)
    }
    return ids
  })

  function leafById(leafId: string | undefined): WorkspaceLeaf | undefined {
    return leafId ? findLeaf(root.value, leafId) : undefined
  }

  function tabsOf(leafId: string): ChatTab[] {
    return leafById(leafId)?.tabs ?? []
  }

  function activeTabIdOf(leafId: string): string {
    return leafById(leafId)?.activeTabId ?? ''
  }

  function activeSessionIdOf(leafId: string): string {
    return activeSessionOf(leafById(leafId))
  }

  // ── persistence ─────────────────────────────────────────────────────────

  let persistTimer: ReturnType<typeof setTimeout> | null = null

  function persist() {
    // Before hydration finishes there is nothing worth writing (and writing
    // would clobber the saved state we are about to restore from).
    if (!hydrated.value || !platformApi?.saveUIState) return
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = null
      // Draft-ness is session-store state (unmaterialized session), so the
      // skip-drafts predicate is injected here rather than inferred from the
      // id — draft ids are ordinary UUIDs.
      const sessionsStore = useSessionsStore()
      platformApi
        .saveUIState({
          workspace: serializeWorkspace(
            root.value,
            activeLeafId.value,
            id => sessionsStore.isNewChatDraftId(id),
          ),
        })
        .catch(() => {})
    }, PERSIST_DEBOUNCE_MS)
  }

  function hydrate(appState: WorkspaceHydrationSource | null | undefined): void {
    if (hydrated.value) return
    const sessionsStore = useSessionsStore()
    if (sessionsStore.isLoading) {
      // Rebuilding needs the session list to validate tab targets; restoring
      // against a half-loaded list would silently drop tabs.
      console.error('[workspace] hydrate called while sessions are still loading; starting empty')
    }
    // Drafts are never persisted and never in the session list, so plain
    // membership covers them.
    const isValidSessionId = (sessionId: string) =>
      sessionsStore.sessions.some(s => s.id === sessionId)

    let result: { root: WorkspaceNode; activeLeafId: string } | null = null
    if (appState?.workspace?.version === 2) {
      result = rebuildWorkspace(appState.workspace, isValidSessionId)
    } else if (appState?.openTabs?.length) {
      result = rebuildFromLegacyTabs(appState.openTabs, appState.activeTabIndex, isValidSessionId)
    }
    if (result && !collectLeaves(result.root).some(leaf => leaf.tabs.length > 0)) result = null
    if (!result && appState?.currentSessionId && isValidSessionId(appState.currentSessionId)) {
      const leaf = createLeaf(MAIN_LEAF_ID, 100, [createChatTab(appState.currentSessionId)])
      result = { root: leaf, activeLeafId: MAIN_LEAF_ID }
    }

    if (result) {
      root.value = result.root
      activeLeafId.value = result.activeLeafId
    }
    hydrated.value = true
  }

  // ── tab mutations ───────────────────────────────────────────────────────

  function setActiveLeaf(leafId: string) {
    if (activeLeafId.value === leafId || !leafById(leafId)) return
    activeLeafId.value = leafId
    persist()
  }

  function activateTab(leafId: string, tabId: string) {
    const leaf = leafById(leafId)
    if (!leaf || !leaf.tabs.some(tab => tab.id === tabId)) return
    const changed = leaf.activeTabId !== tabId || activeLeafId.value !== leafId
    leaf.activeTabId = tabId
    activeLeafId.value = leaf.id
    if (changed) persist()
  }

  /**
   * The single "open this session" entry point: reuse the target leaf's
   * existing tab for the session or append a new one, activate it, and focus
   * the leaf. Idempotent.
   */
  function openSession(sessionId: string, opts?: { leafId?: string }) {
    if (!sessionId) return
    const leaf = leafById(opts?.leafId) ?? activeLeaf.value
    if (!leaf) return
    const existing = leaf.tabs.find(tab => tab.sessionId === sessionId)
    if (existing) {
      if (leaf.activeTabId === existing.id && activeLeafId.value === leaf.id) return
      leaf.activeTabId = existing.id
    } else {
      const tab = createChatTab(sessionId)
      leaf.tabs.push(tab)
      leaf.activeTabId = tab.id
    }
    activeLeafId.value = leaf.id
    persist()
  }

  /** Removes tab `idx` from `leaf`, promoting the right neighbor (or the new last tab) if it was active. */
  function removeTabAt(leaf: WorkspaceLeaf, idx: number) {
    const wasActive = leaf.tabs[idx]?.id === leaf.activeTabId
    leaf.tabs.splice(idx, 1)
    if (wasActive) {
      leaf.activeTabId = leaf.tabs[Math.min(idx, leaf.tabs.length - 1)]?.id ?? ''
    }
  }

  /**
   * True when `tabId` is the only tab of the only leaf, i.e. `closeTab` will
   * refuse it because the workspace must keep something on screen. Callers that
   * own a window can use this to close the window instead.
   */
  function isLastRemainingTab(leafId: string, tabId: string): boolean {
    if (leaves.value.length > 1) return false
    const leaf = leafById(leafId)
    return leaf?.tabs.length === 1 && leaf.tabs[0].id === tabId
  }

  function closeTab(leafId: string, tabId: string): CloseTabResult | undefined {
    const leaf = leafById(leafId)
    if (!leaf) return undefined
    const idx = leaf.tabs.findIndex(tab => tab.id === tabId)
    if (idx === -1) return undefined
    const closedSessionId = leaf.tabs[idx].sessionId

    if (leaf.tabs.length <= 1) {
      // Closing a leaf's last tab closes the leaf itself (mirrors VS Code:
      // closing the last tab in an editor group closes the group) — unless
      // this is the only leaf, which must survive.
      if (leaves.value.length <= 1) return undefined
      const releasedSessionIds = closeLeaf(leafId)?.releasedSessionIds ?? []
      return { closedSessionId, released: releasedSessionIds.includes(closedSessionId) }
    }

    removeTabAt(leaf, idx)
    persist()
    return { closedSessionId, released: !openSessionIds.value.has(closedSessionId) }
  }

  function moveTab(leafId: string, fromId: string, toId: string) {
    const leaf = leafById(leafId)
    if (!leaf) return
    const fromIdx = leaf.tabs.findIndex(tab => tab.id === fromId)
    const toIdx = leaf.tabs.findIndex(tab => tab.id === toId)
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return
    const [moved] = leaf.tabs.splice(fromIdx, 1)
    leaf.tabs.splice(toIdx, 0, moved)
    persist()
  }

  /**
   * Removes every tab of `sessionId` (optionally only within `onlyLeafId`),
   * closing leaves that end up empty. Called when a session is deleted,
   * archived, or moved to another panel.
   */
  function closeSessionTabs(sessionId: string, opts?: { onlyLeafId?: string }) {
    let changed = false
    const emptiedLeafIds: string[] = []
    for (const leaf of leaves.value) {
      if (opts?.onlyLeafId && leaf.id !== opts.onlyLeafId) continue
      for (let idx = leaf.tabs.length - 1; idx >= 0; idx--) {
        if (leaf.tabs[idx].sessionId !== sessionId) continue
        removeTabAt(leaf, idx)
        changed = true
      }
      if (leaf.tabs.length === 0) emptiedLeafIds.push(leaf.id)
    }
    for (const leafId of emptiedLeafIds) {
      if (leaves.value.length > 1) {
        const result = closeLeafInTree(root.value, leafId, activeLeafId.value)
        root.value = result.root
        activeLeafId.value = result.activeLeafId
      }
      // The sole remaining leaf may stay empty: that's the empty-workspace
      // state (activeSessionId '' → the app shows the New Chat empty state).
    }
    if (changed) persist()
  }

  // ── panel mutations ─────────────────────────────────────────────────────

  function splitLeaf(leafId: string, sessionId: string, direction: SplitDirection): string | undefined {
    const result = splitLeafInTree(root.value, leafId, sessionId, direction)
    if (!result) return undefined
    root.value = result.root
    activeLeafId.value = result.newLeafId
    persist()
    return result.newLeafId
  }

  function closeLeaf(leafId: string): CloseLeafResult | undefined {
    const leaf = leafById(leafId)
    if (!leaf || leaves.value.length <= 1) return undefined
    const closedSessionIds = leaf.tabs.map(tab => tab.sessionId)
    const result = closeLeafInTree(root.value, leafId, activeLeafId.value)
    root.value = result.root
    activeLeafId.value = result.activeLeafId
    persist()
    return {
      releasedSessionIds: closedSessionIds.filter(id => !openSessionIds.value.has(id)),
    }
  }

  function equalizeSiblings(leafId: string) {
    equalizeSiblingsInTree(root.value, leafId)
    persist()
  }

  // ── the one effect ──────────────────────────────────────────────────────

  // Single follower of the workspace's active session: every mutation that
  // changes which session the focused panel shows funnels through here into
  // session activation/data loading. Guarded until hydration so store setup
  // and tests don't trigger spurious switches.
  watch(activeSessionId, (sessionId) => {
    if (!hydrated.value) return
    const sessionsStore = useSessionsStore()
    if (sessionId) {
      void sessionsStore.switchSession(sessionId)
    } else {
      sessionsStore.clearCurrentSession()
    }
  })

  return {
    root,
    activeLeafId,
    hydrated,
    leaves,
    activeLeaf,
    activeSessionId,
    hasAnyChatTab,
    openSessionIds,
    leafById,
    tabsOf,
    activeTabIdOf,
    activeSessionIdOf,
    hydrate,
    setActiveLeaf,
    activateTab,
    openSession,
    isLastRemainingTab,
    closeTab,
    moveTab,
    closeSessionTabs,
    splitLeaf,
    closeLeaf,
    equalizeSiblings,
  }
})
