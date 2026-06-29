import { BrowserWindow } from 'electron'
import type { ElectronMainWindowVisibilitySnapshot } from './window-visibility.js'

export type ElectronTodoPlanActivationMode = 'preserve-current-app' | 'focus-if-app-active'

export interface ElectronTodoPlanWindowActionOptions {
  activation?: ElectronTodoPlanActivationMode
  preserveMainWindowVisibility?: boolean
  mainWindowVisibilitySnapshot?: ElectronMainWindowVisibilitySnapshot[]
}

export interface NormalizedElectronTodoPlanWindowActionOptions {
  activation: ElectronTodoPlanActivationMode
  preserveMainWindowVisibility: boolean
  mainWindowVisibilitySnapshot?: ElectronMainWindowVisibilitySnapshot[]
}

export interface PreparedElectronTodoPlanWindowAction {
  options: NormalizedElectronTodoPlanWindowActionOptions
  mainWindowVisibilitySnapshot: ElectronMainWindowVisibilitySnapshot[]
}

export interface ElectronTodoPlanPresentationEnvironment {
  platform?: () => NodeJS.Platform
  getFocusedWindow?: () => BrowserWindow | null
}

export interface PrepareElectronTodoPlanWindowActionOptions extends ElectronTodoPlanPresentationEnvironment {
  suppressMainWindowActivation(): void
  captureMainWindowVisibility(): ElectronMainWindowVisibilitySnapshot[]
}

export interface PresentElectronTodoPlanWindowOptions extends ElectronTodoPlanPresentationEnvironment {
  showNonActivatingPanel(window: BrowserWindow): boolean
}

export interface ElectronTodoPlanFrontmostOptions {
  platform?: () => NodeJS.Platform
  isNonActivatingPanelFrontmost(window: BrowserWindow): boolean
}

function currentPlatform(options: Pick<ElectronTodoPlanPresentationEnvironment, 'platform'>): NodeJS.Platform {
  return options.platform?.() ?? process.platform
}

function focusedWindow(options: Pick<ElectronTodoPlanPresentationEnvironment, 'getFocusedWindow'>): BrowserWindow | null {
  return options.getFocusedWindow?.() ?? BrowserWindow.getFocusedWindow()
}

export function normalizeElectronTodoPlanWindowActionOptions(
  options: ElectronTodoPlanWindowActionOptions = {},
): NormalizedElectronTodoPlanWindowActionOptions {
  return {
    activation: options.activation || 'preserve-current-app',
    preserveMainWindowVisibility: options.preserveMainWindowVisibility !== false,
    mainWindowVisibilitySnapshot: options.mainWindowVisibilitySnapshot,
  }
}

export function shouldPreserveElectronCurrentMacApp(
  options: NormalizedElectronTodoPlanWindowActionOptions,
  environment: ElectronTodoPlanPresentationEnvironment = {},
): boolean {
  if (currentPlatform(environment) !== 'darwin') return false
  if (options.activation === 'preserve-current-app') return true
  return !focusedWindow(environment)
}

export function prepareElectronTodoPlanWindowAction(
  options: ElectronTodoPlanWindowActionOptions = {},
  environment: PrepareElectronTodoPlanWindowActionOptions,
): PreparedElectronTodoPlanWindowAction {
  const normalized = normalizeElectronTodoPlanWindowActionOptions(options)
  if (shouldPreserveElectronCurrentMacApp(normalized, environment)) {
    environment.suppressMainWindowActivation()
  }

  return {
    options: normalized,
    mainWindowVisibilitySnapshot: normalized.preserveMainWindowVisibility
      ? normalized.mainWindowVisibilitySnapshot || environment.captureMainWindowVisibility()
      : [],
  }
}

export function presentElectronTodoPlanWindow(
  window: BrowserWindow,
  options: NormalizedElectronTodoPlanWindowActionOptions,
  environment: PresentElectronTodoPlanWindowOptions,
): void {
  if (shouldPreserveElectronCurrentMacApp(options, environment)) {
    const shownNatively = environment.showNonActivatingPanel(window)
    if (!shownNatively) {
      window.showInactive()
      window.moveTop()
    }
    return
  }

  window.show()
  window.focus()
}

export function isElectronTodoPlanWindowFrontmost(
  window: BrowserWindow,
  options: ElectronTodoPlanFrontmostOptions,
): boolean {
  if (currentPlatform(options) === 'darwin') {
    return options.isNonActivatingPanelFrontmost(window) || window.isFocused()
  }
  return window.isFocused()
}
