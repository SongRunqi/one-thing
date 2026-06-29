import type { BrowserWindow } from 'electron'

export interface ElectronMainWindowActivationOptions {
  suppressionMs?: number
  platform?: () => NodeJS.Platform
  now?: () => number
}

export interface ElectronMainWindowActivationController {
  suppressFromAuxiliaryWindow(): void
  shouldSuppressActivation(): boolean
  activateMainWindow(window: BrowserWindow | null | undefined): boolean
}

const DEFAULT_AUXILIARY_CLOSE_ACTIVATION_SUPPRESSION_MS = 2500

export function createElectronMainWindowActivationController(
  options: ElectronMainWindowActivationOptions = {},
): ElectronMainWindowActivationController {
  const suppressionMs = options.suppressionMs ?? DEFAULT_AUXILIARY_CLOSE_ACTIVATION_SUPPRESSION_MS
  const platform = options.platform ?? (() => process.platform)
  const now = options.now ?? (() => Date.now())
  let suppressUntil = 0

  return {
    suppressFromAuxiliaryWindow(): void {
      if (platform() !== 'darwin') return
      suppressUntil = now() + suppressionMs
    },

    shouldSuppressActivation(): boolean {
      return now() < suppressUntil
    },

    activateMainWindow(window: BrowserWindow | null | undefined): boolean {
      if (!window || window.isDestroyed()) return false
      if (now() < suppressUntil) return false

      if (window.isMinimized()) {
        window.restore()
      }
      if (!window.isVisible()) {
        window.show()
      }
      window.focus()
      return true
    },
  }
}
