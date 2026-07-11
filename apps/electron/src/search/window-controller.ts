import { IPC_CHANNELS } from '@shared/ipc.js'
import {
  executeElectronSearchActionFrom,
  toggleElectronSearchWindowFrom,
  type ElectronSearchActionWindow,
} from '@onething/electron-host/search/window-actions'
import { isElectronMainAppWindowUrl } from '@onething/electron-host/window/renderer-targets'
import { createDailyNote } from '@main/search/providers.js'
import { closeSearchWindow, toggleSearchWindow } from './window.js'

const CREATE_DAILY_NOTE_PREFIX = 'create-daily-note:'

async function resolveActionId(actionId: string): Promise<string> {
  if (!actionId.startsWith(CREATE_DAILY_NOTE_PREFIX)) return actionId

  const encodedPath = actionId.slice(CREATE_DAILY_NOTE_PREFIX.length)
  const filePath = decodeURIComponent(encodedPath)
  await createDailyNote(filePath)
  return `open-file:${filePath}`
}

export function toggleSearchWindowFrom(
  sourceWindow?: ElectronSearchActionWindow | null,
  openOptions?: unknown,
): { success: boolean } {
  return toggleElectronSearchWindowFrom({
    sourceWindow,
    openOptions,
    isMainWindowUrl: isElectronMainAppWindowUrl,
    toggleSearchWindow,
  })
}

export async function executeSearchActionFrom(
  sourceWindow: ElectronSearchActionWindow | null | undefined,
  actionId: string,
): Promise<{ success: boolean }> {
  return executeElectronSearchActionFrom({
    sourceWindow,
    actionId,
    actionChannel: IPC_CHANNELS.SEARCH_ACTION,
    isMainWindowUrl: isElectronMainAppWindowUrl,
    closeSearchWindow,
    resolveActionId,
  })
}
