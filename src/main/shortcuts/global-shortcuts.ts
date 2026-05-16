import { BrowserWindow, globalShortcut } from 'electron'
import type { KeyboardShortcut } from '../../shared/ipc.js'
import { getSettings } from '../stores/settings.js'
import { toggleTodoPlanWindow } from '../window.js'

const registeredAccelerators = new Set<string>()

function normalizeKey(key: string): string {
  if (key === ' ') return 'Space'
  if (key.length === 1) return key.toUpperCase()

  const lower = key.toLowerCase()
  if (lower === 'escape') return 'Esc'
  if (lower === 'arrowup') return 'Up'
  if (lower === 'arrowdown') return 'Down'
  if (lower === 'arrowleft') return 'Left'
  if (lower === 'arrowright') return 'Right'
  if (lower === 'delete') return 'Delete'
  if (lower === 'backspace') return 'Backspace'
  if (lower === 'tab') return 'Tab'
  if (lower === 'enter') return 'Enter'

  return key
}

export function shortcutToAccelerator(shortcut: KeyboardShortcut | undefined): string | null {
  if (!shortcut?.key) return null
  if (shortcut.sequence) return null

  const parts: string[] = []
  if (shortcut.ctrlKey) parts.push('Control')
  if (shortcut.altKey) parts.push('Alt')
  if (shortcut.shiftKey) parts.push('Shift')
  if (shortcut.metaKey) parts.push(process.platform === 'darwin' ? 'Command' : 'Super')
  parts.push(normalizeKey(shortcut.key))

  return parts.join('+')
}

function unregisterWindowShortcuts(): void {
  for (const accelerator of registeredAccelerators) {
    globalShortcut.unregister(accelerator)
  }
  registeredAccelerators.clear()
}

function registerWindowShortcut(
  name: string,
  shortcut: KeyboardShortcut | undefined,
  handler: () => void,
): void {
  const accelerator = shortcutToAccelerator(shortcut)
  if (!accelerator || registeredAccelerators.has(accelerator)) return

  const registered = globalShortcut.register(accelerator, handler)
  if (!registered) {
    console.warn(`[Shortcuts] Failed to register global shortcut "${name}" (${accelerator})`)
    return
  }

  registeredAccelerators.add(accelerator)
}

export function registerGlobalWindowShortcuts(_mainWindow?: BrowserWindow | null): void {
  unregisterWindowShortcuts()

  const shortcuts = getSettings().general?.shortcuts
  if (!shortcuts) return

  registerWindowShortcut('Todo Window', shortcuts.toggleTodoPlanWindow, () => {
    toggleTodoPlanWindow({
      activation: 'preserve-current-app',
      preserveMainWindowVisibility: true,
    })
  })
}

export function unregisterGlobalWindowShortcuts(): void {
  globalShortcut.unregisterAll()
  registeredAccelerators.clear()
}
