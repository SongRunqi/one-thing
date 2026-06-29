import { globalShortcut } from 'electron'
import type { KeyboardShortcut } from '@shared/ipc.js'
import { toggleTodoPlanWindow } from '@onething/electron-host/window'
import type { ElectronBrowserWindow } from '@onething/electron-host/window/types'

export interface ElectronKeyboardShortcut {
  key?: string
  sequence?: unknown
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  metaKey?: boolean
}

export interface ElectronWindowShortcuts {
  toggleTodoPlanWindow?: ElectronKeyboardShortcut
}

export interface ElectronGlobalShortcutAdapter {
  register(accelerator: string, callback: () => void): boolean
  unregister(accelerator: string): void
  unregisterAll(): void
}

export interface ElectronGlobalShortcutHandlers {
  toggleTodoPlanWindow(): void
}

export interface ElectronGlobalShortcutControllerOptions {
  getShortcuts(): ElectronWindowShortcuts | undefined
  handlers: ElectronGlobalShortcutHandlers
  getPlatform?: () => NodeJS.Platform
  globalShortcut?: ElectronGlobalShortcutAdapter
  logger?: Pick<Console, 'warn'>
}

export interface ElectronGlobalShortcutController {
  shortcutToAccelerator(shortcut: ElectronKeyboardShortcut | undefined): string | null
  registerGlobalWindowShortcuts(): void
  unregisterGlobalWindowShortcuts(): void
}

export interface ConfigureGlobalWindowShortcutsOptions {
  getShortcuts(): ElectronWindowShortcuts | undefined
  handlers?: Partial<ElectronGlobalShortcutHandlers>
}

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

export function createElectronGlobalShortcutController(
  options: ElectronGlobalShortcutControllerOptions,
): ElectronGlobalShortcutController {
  const shortcutAdapter = options.globalShortcut ?? globalShortcut
  const logger = options.logger ?? console
  const registeredAccelerators = new Set<string>()

  function shortcutToAccelerator(shortcut: ElectronKeyboardShortcut | undefined): string | null {
    if (!shortcut?.key) return null
    if (shortcut.sequence) return null

    const parts: string[] = []
    if (shortcut.ctrlKey) parts.push('Control')
    if (shortcut.altKey) parts.push('Alt')
    if (shortcut.shiftKey) parts.push('Shift')
    if (shortcut.metaKey) parts.push((options.getPlatform?.() ?? process.platform) === 'darwin' ? 'Command' : 'Super')
    parts.push(normalizeKey(shortcut.key))

    return parts.join('+')
  }

  function unregisterWindowShortcuts(): void {
    for (const accelerator of registeredAccelerators) {
      shortcutAdapter.unregister(accelerator)
    }
    registeredAccelerators.clear()
  }

  function registerWindowShortcut(
    name: string,
    shortcut: ElectronKeyboardShortcut | undefined,
    handler: () => void,
  ): void {
    const accelerator = shortcutToAccelerator(shortcut)
    if (!accelerator || registeredAccelerators.has(accelerator)) return

    const registered = shortcutAdapter.register(accelerator, handler)
    if (!registered) {
      logger.warn(`[Shortcuts] Failed to register global shortcut "${name}" (${accelerator})`)
      return
    }

    registeredAccelerators.add(accelerator)
  }

  return {
    shortcutToAccelerator,
    registerGlobalWindowShortcuts(): void {
      unregisterWindowShortcuts()

      const shortcuts = options.getShortcuts()
      if (!shortcuts) return

      registerWindowShortcut(
        'Todo Window',
        shortcuts.toggleTodoPlanWindow,
        options.handlers.toggleTodoPlanWindow,
      )
    },
    unregisterGlobalWindowShortcuts(): void {
      shortcutAdapter.unregisterAll()
      registeredAccelerators.clear()
    },
  }
}

let globalWindowShortcuts = createElectronGlobalShortcutController({
  getShortcuts: () => undefined,
  handlers: createDefaultGlobalShortcutHandlers(),
})
let globalWindowShortcutsRegistered = false

export function configureGlobalWindowShortcuts(
  options: ConfigureGlobalWindowShortcutsOptions,
): void {
  const wasRegistered = globalWindowShortcutsRegistered
  if (wasRegistered) {
    globalWindowShortcuts.unregisterGlobalWindowShortcuts()
    globalWindowShortcutsRegistered = false
  }

  globalWindowShortcuts = createElectronGlobalShortcutController({
    getShortcuts: options.getShortcuts,
    handlers: {
      ...createDefaultGlobalShortcutHandlers(),
      ...options.handlers,
    },
  })

  if (wasRegistered) {
    registerGlobalWindowShortcuts()
  }
}

export function registerGlobalWindowShortcuts(_mainWindow?: ElectronBrowserWindow | null): void {
  globalWindowShortcuts.registerGlobalWindowShortcuts()
  globalWindowShortcutsRegistered = true
}

export function unregisterGlobalWindowShortcuts(): void {
  if (!globalWindowShortcutsRegistered) return
  globalWindowShortcuts.unregisterGlobalWindowShortcuts()
  globalWindowShortcutsRegistered = false
}

export function shortcutToAccelerator(shortcut: KeyboardShortcut | undefined): string | null {
  return globalWindowShortcuts.shortcutToAccelerator(shortcut)
}

function createDefaultGlobalShortcutHandlers(): ElectronGlobalShortcutHandlers {
  return {
    toggleTodoPlanWindow: () => {
      toggleTodoPlanWindow({
        activation: 'preserve-current-app',
        preserveMainWindowVisibility: true,
      })
    },
  }
}
