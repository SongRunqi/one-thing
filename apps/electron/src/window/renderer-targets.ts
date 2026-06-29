import type { BrowserWindow, WebContents } from 'electron'

export type ElectronThemeMode = 'dark' | 'light'

export interface ElectronRendererTargetOptions {
  rendererDevUrl?: string
}

export interface ElectronAppWebContentsOptions extends ElectronRendererTargetOptions {
  isDevelopment: boolean
  rendererIndexPath: string
}

export interface LoadElectronMainWindowContentOptions extends ElectronAppWebContentsOptions {
  mainWindow: BrowserWindow
  themeMode: ElectronThemeMode
  reason?: string
}

const AUXILIARY_HASH_PREFIXES = [
  '#/search',
  '#/settings',
  '#/todo-plan',
  '#/image-preview',
]

export function getElectronRendererDevUrl(env: NodeJS.ProcessEnv = process.env): string {
  return env.ELECTRON_RENDERER_URL || 'http://127.0.0.1:5173'
}

export function isElectronRendererWindowUrl(
  url: string,
  options: ElectronRendererTargetOptions = {},
): boolean {
  const devUrl = options.rendererDevUrl || getElectronRendererDevUrl()
  return url.startsWith('file://') || url.startsWith(devUrl)
}

export function isElectronMainAppWindowUrl(
  url: string,
  options: ElectronRendererTargetOptions = {},
): boolean {
  if (!isElectronRendererWindowUrl(url, options)) return false

  let hash = ''
  try {
    hash = new URL(url).hash
  } catch {
    return false
  }

  return !AUXILIARY_HASH_PREFIXES.some(prefix => hash.startsWith(prefix))
}

export function isElectronAppWebContents(
  webContents: WebContents | null,
  options: ElectronAppWebContentsOptions,
): boolean {
  if (!webContents) return false

  const url = webContents.getURL()
  return options.isDevelopment
    ? url.startsWith(options.rendererDevUrl || getElectronRendererDevUrl())
    : url.startsWith(`file://${options.rendererIndexPath}`)
}

export function loadElectronMainWindowContent(options: LoadElectronMainWindowContentOptions): void {
  const loadPromise = options.isDevelopment
    ? options.mainWindow.loadURL(`${options.rendererDevUrl || getElectronRendererDevUrl()}#theme=${options.themeMode}`)
    : options.mainWindow.loadFile(options.rendererIndexPath, {
      hash: `theme=${options.themeMode}`,
    })

  Promise.resolve(loadPromise).catch((error) => {
    console.error(`[Window] Failed to load main window content (${options.reason || 'initial'}):`, error)
  })
}
