import { app, type BrowserWindow, type WebContents } from 'electron'

export interface ElectronActivateAppLike {
  on(event: 'activate', listener: () => void): void
}

export interface ElectronActivateOptions {
  getMainWindow(): BrowserWindow | null
  setMainWindow(window: BrowserWindow | null): void
  shouldSuppressMainWindowActivation(): boolean
  createWindow(): BrowserWindow
  attachVoiceTrayMainWindow(window: BrowserWindow): void
  registerGlobalWindowShortcuts(window: BrowserWindow): void
  initializeIPCBridge(webContents: WebContents): void
  bindStreamEngine(webContents: WebContents): void
  shutdownIPCBridge(): void
  abortActiveStreams(): void
  attachVoiceMainWindow(window: BrowserWindow): void
  warmSearchWindow(window: BrowserWindow): void
  warmTodoPlanWindow(): void
  activateMainWindow(window: BrowserWindow | null): boolean
  app?: ElectronActivateAppLike
  schedule?: (callback: () => void, delayMs: number) => unknown
  warmSearchDelayMs?: number
  warmTodoDelayMs?: number
}

export function registerElectronActivateHandler(options: ElectronActivateOptions): void {
  const electronApp = options.app ?? app
  electronApp.on('activate', () => {
    handleElectronActivate(options)
  })
}

export function handleElectronActivate(options: ElectronActivateOptions): void {
  const mainWindow = options.getMainWindow()
  if (mainWindow === null) {
    if (options.shouldSuppressMainWindowActivation()) return
    createAndBindElectronMainWindow(options)
    return
  }

  options.activateMainWindow(mainWindow)
}

export function createAndBindElectronMainWindow(options: ElectronActivateOptions): BrowserWindow {
  const mainWindow = options.createWindow()
  options.setMainWindow(mainWindow)
  options.attachVoiceTrayMainWindow(mainWindow)
  options.registerGlobalWindowShortcuts(mainWindow)
  options.initializeIPCBridge(mainWindow.webContents)
  options.bindStreamEngine(mainWindow.webContents)
  mainWindow.on('closed', () => {
    options.shutdownIPCBridge()
    options.abortActiveStreams()
    options.setMainWindow(null)
  })
  options.attachVoiceMainWindow(mainWindow)
  scheduleElectronMainWindowWarmups(options, mainWindow)
  return mainWindow
}

function scheduleElectronMainWindowWarmups(
  options: ElectronActivateOptions,
  mainWindow: BrowserWindow,
): void {
  const schedule = options.schedule ?? ((callback, delayMs) => setTimeout(callback, delayMs))
  const warmSearchDelayMs = options.warmSearchDelayMs ?? 1200
  const warmTodoDelayMs = options.warmTodoDelayMs ?? 1600

  const begin = (): void => {
    schedule(() => {
      const currentMainWindow = options.getMainWindow()
      if (currentMainWindow && !currentMainWindow.isDestroyed()) {
        options.warmSearchWindow(currentMainWindow)
      }
    }, warmSearchDelayMs)

    schedule(() => {
      options.warmTodoPlanWindow()
    }, warmTodoDelayMs)
  }

  // 预热计时从渲染器加载完成后起算,避免预热窗口与主窗口首帧/会话恢复
  // 抢 CPU;测试桩没有完整 webContents 时保持旧行为(立即起算)。
  const webContents = mainWindow.webContents as
    | { isLoading?: () => boolean; once?: (event: string, listener: () => void) => unknown }
    | undefined
  if (webContents?.isLoading?.() && typeof webContents.once === 'function') {
    webContents.once('did-finish-load', begin)
  } else {
    begin()
  }
}
