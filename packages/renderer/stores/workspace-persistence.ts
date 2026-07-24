/**
 * Persisted (v2) wire format for the chat workspace, plus the pure
 * serialize/rebuild functions between it and the runtime tree.
 *
 * v2 persists the whole split tree (layout + per-leaf tabs + active tab),
 * replacing the v1 flat `openTabs`/`activeTabIndex` pair, which was written
 * concurrently by every split panel (last-writer-wins) and serialized draft
 * tabs as `sessionId: ''`. v1 stays readable for migration; it is no longer
 * written.
 *
 * Serialization rules:
 * - chat tabs persist as bare session ids; drafts (unmaterialized sessions —
 *   a state, not an id format; the caller passes the predicate) are skipped,
 * - runtime tab/leaf ids for new nodes are regenerated on rebuild; persisted
 *   leaf ids are kept so `activeLeafId` stays resolvable,
 * - rebuild validates every session id against the loaded session list
 *   (which never contains drafts), dedupes within a leaf, drops empty
 *   leaves, and collapses degenerate splits.
 */
import type { SplitterLayout } from '@/components/common/splitter'
import {
  createChatTab,
  createLeaf,
  firstLeafId,
  findLeaf,
  genWorkspaceId,
  MAIN_LEAF_ID,
  type WorkspaceLeaf,
  type WorkspaceNode,
} from './workspace-tree'

export interface PersistedWorkspaceLeaf {
  type: 'leaf'
  id: string
  size: number
  sessions: string[]
  activeIndex: number
}

export interface PersistedWorkspaceSplit {
  type: 'split'
  id: string
  orientation: SplitterLayout
  size: number
  children: PersistedWorkspaceNode[]
}

export type PersistedWorkspaceNode = PersistedWorkspaceLeaf | PersistedWorkspaceSplit

export interface PersistedWorkspace {
  version: 2
  activeLeafId: string
  root: PersistedWorkspaceNode
}

/** v1 flat shape, read-only for migration. */
export interface LegacyPersistedTab {
  type: string
  sessionId?: string
}

// ── serialize ─────────────────────────────────────────────────────────────

function serializeNode(
  node: WorkspaceNode,
  isDraftSessionId: (sessionId: string) => boolean,
): PersistedWorkspaceNode {
  if (node.type === 'leaf') {
    const persistable = node.tabs.filter(tab => !isDraftSessionId(tab.sessionId))
    const activeIndex = persistable.findIndex(tab => tab.id === node.activeTabId)
    return {
      type: 'leaf',
      id: node.id,
      size: node.size,
      sessions: persistable.map(tab => tab.sessionId),
      activeIndex: activeIndex >= 0 ? activeIndex : Math.max(0, persistable.length - 1),
    }
  }
  return {
    type: 'split',
    id: node.id,
    orientation: node.orientation,
    size: node.size,
    children: node.children.map(child => serializeNode(child, isDraftSessionId)),
  }
}

export function serializeWorkspace(
  root: WorkspaceNode,
  activeLeafId: string,
  isDraftSessionId: (sessionId: string) => boolean,
): PersistedWorkspace {
  return {
    version: 2,
    activeLeafId,
    root: serializeNode(root, isDraftSessionId),
  }
}

// ── rebuild ───────────────────────────────────────────────────────────────

export interface RebuildResult {
  root: WorkspaceNode
  activeLeafId: string
}

function buildLeaf(
  persisted: PersistedWorkspaceLeaf,
  isValidSessionId: (sessionId: string) => boolean,
): WorkspaceLeaf | null {
  const seen = new Set<string>()
  const sessions = persisted.sessions.filter((sessionId) => {
    if (!sessionId || !isValidSessionId(sessionId) || seen.has(sessionId)) return false
    seen.add(sessionId)
    return true
  })
  if (sessions.length === 0) return null

  const leaf = createLeaf(
    persisted.id || genWorkspaceId('panel'),
    Number.isFinite(persisted.size) && persisted.size > 0 ? persisted.size : 50,
    sessions.map(createChatTab),
  )
  const activeIndex = Number.isInteger(persisted.activeIndex)
    ? Math.min(Math.max(persisted.activeIndex, 0), sessions.length - 1)
    : sessions.length - 1
  leaf.activeTabId = leaf.tabs[activeIndex].id
  return leaf
}

function buildNode(
  persisted: PersistedWorkspaceNode,
  isValidSessionId: (sessionId: string) => boolean,
): WorkspaceNode | null {
  if (persisted.type === 'leaf') return buildLeaf(persisted, isValidSessionId)
  if (persisted.type !== 'split' || !Array.isArray(persisted.children)) return null

  const children = persisted.children
    .map(child => buildNode(child, isValidSessionId))
    .filter((child): child is WorkspaceNode => child !== null)
  if (children.length === 0) return null
  if (children.length === 1) {
    children[0].size = Number.isFinite(persisted.size) && persisted.size > 0 ? persisted.size : children[0].size
    return children[0]
  }
  return {
    type: 'split',
    id: persisted.id || genWorkspaceId('split'),
    orientation: persisted.orientation === 'vertical' ? 'vertical' : 'horizontal',
    size: Number.isFinite(persisted.size) && persisted.size > 0 ? persisted.size : 100,
    children,
  }
}

export function rebuildWorkspace(
  persisted: PersistedWorkspace,
  isValidSessionId: (sessionId: string) => boolean,
): RebuildResult {
  const root = persisted.root ? buildNode(persisted.root, isValidSessionId) : null
  if (!root) {
    return { root: createLeaf(MAIN_LEAF_ID, 100), activeLeafId: MAIN_LEAF_ID }
  }
  const activeLeafId = persisted.activeLeafId && findLeaf(root, persisted.activeLeafId)
    ? persisted.activeLeafId
    : firstLeafId(root)
  return { root, activeLeafId }
}

/** v1 migration: flat `openTabs` + `activeTabIndex` → single-leaf tree. */
export function rebuildFromLegacyTabs(
  openTabs: LegacyPersistedTab[],
  activeTabIndex: number | undefined,
  isValidSessionId: (sessionId: string) => boolean,
): RebuildResult {
  const seen = new Set<string>()
  const sessions = openTabs
    .filter(tab => tab.type === 'chat')
    .map(tab => tab.sessionId ?? '')
    .filter((sessionId) => {
      if (!sessionId || !isValidSessionId(sessionId) || seen.has(sessionId)) return false
      seen.add(sessionId)
      return true
    })

  const leaf = createLeaf(MAIN_LEAF_ID, 100, sessions.map(createChatTab))
  if (leaf.tabs.length > 0) {
    const index = Number.isInteger(activeTabIndex)
      ? Math.min(Math.max(activeTabIndex as number, 0), leaf.tabs.length - 1)
      : 0
    leaf.activeTabId = leaf.tabs[index].id
  }
  return { root: leaf, activeLeafId: MAIN_LEAF_ID }
}
