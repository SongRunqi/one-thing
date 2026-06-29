import { BrowserWindow } from 'electron'

export interface ElectronOAuthMessageWebContents {
  send(channel: string, payload: unknown): void
}

export interface ElectronOAuthMessageWindow {
  isDestroyed?(): boolean
  webContents: ElectronOAuthMessageWebContents
}

export interface BroadcastElectronOAuthTokenEventOptions {
  channel: string
  providerId: string
  error?: string
  getAllWindows?: () => ElectronOAuthMessageWindow[]
}

function broadcastElectronOAuthTokenEvent(options: BroadcastElectronOAuthTokenEventOptions): void {
  const getAllWindows = options.getAllWindows ?? (() => BrowserWindow.getAllWindows())
  const payload = options.error === undefined
    ? { providerId: options.providerId }
    : { providerId: options.providerId, error: options.error }

  for (const window of getAllWindows()) {
    if (window.isDestroyed?.()) continue
    window.webContents.send(options.channel, payload)
  }
}

export function broadcastElectronOAuthTokenRefreshed(
  options: Omit<BroadcastElectronOAuthTokenEventOptions, 'error'>,
): void {
  broadcastElectronOAuthTokenEvent(options)
}

export function broadcastElectronOAuthTokenExpired(
  options: BroadcastElectronOAuthTokenEventOptions,
): void {
  broadcastElectronOAuthTokenEvent(options)
}
