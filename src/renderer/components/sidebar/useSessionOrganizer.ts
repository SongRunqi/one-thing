/**
 * Session Organizer Composable
 *
 * 管理会话的层级组织、折叠状态、时间格式化等逻辑
 */

import { ref, computed, watch, nextTick } from 'vue'
import type { ChatSession } from '@/types'
import { useSessionsStore } from '@/stores/sessions'

// Extended session interface with branch information
export interface SessionWithBranches extends ChatSession {
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
  function isAncestorCollapsed(session: ChatSession): boolean {
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
  function getBranchDepth(session: ChatSession): number {
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
  function organizeSessionsWithBranches(sessions: ChatSession[]): SessionWithBranches[] {
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
          const nextAncestors = [...ancestorsLast, isLast]
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
  function getFlatSessions(filteredSessions: ChatSession[]): SessionWithBranches[] {
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

  // Format session time for display
  function formatSessionTime(timestamp: number): string {
    const now = Date.now()
    const diff = now - timestamp
    const date = new Date(timestamp)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    // Less than 1 minute
    if (diff < 60000) return 'now'

    // Less than 1 hour
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`

    // Today - show time
    if (timestamp >= today.getTime()) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    }

    // Yesterday
    if (timestamp >= yesterday.getTime()) {
      return 'Yesterday'
    }

    // Within a week
    if (diff < 7 * 24 * 3600000) {
      return date.toLocaleDateString('en-US', { weekday: 'short' })
    }

    // Older - show date
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Get session preview text
  function getSessionPreview(session: ChatSession): string {
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
    formatSessionTime,
    getSessionPreview,
    formatModelName,
  }
}

export type SessionOrganizerReturn = ReturnType<typeof useSessionOrganizer>
