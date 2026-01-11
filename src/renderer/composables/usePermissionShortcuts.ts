/**
 * Permission Shortcuts Composable
 *
 * Handles keyboard shortcuts for permission confirmation:
 * - Enter: Allow once (本次)
 * - S: Allow for session (本会话)
 * - W: Allow for workspace (本工作区) - permanent
 * - D / Escape: Reject
 *
 * Based on OpenCode's permission interaction design.
 */

import { onMounted, onUnmounted } from 'vue'

export interface PermissionShortcutHandlers {
  onAllowOnce: () => void
  /** Allow for the duration of this session */
  onAllowSession: () => void
  /** Allow permanently in this workspace */
  onAllowWorkspace: () => void
  onReject: () => void
}

/** Legacy handlers for backwards compatibility */
export interface LegacyPermissionShortcutHandlers {
  onAllowOnce: () => void
  onAllowAlways: () => void
  onReject: () => void
}

/**
 * Setup keyboard shortcuts for permission confirmation
 *
 * @param hasPendingPermission - Function that returns true if there's a pending permission
 * @param handlers - Callback handlers for each action
 */
export function usePermissionShortcuts(
  hasPendingPermission: () => boolean,
  handlers: PermissionShortcutHandlers | LegacyPermissionShortcutHandlers
) {
  // Normalize handlers: support both new and legacy format
  const normalizedHandlers: PermissionShortcutHandlers = {
    onAllowOnce: handlers.onAllowOnce,
    // Map legacy onAllowAlways to new onAllowSession
    onAllowSession: 'onAllowSession' in handlers
      ? handlers.onAllowSession
      : (handlers as LegacyPermissionShortcutHandlers).onAllowAlways,
    // New workspace handler (fallback to session if not provided)
    onAllowWorkspace: 'onAllowWorkspace' in handlers
      ? handlers.onAllowWorkspace
      : ('onAllowSession' in handlers
        ? handlers.onAllowSession
        : (handlers as LegacyPermissionShortcutHandlers).onAllowAlways),
    onReject: handlers.onReject,
  }

  function handleKeydown(event: KeyboardEvent) {
    // Only handle when there's a pending permission
    if (!hasPendingPermission()) return

    // Skip if user is typing in an input field
    const target = event.target as HTMLElement
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return
    }

    // Skip if modifier keys are pressed (except for Escape)
    if ((event.ctrlKey || event.metaKey || event.altKey) && event.key !== 'Escape') {
      return
    }

    switch (event.key) {
      case 'Enter':
        event.preventDefault()
        event.stopPropagation()
        normalizedHandlers.onAllowOnce()
        break

      // S = Session (allow for this session)
      case 's':
      case 'S':
        event.preventDefault()
        event.stopPropagation()
        normalizedHandlers.onAllowSession()
        break

      // W = Workspace (allow permanently in this workspace)
      case 'w':
      case 'W':
        event.preventDefault()
        event.stopPropagation()
        normalizedHandlers.onAllowWorkspace()
        break

      // A = legacy alias for Session (backwards compatibility)
      case 'a':
      case 'A':
        event.preventDefault()
        event.stopPropagation()
        normalizedHandlers.onAllowSession()
        break

      case 'd':
      case 'D':
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        normalizedHandlers.onReject()
        break
    }
  }

  onMounted(() => {
    // Use capture phase to handle before other listeners
    window.addEventListener('keydown', handleKeydown, { capture: true })
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown, { capture: true })
  })
}
