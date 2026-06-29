import { BrowserWindow, dialog, ipcMain, nativeTheme, type OpenDialogOptions, type OpenDialogReturnValue } from 'electron'

export interface ElectronIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: unknown, ...args: TArgs) => unknown,
  ): void
}

export interface ElectronSettingsIpcEvent {
  sender?: {
    id?: number
  }
}

export interface ElectronSettingsMessageWebContents {
  id?: number
  send(channel: string, payload: unknown): void
}

export interface ElectronSettingsMessageWindow {
  isDestroyed?(): boolean
  webContents: ElectronSettingsMessageWebContents
}

export interface BroadcastElectronSettingsChangedOptions {
  channel: string
  settings: unknown
  exceptWebContentsId?: number
  getAllWindows?: () => ElectronSettingsMessageWindow[]
}

export interface RegisterElectronSystemThemeBroadcastOptions {
  channel: string
  getAllWindows?: () => ElectronSettingsMessageWindow[]
  getShouldUseDarkColors?: () => boolean
  onUpdated?: (handler: () => void) => void
}

export interface ShowElectronOpenDialogOptions {
  getFocusedWindow?: () => BrowserWindow | null
  showOpenDialog?: typeof dialog.showOpenDialog
}

export interface ElectronSettingsIpcChannels {
  openWindow: string
  getSettings: string
  getSystemTheme: string
  saveSettings: string
  testProxy: string
  showOpenDialog: string
}

export interface RegisterElectronSettingsIpcHandlersOptions {
  channels: ElectronSettingsIpcChannels
  openSettingsWindow(): unknown
  getSettings(): unknown
  getSystemTheme(): unknown
  saveSettings(settings: unknown, event: ElectronSettingsIpcEvent): unknown
  testProxy(request: unknown): unknown
  showOpenDialog(options: OpenDialogOptions): unknown
  ipcMain?: ElectronIpcMainLike
}

function getLiveWindows(getAllWindows?: () => ElectronSettingsMessageWindow[]): ElectronSettingsMessageWindow[] {
  const windows = getAllWindows?.() ?? BrowserWindow.getAllWindows()
  return windows.filter(window => !window.isDestroyed?.())
}

export function getElectronShouldUseDarkColors(): boolean {
  return nativeTheme.shouldUseDarkColors
}

export function broadcastElectronSystemThemeChanged(
  options: Omit<RegisterElectronSystemThemeBroadcastOptions, 'onUpdated'>,
): void {
  const shouldUseDarkColors = options.getShouldUseDarkColors?.() ?? nativeTheme.shouldUseDarkColors
  const theme = shouldUseDarkColors ? 'dark' : 'light'
  for (const window of getLiveWindows(options.getAllWindows)) {
    window.webContents.send(options.channel, theme)
  }
}

export function registerElectronSystemThemeChangedBroadcast(
  options: RegisterElectronSystemThemeBroadcastOptions,
): void {
  const onUpdated = options.onUpdated ?? (handler => nativeTheme.on('updated', handler))
  onUpdated(() => broadcastElectronSystemThemeChanged(options))
}

export function broadcastElectronSettingsChanged(
  options: BroadcastElectronSettingsChangedOptions,
): void {
  for (const window of getLiveWindows(options.getAllWindows)) {
    if (window.webContents.id === options.exceptWebContentsId) continue
    window.webContents.send(options.channel, options.settings)
  }
}

export async function showElectronOpenDialog(
  options: OpenDialogOptions,
  host: ShowElectronOpenDialogOptions = {},
): Promise<OpenDialogReturnValue> {
  const showOpenDialog = host.showOpenDialog ?? dialog.showOpenDialog
  const focusedWindow = host.getFocusedWindow?.() ?? BrowserWindow.getFocusedWindow()
  if (focusedWindow) {
    return showOpenDialog(focusedWindow, options)
  }
  return showOpenDialog(options)
}

export function registerElectronSettingsIpcHandlers(
  options: RegisterElectronSettingsIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain

  host.handle(options.channels.openWindow, () => {
    return options.openSettingsWindow()
  })

  host.handle(options.channels.getSettings, () => {
    return options.getSettings()
  })

  host.handle(options.channels.getSystemTheme, () => {
    return options.getSystemTheme()
  })

  host.handle(options.channels.saveSettings, (event: unknown, settings: unknown) => {
    return options.saveSettings(settings, event as ElectronSettingsIpcEvent)
  })

  host.handle(options.channels.testProxy, (_event, request: unknown) => {
    return options.testProxy(request)
  })

  host.handle(options.channels.showOpenDialog, (_event, dialogOptions: OpenDialogOptions) => {
    return options.showOpenDialog(dialogOptions)
  })
}
