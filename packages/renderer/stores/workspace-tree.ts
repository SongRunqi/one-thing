/**
 * Pure tree operations for the chat workspace: nested split panels whose
 * leaves each hold an ordered list of chat tabs.
 *
 * Ported from composables/usePanelLayout.ts (tree shape) and
 * composables/useTabs.ts (tab semantics), with one structural change: a leaf
 * no longer holds a single `sessionId` — it holds `tabs` + `activeTabId`,
 * and "the session this panel shows" is derived from the active tab.
 *
 * All functions are side-effect free with respect to module state (aside from
 * the id counter) and operate on plain objects so the store can keep them in
 * a single reactive tree. Functions that may replace the root node return the
 * new root; callers must assign it back.
 */
import type { ChatTab } from '@/types/tabs'
import type { SplitterLayout } from '@/components/common/splitter'

export type SplitDirection = 'left' | 'right' | 'top' | 'bottom'

export interface WorkspaceLeaf {
  type: 'leaf'
  id: string
  size: number
  tabs: ChatTab[]
  activeTabId: string
}

export interface WorkspaceSplit {
  type: 'split'
  id: string
  orientation: SplitterLayout
  size: number
  children: WorkspaceNode[]
}

export type WorkspaceNode = WorkspaceLeaf | WorkspaceSplit

export interface FoundNode {
  node: WorkspaceNode
  parent: WorkspaceSplit | null
  index: number
}

export const MAIN_LEAF_ID = 'main'

let nextId = 0

export function genWorkspaceId(prefix: string): string {
  return `${prefix}-${Date.now()}-${++nextId}`
}

export function createChatTab(sessionId: string): ChatTab {
  return { id: genWorkspaceId('tab'), type: 'chat', sessionId }
}

export function createLeaf(id: string, size: number, tabs: ChatTab[] = []): WorkspaceLeaf {
  return {
    type: 'leaf',
    id,
    size,
    tabs,
    activeTabId: tabs[tabs.length - 1]?.id ?? '',
  }
}

function directionToOrientation(direction: SplitDirection): SplitterLayout {
  return direction === 'left' || direction === 'right' ? 'horizontal' : 'vertical'
}

function isBeforeDirection(direction: SplitDirection): boolean {
  return direction === 'left' || direction === 'top'
}

function walk(node: WorkspaceNode, id: string, parent: WorkspaceSplit | null, index: number): FoundNode | undefined {
  if (node.id === id) return { node, parent, index }
  if (node.type !== 'split') return undefined
  for (let i = 0; i < node.children.length; i++) {
    const found = walk(node.children[i], id, node, i)
    if (found) return found
  }
  return undefined
}

export function findNode(root: WorkspaceNode, id: string): FoundNode | undefined {
  return walk(root, id, null, -1)
}

export function findLeaf(root: WorkspaceNode, id: string): WorkspaceLeaf | undefined {
  const found = findNode(root, id)
  return found?.node.type === 'leaf' ? found.node : undefined
}

export function collectLeaves(root: WorkspaceNode, acc: WorkspaceLeaf[] = []): WorkspaceLeaf[] {
  if (root.type === 'leaf') {
    acc.push(root)
    return acc
  }
  root.children.forEach(child => collectLeaves(child, acc))
  return acc
}

export function firstLeafId(node: WorkspaceNode): string {
  return node.type === 'leaf' ? node.id : firstLeafId(node.children[0])
}

export function activeTabOf(leaf: WorkspaceLeaf): ChatTab | undefined {
  return leaf.tabs.find(tab => tab.id === leaf.activeTabId)
}

export function activeSessionOf(leaf: WorkspaceLeaf | undefined): string {
  if (!leaf) return ''
  return activeTabOf(leaf)?.sessionId ?? ''
}

export interface SplitLeafResult {
  root: WorkspaceNode
  newLeafId: string
}

/**
 * Splits `leafId` in `direction`, moving `sessionId` into a new sibling leaf.
 * Returns undefined if `leafId` doesn't resolve to a leaf.
 */
export function splitLeaf(
  root: WorkspaceNode,
  leafId: string,
  sessionId: string,
  direction: SplitDirection,
): SplitLeafResult | undefined {
  const found = findNode(root, leafId)
  if (!found || found.node.type !== 'leaf') return undefined

  const leaf = found.node
  const orientation = directionToOrientation(direction)
  const insertBefore = isBeforeDirection(direction)
  const tab = createChatTab(sessionId)

  if (found.parent && found.parent.orientation === orientation) {
    const parent = found.parent
    const halfSize = leaf.size / 2
    const newLeaf = createLeaf(genWorkspaceId('panel'), halfSize, [tab])
    leaf.size = halfSize
    const insertIndex = insertBefore ? found.index : found.index + 1
    parent.children.splice(insertIndex, 0, newLeaf)
    return { root, newLeafId: newLeaf.id }
  }

  // New leaves always mount at their real final size (never 0-then-grow):
  // SplitterPanel enforces a minimum size, so a leaf starting at 0 gets
  // clamped up on its very first mount-time sync and can race with any
  // later attempt to correct it back to a 50/50 split.
  const newLeaf = createLeaf(genWorkspaceId('panel'), 50, [tab])
  const wrapped: WorkspaceSplit = {
    type: 'split',
    id: genWorkspaceId('split'),
    orientation,
    size: leaf.size,
    children: insertBefore ? [newLeaf, leaf] : [leaf, newLeaf],
  }
  leaf.size = 50
  if (found.parent) {
    found.parent.children[found.index] = wrapped
    return { root, newLeafId: newLeaf.id }
  }
  return { root: wrapped, newLeafId: newLeaf.id }
}

export interface CloseLeafResult {
  root: WorkspaceNode
  activeLeafId: string
}

/** Removes `leafId`. No-op if it's the only remaining leaf. */
export function closeLeaf(root: WorkspaceNode, leafId: string, activeLeafId: string): CloseLeafResult {
  if (collectLeaves(root).length <= 1) return { root, activeLeafId }
  const found = findNode(root, leafId)
  if (!found || found.node.type !== 'leaf' || !found.parent) return { root, activeLeafId }

  const parent = found.parent
  const idx = found.index
  const removedSize = parent.children[idx].size
  const targetIndex = idx === 0 ? 1 : idx - 1
  parent.children[targetIndex].size += removedSize
  parent.children.splice(idx, 1)

  let nextActive = parent.children[Math.min(targetIndex, parent.children.length - 1)]
  let nextRoot = root

  if (parent.children.length === 1) {
    const sole = parent.children[0]
    sole.size = parent.size
    nextActive = sole
    const grandparent = findNode(root, parent.id)
    if (grandparent?.parent) {
      grandparent.parent.children[grandparent.index] = sole
    } else {
      nextRoot = sole
    }
  }

  return {
    root: nextRoot,
    activeLeafId: activeLeafId === leafId ? firstLeafId(nextActive) : activeLeafId,
  }
}

/** Resets sizes to equal shares within `leafId`'s immediate split group. No-op at the root (nothing to equalize). */
export function equalizeSiblings(root: WorkspaceNode, leafId: string): void {
  const found = findNode(root, leafId)
  if (!found?.parent) return
  const equalSize = 100 / found.parent.children.length
  found.parent.children.forEach(child => { child.size = equalSize })
}
