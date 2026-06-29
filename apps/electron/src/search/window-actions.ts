import { BrowserWindow, ipcMain, type WebContents } from 'electron'

export interface ElectronIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: unknown, ...args: TArgs) => unknown,
  ): void
}

export interface ElectronSearchIpcEvent {
  sender?: WebContents
}

export interface ElectronSearchActionWindow {
  isDestroyed(): boolean
  focus(): void
  getParentWindow(): ElectronSearchActionWindow | null
  webContents: {
    getURL(): string
    send(channel: string, payload: unknown): void
  }
}

export interface FindElectronMainSearchWindowOptions {
  isMainWindowUrl(url: string): boolean
  getFocusedWindow?: () => ElectronSearchActionWindow | null
  getAllWindows?: () => ElectronSearchActionWindow[]
}

export interface ToggleElectronSearchWindowFromOptions extends FindElectronMainSearchWindowOptions {
  sourceWindow?: ElectronSearchActionWindow | null
  toggleSearchWindow(parentWindow: ElectronSearchActionWindow): void
}

export interface ExecuteElectronSearchActionFromOptions extends FindElectronMainSearchWindowOptions {
  sourceWindow?: ElectronSearchActionWindow | null
  actionId: string
  actionChannel: string
  closeSearchWindow(): void
  resolveActionId(actionId: string): Promise<string>
  logger?: Pick<Console, 'warn'>
}

export interface ElectronSearchIpcChannels {
  toggleWindow: string
  closeWindow: string
  query: string
  executeAction: string
}

export interface RegisterElectronSearchIpcHandlersOptions {
  channels: ElectronSearchIpcChannels
  toggleWindow(sourceWindow: ElectronSearchActionWindow | null): unknown
  closeWindow(): unknown
  query(request: unknown): unknown
  executeAction(sourceWindow: ElectronSearchActionWindow | null, actionId: string): unknown
  ipcMain?: ElectronIpcMainLike
}

export function getElectronSearchWindowFromWebContents(
  webContents: WebContents,
): ElectronSearchActionWindow | null {
  return BrowserWindow.fromWebContents(webContents)
}

function getElectronSearchWindowFromIpcEvent(event: unknown): ElectronSearchActionWindow | null {
  const sender = (event as ElectronSearchIpcEvent).sender
  return sender ? getElectronSearchWindowFromWebContents(sender) : null
}

export function isElectronMainSearchWindow(
  window: ElectronSearchActionWindow | null | undefined,
  options: Pick<FindElectronMainSearchWindowOptions, 'isMainWindowUrl'>,
): window is ElectronSearchActionWindow {
  return Boolean(window && !window.isDestroyed() && options.isMainWindowUrl(window.webContents.getURL()))
}

export function findElectronMainSearchWindow(
  sourceWindow: ElectronSearchActionWindow | null | undefined,
  options: FindElectronMainSearchWindowOptions,
): ElectronSearchActionWindow | null {
  const source = sourceWindow && !sourceWindow.isDestroyed() ? sourceWindow : null
  if (source && options.isMainWindowUrl(source.webContents.getURL())) return source

  const parentWindow = source?.getParentWindow()
  if (isElectronMainSearchWindow(parentWindow, options)) return parentWindow

  const getFocusedWindow = options.getFocusedWindow ?? (() => BrowserWindow.getFocusedWindow())
  const focusedWindow = getFocusedWindow()
  if (isElectronMainSearchWindow(focusedWindow, options)) return focusedWindow

  const getAllWindows = options.getAllWindows ?? (() => BrowserWindow.getAllWindows())
  return getAllWindows().find(window => isElectronMainSearchWindow(window, options)) ?? null
}

export function toggleElectronSearchWindowFrom(options: ToggleElectronSearchWindowFromOptions): { success: boolean } {
  const parentWindow = findElectronMainSearchWindow(options.sourceWindow, options)
  if (!parentWindow) return { success: false }

  options.toggleSearchWindow(parentWindow)
  return { success: true }
}

export async function executeElectronSearchActionFrom(
  options: ExecuteElectronSearchActionFromOptions,
): Promise<{ success: boolean }> {
  options.closeSearchWindow()
  const resolvedActionId = await options.resolveActionId(options.actionId)
  const mainWindow = findElectronMainSearchWindow(options.sourceWindow, options)

  if (!mainWindow) {
    const logger = options.logger ?? console
    logger.warn('[Search] No main app window found for action:', resolvedActionId)
    return { success: false }
  }

  mainWindow.webContents.send(options.actionChannel, resolvedActionId)
  mainWindow.focus()
  return { success: true }
}

export function registerElectronSearchIpcHandlers(
  options: RegisterElectronSearchIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain

  host.handle(options.channels.toggleWindow, event => {
    return options.toggleWindow(getElectronSearchWindowFromIpcEvent(event))
  })

  host.handle(options.channels.closeWindow, () => {
    return options.closeWindow()
  })

  host.handle(options.channels.query, (_event, request: unknown) => {
    return options.query(request)
  })

  host.handle(options.channels.executeAction, (event, actionId: string) => {
    return options.executeAction(getElectronSearchWindowFromIpcEvent(event), actionId)
  })
}
