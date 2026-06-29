import { BrowserWindow } from 'electron'

export interface ElectronVoiceMessageWebContents {
  id: number
  send(channel: string, payload: unknown): void
}

export interface ElectronVoiceMessageWindow {
  isDestroyed(): boolean
  webContents: ElectronVoiceMessageWebContents
}

export interface BroadcastElectronVoiceMessageOptions {
  channel: string
  payload: unknown
  exceptWebContentsId?: number
  getAllWindows?: () => ElectronVoiceMessageWindow[]
}

export function getElectronWebContentsId(webContents: { id: number } | null | undefined): number | undefined {
  return webContents?.id
}

export function sendElectronVoiceMessageToWindow(
  window: ElectronVoiceMessageWindow | null | undefined,
  channel: string,
  payload: unknown,
): boolean {
  if (!window || window.isDestroyed()) return false
  window.webContents.send(channel, payload)
  return true
}

export function broadcastElectronVoiceMessage(options: BroadcastElectronVoiceMessageOptions): void {
  const getAllWindows = options.getAllWindows ?? (() => BrowserWindow.getAllWindows())
  for (const window of getAllWindows()) {
    if (window.isDestroyed()) continue
    if (window.webContents.id === options.exceptWebContentsId) continue
    window.webContents.send(options.channel, options.payload)
  }
}
