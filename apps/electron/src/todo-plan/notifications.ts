import { BrowserWindow, shell } from 'electron'
import type { TodoPlanChangedPayload } from '@onething/runtime/todo-plan'

export interface ElectronTodoPlanMessageWebContents {
  send(channel: string, payload: TodoPlanChangedPayload): void
}

export interface ElectronTodoPlanMessageWindow {
  isDestroyed(): boolean
  webContents: ElectronTodoPlanMessageWebContents
}

export interface BroadcastElectronTodoPlanChangedOptions {
  channel: string
  payload: TodoPlanChangedPayload
  getAllWindows?: () => ElectronTodoPlanMessageWindow[]
}

export function broadcastElectronTodoPlanChanged(
  options: BroadcastElectronTodoPlanChangedOptions,
): void {
  const getAllWindows = options.getAllWindows ?? (() => BrowserWindow.getAllWindows())
  for (const window of getAllWindows()) {
    if (window.isDestroyed()) continue
    window.webContents.send(options.channel, options.payload)
  }
}

export function revealElectronTodoPlanDirectory(directory: string): Promise<string> {
  return shell.openPath(directory)
}
