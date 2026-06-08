import type { BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import { createDailyNote } from './providers.js'
import { closeSearchWindow, toggleSearchWindow } from './window.js'
import { findMainAppWindow } from './window-selection.js'

const CREATE_DAILY_NOTE_PREFIX = 'create-daily-note:'

async function resolveActionId(actionId: string): Promise<string> {
  if (!actionId.startsWith(CREATE_DAILY_NOTE_PREFIX)) return actionId

  const encodedPath = actionId.slice(CREATE_DAILY_NOTE_PREFIX.length)
  const filePath = decodeURIComponent(encodedPath)
  await createDailyNote(filePath)
  return `open-file:${filePath}`
}

export function toggleSearchWindowFrom(sourceWindow?: BrowserWindow | null): { success: boolean } {
  const parentWindow = findMainAppWindow(sourceWindow)
  if (!parentWindow) return { success: false }

  toggleSearchWindow(parentWindow)
  return { success: true }
}

export async function executeSearchActionFrom(
  sourceWindow: BrowserWindow | null | undefined,
  actionId: string,
): Promise<{ success: boolean }> {
  closeSearchWindow()

  const resolvedActionId = await resolveActionId(actionId)
  const mainWindow = findMainAppWindow(sourceWindow)

  if (!mainWindow) {
    console.warn('[Search] No main app window found for action:', resolvedActionId)
    return { success: false }
  }

  mainWindow.webContents.send(IPC_CHANNELS.SEARCH_ACTION, resolvedActionId)
  mainWindow.focus()
  return { success: true }
}
