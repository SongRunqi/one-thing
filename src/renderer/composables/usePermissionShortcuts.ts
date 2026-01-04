/**
 * Permission Shortcuts Composable
 *
 * Handles keyboard shortcuts for permission confirmation:
 * - Enter: Allow once
 * - A: Always allow (for this session)
 * - D / Escape: Reject
 *
 * Based on OpenCode's permission interaction design.
 */

import { onMounted, onUnmounted } from 'vue'

export interface PermissionShortcutHandlers {
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
  handlers: PermissionShortcutHandlers
) {
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
        handlers.onAllowOnce()
        break

      case 'a':
      case 'A':
        event.preventDefault()
        event.stopPropagation()
        handlers.onAllowAlways()
        break

      case 'd':
      case 'D':
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        handlers.onReject()
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
