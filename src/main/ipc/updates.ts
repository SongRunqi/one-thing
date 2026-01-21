/**
 * Update IPC Handlers
 * Handles IPC communication for auto-update functionality
 */

import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc/channels.js'
import {
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  getUpdateStatus,
} from '../services/updater/index.js'
import type {
  CheckUpdateResponse,
  DownloadUpdateResponse,
  InstallUpdateResponse,
} from '../../shared/ipc/updates.js'

// ReleaseNoteInfo type from electron-updater (not directly exported)
interface ReleaseNoteInfo {
  version: string
  note: string | null
}

// Helper to normalize releaseNotes to string
function normalizeReleaseNotes(notes: string | ReleaseNoteInfo[] | null | undefined): string | null {
  if (!notes) return null
  if (typeof notes === 'string') return notes
  // Array of ReleaseNoteInfo - join all notes
  return notes.map(n => `${n.version}: ${n.note || ''}`).join('\n\n')
}

export function registerUpdateHandlers(): void {
  // Check for updates
  ipcMain.handle(
    IPC_CHANNELS.UPDATE_CHECK,
    async (): Promise<CheckUpdateResponse> => {
      try {
        const result = await checkForUpdates()
        return {
          success: true,
          available: result.available,
          updateInfo: result.updateInfo
            ? {
                version: result.updateInfo.version,
                releaseDate: result.updateInfo.releaseDate,
                releaseNotes: normalizeReleaseNotes(result.updateInfo.releaseNotes),
                releaseName: result.updateInfo.releaseName,
              }
            : undefined,
          error: result.error,
        }
      } catch (error) {
        return {
          success: false,
          available: false,
          error: error instanceof Error ? error.message : 'Check failed',
        }
      }
    }
  )

  // Download update
  ipcMain.handle(
    IPC_CHANNELS.UPDATE_DOWNLOAD,
    async (): Promise<DownloadUpdateResponse> => {
      try {
        const result = await downloadUpdate()
        return {
          success: !result.error,
          error: result.error,
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Download failed',
        }
      }
    }
  )

  // Install update (quit and install)
  ipcMain.handle(
    IPC_CHANNELS.UPDATE_INSTALL,
    async (): Promise<InstallUpdateResponse> => {
      try {
        installUpdate()
        return { success: true }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Install failed',
        }
      }
    }
  )

  // Get current update status
  ipcMain.handle(IPC_CHANNELS.UPDATE_AVAILABLE, async () => {
    const status = getUpdateStatus()
    return {
      success: true,
      ...status,
    }
  })
}
