/**
 * Global Keyboard Shortcuts Composable
 *
 * Provides global keyboard shortcut handling for the application.
 * Shortcuts are configurable via settings.
 */

import { onMounted, onUnmounted } from 'vue'
import { useSettingsStore } from '../stores/settings'
import { useSessionsStore } from '../stores/sessions'
import type { KeyboardShortcut } from '@/types'

/**
 * Check if a keyboard event matches a shortcut configuration
 */
export function matchShortcut(event: KeyboardEvent, shortcut: KeyboardShortcut | undefined): boolean {
  if (!shortcut || !shortcut.key) return false

  // Normalize the key for comparison
  const eventKey = event.key.toLowerCase()
  const shortcutKey = shortcut.key.toLowerCase()

  // Check if keys match
  if (eventKey !== shortcutKey) return false

  // Check modifier keys
  if (!!shortcut.ctrlKey !== event.ctrlKey) return false
  if (!!shortcut.altKey !== event.altKey) return false
  if (!!shortcut.shiftKey !== event.shiftKey) return false
  if (!!shortcut.metaKey !== event.metaKey) return false

  return true
}

/**
 * Format a shortcut for display
 */
export function formatShortcut(shortcut: KeyboardShortcut | undefined): string {
  if (!shortcut || !shortcut.key) return ''

  const parts: string[] = []

  if (shortcut.ctrlKey) parts.push('Ctrl')
  if (shortcut.altKey) parts.push('Alt')
  if (shortcut.shiftKey) parts.push('Shift')
  if (shortcut.metaKey) parts.push('Cmd')

  let key = shortcut.key
  if (key === ' ') key = 'Space'
  else if (key.length === 1) key = key.toUpperCase()

  parts.push(key)

  return parts.join(' + ')
}

export interface ShortcutHandlers {
  onNewChat?: () => void
  onToggleSidebar?: () => void
  onFocusInput?: () => void
}

/**
 * Setup global keyboard shortcuts
 */
export function useShortcuts(handlers: ShortcutHandlers = {}) {
  const settingsStore = useSettingsStore()
  const sessionsStore = useSessionsStore()

  function handleGlobalKeydown(event: KeyboardEvent) {
    // Skip if we're in an input field (except for specific shortcuts)
    const target = event.target as HTMLElement
    const isInInput = target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable

    const shortcuts = settingsStore.settings?.general?.shortcuts
    if (!shortcuts) return

    // New Chat - works everywhere
    if (matchShortcut(event, shortcuts.newChat)) {
      event.preventDefault()
      if (handlers.onNewChat) {
        handlers.onNewChat()
      } else {
        // Default: create new session
        sessionsStore.createSession('')
      }
      return
    }

    // Toggle Sidebar - works everywhere
    if (matchShortcut(event, shortcuts.toggleSidebar)) {
      event.preventDefault()
      if (handlers.onToggleSidebar) {
        handlers.onToggleSidebar()
      }
      return
    }

    // Focus Input - only when not already in input
    if (!isInInput && matchShortcut(event, shortcuts.focusInput)) {
      event.preventDefault()
      if (handlers.onFocusInput) {
        handlers.onFocusInput()
      }
      return
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleGlobalKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleGlobalKeydown)
  })

  return {
    matchShortcut,
    formatShortcut,
  }
}
