/**
 * Permission Shortcuts Composable
 *
 * Handles keyboard shortcuts for permission confirmation:
 * - Enter: Allow current tool
 * - D / Escape: Reject
 *
 * The old session/workdir/always shortcuts were intentionally removed. Users
 * reduce prompts by switching Permission Mode, not by creating scoped grants.
 */

import { onMounted, onUnmounted } from 'vue'

export interface PermissionShortcutHandlers {
  onAllow: () => void
  onReject: () => void
}

/**
 * Setup keyboard shortcuts for permission confirmation.
 *
 * @param hasPendingPermission - Function that returns true if there's a pending permission
 * @param handlers - Callback handlers for each action
 */
export function usePermissionShortcuts(
  hasPendingPermission: () => boolean,
  handlers: PermissionShortcutHandlers,
) {
  function handleKeydown(event: KeyboardEvent) {
    if (!hasPendingPermission()) return

    const target = event.target as HTMLElement
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable
    ) {
      return
    }

    if ((event.ctrlKey || event.metaKey || event.altKey) && event.key !== 'Escape') {
      return
    }

    switch (event.key) {
      case 'Enter':
        event.preventDefault()
        event.stopPropagation()
        handlers.onAllow()
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
    window.addEventListener('keydown', handleKeydown, { capture: true })
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown, { capture: true })
  })
}
