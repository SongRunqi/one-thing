/**
 * Pure tree operations for the chat workspace: nested split panels whose
 * leaves each hold exactly one session.
 *
 * 形状史:leaf 一开始就是单个 `sessionId`,中途改成 `tabs[] + activeTabId`
 * (一格叠多会话),2026-08-05 的 U2 又改了回来 —— 多页签整套退役,见
 * docs/design/product-two-forms-chatgpt-shell.md D4。**分栏保留**:取消的是
 * 「一格叠多条」,不是「屏幕上只能一格」。
 *
 * All functions are side-effect free with respect to module state (aside from
 * the id counter) and operate on plain objects so the store can keep them in
 * a single reactive tree. Functions that may replace the root node return the
 * new root; callers must assign it back.
 */
import type { SplitterLayout } from '@/components/common/splitter'

export type SplitDirection = 'left' | 'right' | 'top' | 'bottom'

export interface WorkspaceLeaf {
  type: 'leaf'
  id: string
  size: number
  /** 这一格里坐着的那条会话。'' = 空格子(只有空工作区那唯一一格才合法)。 */
  sessionId: string
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

export function createLeaf(id: string, size: number, sessionId = ''): WorkspaceLeaf {
  return { type: 'leaf', id, size, sessionId }
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

export function activeSessionOf(leaf: WorkspaceLeaf | undefined): string {
  return leaf?.sessionId ?? ''
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

  if (found.parent && found.parent.orientation === orientation) {
    const parent = found.parent
    const halfSize = leaf.size / 2
    const newLeaf = createLeaf(genWorkspaceId('panel'), halfSize, sessionId)
    leaf.size = halfSize
    const insertIndex = insertBefore ? found.index : found.index + 1
    parent.children.splice(insertIndex, 0, newLeaf)
    return { root, newLeafId: newLeaf.id }
  }

  // New leaves always mount at their real final size (never 0-then-grow):
  // SplitterPanel enforces a minimum size, so a leaf starting at 0 gets
  // clamped up on its very first mount-time sync and can race with any
  // later attempt to correct it back to a 50/50 split.
  const newLeaf = createLeaf(genWorkspaceId('panel'), 50, sessionId)
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
