import { BrowserWindow, shell, type WebContents } from 'electron'

export interface ElectronWindowButtonControls {
  setWindowButtonVisibility(visible: boolean): void
  setWindowButtonPosition(position: { x: number; y: number }): void
}

export interface ElectronBrowserWindowLookup {
  fromWebContents(sender: WebContents): ElectronWindowButtonControls | null
}

export interface ElectronShellOperationsOptions {
  platform?: NodeJS.Platform
  browserWindow?: ElectronBrowserWindowLookup
  shell?: Pick<typeof shell, 'openExternal' | 'openPath' | 'showItemInFolder'>
}

export interface ElectronOpenExternalResult {
  success: true
}

function getPlatform(options: ElectronShellOperationsOptions = {}): NodeJS.Platform {
  return options.platform ?? process.platform
}

export function openElectronPath(
  filePath: string,
  options: ElectronShellOperationsOptions = {},
): Promise<string> {
  const electronShell = options.shell ?? shell
  return electronShell.openPath(filePath)
}

export async function openElectronExternal(
  url: string,
  options: ElectronShellOperationsOptions = {},
): Promise<ElectronOpenExternalResult> {
  const electronShell = options.shell ?? shell
  await electronShell.openExternal(url)
  return { success: true }
}

export function revealElectronPath(
  targetPath: string,
  options: ElectronShellOperationsOptions = {},
): void {
  const electronShell = options.shell ?? shell
  electronShell.showItemInFolder(targetPath)
}

export function setElectronWindowButtonVisibility(
  sender: WebContents,
  visible: boolean,
  options: ElectronShellOperationsOptions = {},
): void {
  if (getPlatform(options) !== 'darwin') {
    return
  }

  const electronBrowserWindow = options.browserWindow ?? BrowserWindow
  const win = electronBrowserWindow.fromWebContents(sender)
  if (!win) return

  win.setWindowButtonVisibility(visible)
  if (visible) {
    win.setWindowButtonPosition({ x: 16, y: 17 })
  }
}
