/**
 * Session Organizer Composable
 *
 * Manages hierarchical organization, collapse state, time formatting, etc. for sessions
 */

import { ref, watch } from 'vue'
import type { ChatSession, SessionMeta } from '@/types'
import { useSessionsStore } from '@/stores/sessions'

// Base session type for organizer - compatible with both metadata-only and full sessions
// This allows the organizer to work with metadata loaded on startup (no messages)
type SessionBase = SessionMeta & Partial<Pick<ChatSession, 'messages' | 'workingDirectory' | 'summary'>> & {
  kind?: 'new-chat-draft'
}

// Extended session interface with branch information
export interface SessionWithBranches extends SessionBase {
  branches: SessionWithBranches[]
  depth: number
  hasBranches: boolean
  isCollapsed: boolean
  isLastChild: boolean
  branchCount: number
  isHidden: boolean
  lastBranchUpdate: number
  ancestorsLastChild: boolean[]
}

// A temporal (or pinned) section of the session list
export interface SessionGroup {
  key: string
  label: string
  sessions: SessionWithBranches[]
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const DAY_MS = 86_400_000

function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/**
 * Relative timestamp for a session row (supporting text).
 * 刚刚 → 14:20 (today) → 昨天 → 周二 (within 7 days) → 4月12日 (older)
 */
export function formatRelativeTime(ts: number): string {
  if (!ts) return ''
  const now = Date.now()
  const date = new Date(ts)

  if (now - ts < 60_000) return '刚刚'

  const todayStart = startOfToday()
  if (ts >= todayStart) {
    const h = String(date.getHours()).padStart(2, '0')
    const m = String(date.getMinutes()).padStart(2, '0')
    return `${h}:${m}`
  }
  if (ts >= todayStart - DAY_MS) return '昨天'
  if (ts >= todayStart - 6 * DAY_MS) return WEEKDAYS[date.getDay()]
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

// Bucket a root session's activity time into a temporal group key
function temporalKey(ts: number): 'today' | 'yesterday' | 'week' | 'older' {
  const todayStart = startOfToday()
  if (ts >= todayStart) return 'today'
  if (ts >= todayStart - DAY_MS) return 'yesterday'
  if (ts >= todayStart - 6 * DAY_MS) return 'week'
  return 'older'
}

function isNewChatDraft(session: SessionBase): boolean {
  return session.kind === 'new-chat-draft'
}

export function useSessionOrganizer() {
  const sessionsStore = useSessionsStore()

  // Collapsed parent sessions state (stores parent session IDs that are collapsed)
  const collapsedParents = ref<Set<string>>(new Set())

  // Track if initial collapse has been done
  const initialCollapseApplied = ref(false)

  // Check if a session has branches
  function hasBranches(sessionId: string): boolean {
    return sessionsStore.sessions.some(s => s.parentSessionId === sessionId)
  }

  // Get all ancestor IDs for a session
  function getAncestorIds(sessionId: string): string[] {
    const ancestors: string[] = []
    const session = sessionsStore.sessions.find(s => s.id === sessionId)
    if (!session) return ancestors

    let current = session
    while (current.parentSessionId) {
      ancestors.push(current.parentSessionId)
      const parent = sessionsStore.sessions.find(s => s.id === current.parentSessionId)
      if (!parent) break
      current = parent
    }
    return ancestors
  }

  // Initialize collapsed state - collapse all parent sessions on startup
  // But keep ancestors of the current session expanded
  function initializeCollapsedState() {
    if (initialCollapseApplied.value) return

    // Get ancestors of the current session (these should stay expanded)
    const currentSessionAncestors = new Set(getAncestorIds(sessionsStore.currentSessionId))

    const parentsWithBranches = sessionsStore.sessions
      .filter(s => !s.parentSessionId) // Root sessions only
      .filter(s => hasBranches(s.id))
      .filter(s => !currentSessionAncestors.has(s.id)) // Don't collapse ancestors of current session
      .map(s => s.id)

    if (parentsWithBranches.length > 0) {
      collapsedParents.value = new Set(parentsWithBranches)
    }
    initialCollapseApplied.value = true
  }

  // Watch for sessions to be loaded and apply initial collapse
  watch(
    () => sessionsStore.sessions.length,
    (newLength) => {
      if (newLength > 0 && !initialCollapseApplied.value) {
        initializeCollapsedState()
      }
    },
    { immediate: true }
  )

  // Watch for current session changes - expand ancestors when switching to a branch
  watch(
    () => sessionsStore.currentSessionId,
    (newSessionId) => {
      if (!newSessionId) return

      // Get ancestors of the new current session
      const ancestors = getAncestorIds(newSessionId)

      // Expand any collapsed ancestors
      let changed = false
      for (const ancestorId of ancestors) {
        if (collapsedParents.value.has(ancestorId)) {
          collapsedParents.value.delete(ancestorId)
          changed = true
        }
      }

      // Trigger reactivity if we made changes
      if (changed) {
        collapsedParents.value = new Set(collapsedParents.value)
      }
    }
  )

  // Toggle collapse state for a parent session
  function toggleCollapse(sessionId: string) {
    if (collapsedParents.value.has(sessionId)) {
      collapsedParents.value.delete(sessionId)
    } else {
      collapsedParents.value.add(sessionId)
    }
    // Trigger reactivity
    collapsedParents.value = new Set(collapsedParents.value)
  }

  // Check if a session is collapsed
  function isCollapsed(sessionId: string): boolean {
    return collapsedParents.value.has(sessionId)
  }

  // Check if any ancestor of a session is collapsed
  function isAncestorCollapsed(session: SessionBase): boolean {
    let current = session
    while (current.parentSessionId) {
      if (collapsedParents.value.has(current.parentSessionId)) {
        return true
      }
      const parent = sessionsStore.sessions.find(s => s.id === current.parentSessionId)
      if (!parent) break
      current = parent
    }
    return false
  }

  // Get branch depth (how deep the branch is)
  function getBranchDepth(session: SessionBase): number {
    let depth = 0
    let current = session
    while (current.parentSessionId) {
      depth++
      const parent = sessionsStore.sessions.find(s => s.id === current.parentSessionId)
      if (!parent) break
      current = parent
    }
    return depth
  }

  // Organize sessions with their branches into a hierarchical structure
  function organizeSessionsWithBranches(sessions: SessionBase[]): SessionWithBranches[] {
    const sessionMap = new Map<string, SessionWithBranches>()
    const rootSessions: SessionWithBranches[] = []

    // First pass: create SessionWithBranches objects
    for (const session of sessions) {
      sessionMap.set(session.id, {
        ...session,
        branches: [],
        depth: 0,
        hasBranches: false,
        isCollapsed: collapsedParents.value.has(session.id),
        isLastChild: false,
        branchCount: 0,
        isHidden: false,
        lastBranchUpdate: session.updatedAt,
        ancestorsLastChild: []
      })
    }

    // Second pass: organize into hierarchy
    for (const session of sessions) {
      const withBranches = sessionMap.get(session.id)!
      if (session.parentSessionId) {
        const parent = sessionMap.get(session.parentSessionId)
        if (parent) {
          withBranches.depth = getBranchDepth(session)
          parent.branches.push(withBranches)
          parent.hasBranches = true

          // Propagate branch update time to ancestors
          let current: SessionWithBranches | undefined = parent
          while (current) {
            if (withBranches.updatedAt > current.lastBranchUpdate) {
              current.lastBranchUpdate = withBranches.updatedAt
            }
            current = current.parentSessionId ? sessionMap.get(current.parentSessionId) : undefined
          }
        } else {
          rootSessions.push(withBranches)
        }
      } else {
        rootSessions.push(withBranches)
      }
    }

    // Third pass: mark last children and count branches
    function markLastChildren(sessions: SessionWithBranches[]) {
      for (const session of sessions) {
        session.branchCount = session.branches.length
        if (session.branches.length > 0) {
          session.branches[session.branches.length - 1].isLastChild = true
          markLastChildren(session.branches)
        }
      }
    }
    markLastChildren(rootSessions)

    // Flatten hierarchy for display
    // Always include all sessions, but mark hidden ones with isHidden flag
    // This keeps DOM stable for proper mouse event handling
    function flattenWithBranches(
      sessions: SessionWithBranches[],
      parentCollapsed: boolean = false,
      ancestorsLast: boolean[] = []
    ): SessionWithBranches[] {
      const result: SessionWithBranches[] = []

      // Sort branches by updatedAt descending within their parent
      // const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)
      const sorted = sessions // 不排序，保持原始顺序

      for (let i = 0; i < sorted.length; i++) {
        const session = sorted[i]
        const isLast = (i === sorted.length - 1)
        session.isLastChild = isLast
        session.isHidden = parentCollapsed
        session.ancestorsLastChild = [...ancestorsLast]
        session.branchCount = session.branches.length

        result.push(session)

        if (session.branches.length > 0) {
          const shouldHideChildren = parentCollapsed || session.isCollapsed
          // 修复：根 session (depth=0) 不传递 isLast，因为根 session 上面没有需要画线的层级
          const nextAncestors = session.depth > 0
            ? [...ancestorsLast, isLast]
            : []
          result.push(...flattenWithBranches(session.branches, shouldHideChildren, nextAncestors))
        }
      }
      return result
    }

    // Pre-sort root sessions by their branch activity so they arrive correctly at groupedSessions
    // rootSessions.sort((a, b) => b.lastBranchUpdate - a.lastBranchUpdate)

    return flattenWithBranches(rootSessions)
  }

  // Get flat sessions list: pinned first, then by updatedAt (no date grouping)
  function getFlatSessions(filteredSessions: SessionBase[]): SessionWithBranches[] {
    const organizedSessions = organizeSessionsWithBranches(filteredSessions)

    // Separate pinned and unpinned sessions
    const pinned: SessionWithBranches[] = []
    const unpinned: SessionWithBranches[] = []

    for (const session of organizedSessions) {
      // Find root to check if pinned
      let root = session
      while (root.parentSessionId) {
        const parent = organizedSessions.find(s => s.id === root.parentSessionId)
        if (!parent) break
        root = parent
      }

      if (root.isPinned) {
        pinned.push(session)
      } else {
        unpinned.push(session)
      }
    }

    // Return pinned first, then unpinned (both already sorted by updatedAt in organizeSessionsWithBranches)
    return [...pinned, ...unpinned]
  }

  // Group sessions into temporal sections (置顶 / 今天 / 昨天 / 过去7天 / 更早).
  // Each root session keeps its branch subtree together inside its section.
  function getGroupedSessions(filteredSessions: SessionBase[]): SessionGroup[] {
    const organized = organizeSessionsWithBranches(filteredSessions)

    // Chunk the flattened list into per-root blocks (root + its descendant rows)
    type Block = { root: SessionWithBranches; rows: SessionWithBranches[] }
    const blocks: Block[] = []
    for (const session of organized) {
      if (session.depth === 0) {
        blocks.push({ root: session, rows: [session] })
      } else {
        blocks[blocks.length - 1]?.rows.push(session)
      }
    }

    const buckets: Record<string, Block[]> = {
      pinned: [], today: [], yesterday: [], week: [], older: [],
    }
    const draftBlocks: Block[] = []
    for (const block of blocks) {
      if (isNewChatDraft(block.root)) {
        draftBlocks.push(block)
        continue
      }
      const key = block.root.isPinned ? 'pinned' : temporalKey(block.root.lastBranchUpdate)
      buckets[key].push(block)
    }

    // Most recent activity first within each section
    for (const key of Object.keys(buckets)) {
      buckets[key].sort((a, b) => b.root.lastBranchUpdate - a.root.lastBranchUpdate)
    }

    const order: { key: string; label: string }[] = [
      { key: 'pinned', label: '置顶' },
      { key: 'today', label: '今天' },
      { key: 'yesterday', label: '昨天' },
      { key: 'week', label: '过去 7 天' },
      { key: 'older', label: '更早' },
    ]

    const groups: SessionGroup[] = []
    for (const { key, label } of order) {
      const sectionBlocks = buckets[key]
      if (sectionBlocks.length === 0) continue
      groups.push({ key, label, sessions: sectionBlocks.flatMap(b => b.rows) })
    }

    if (draftBlocks.length > 0) {
      draftBlocks.sort((a, b) => b.root.lastBranchUpdate - a.root.lastBranchUpdate)
      const draftRows = draftBlocks.flatMap(b => b.rows)
      const todayIndex = groups.findIndex(group => group.key === 'today')
      if (todayIndex >= 0) {
        const todayGroup = groups[todayIndex]
        todayGroup.sessions = [...draftRows, ...todayGroup.sessions]
      } else {
        const pinnedIndex = groups.findIndex(group => group.key === 'pinned')
        const insertIndex = pinnedIndex >= 0 ? pinnedIndex + 1 : 0
        groups.splice(insertIndex, 0, { key: 'today', label: '今天', sessions: draftRows })
      }
    }

    return groups
  }

  // Get session preview text
  function getSessionPreview(session: SessionBase): string {
    if (!session.messages || session.messages.length === 0) {
      return 'No messages yet'
    }
    const lastMessage = session.messages[session.messages.length - 1]
    const preview = lastMessage.content.slice(0, 50)
    return preview.length < lastMessage.content.length ? preview + '...' : preview
  }

  // Format model ID for display (e.g. gpt-4o-2024-05-13 -> GPT-4o)
  function formatModelName(modelId?: string): string {
    if (!modelId) return ''

    // Custom mapping for common models
    const lower = modelId.toLowerCase()
    if (lower.includes('gpt-4o')) return 'GPT-4o'
    if (lower.includes('gpt-4-turbo')) return 'GPT-4T'
    if (lower.includes('gpt-4')) return 'GPT-4'
    if (lower.includes('gpt-3.5')) return 'GPT-3.5'
    if (lower.includes('claude-3-5-sonnet')) return 'Sonnet 3.5'
    if (lower.includes('claude-3-5')) return 'Claude 3.5'
    if (lower.includes('claude-3')) return 'Claude 3'
    if (lower.includes('deepseek-reasoner')) return 'DS Reasoner'
    if (lower.includes('deepseek-chat')) return 'DS Chat'
    if (lower.includes('deepseek')) return 'DeepSeek'
    if (lower.includes('gemini')) return 'Gemini'

    // Generic fallback: remove version dates and capitalize
    return modelId
      .replace(/-\d{4}-\d{2}-\d{2}$/, '')
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  return {
    // State
    collapsedParents,

    // Methods
    toggleCollapse,
    isCollapsed,
    isAncestorCollapsed,
    hasBranches,
    getAncestorIds,
    getBranchDepth,
    organizeSessionsWithBranches,
    getFlatSessions,
    getGroupedSessions,
    getSessionPreview,
    formatModelName,
  }
}

export type SessionOrganizerReturn = ReturnType<typeof useSessionOrganizer>
