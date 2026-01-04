/**
 * Theme IPC Handlers
 * Handles IPC communication for theme operations
 */

import { ipcMain, shell } from 'electron'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import type {
  GetThemesResponse,
  GetThemeResponse,
  ApplyThemeResponse,
  RefreshThemesResponse,
} from '../../shared/ipc/themes.js'
import {
  initializeThemes,
  loadCustomThemes,
  getThemeList,
  getTheme,
  applyTheme,
  getThemesFolderPath,
  refreshThemes,
} from '../themes/index.js'

let isInitialized = false

/**
 * Initialize the theme system
 */
export async function initializeThemeSystem(): Promise<void> {
  if (isInitialized) return

  console.log('[Theme IPC] Initializing theme system...')

  // Initialize built-in themes
  initializeThemes()

  // Load custom themes from filesystem
  loadCustomThemes()

  isInitialized = true
  console.log('[Theme IPC] Theme system initialized')
}

/**
 * Register all theme-related IPC handlers
 */
export function registerThemeHandlers() {
  // Get all available themes
  ipcMain.handle(IPC_CHANNELS.THEME_GET_ALL, async (): Promise<GetThemesResponse> => {
    try {
      if (!isInitialized) {
        await initializeThemeSystem()
      }

      const themes = getThemeList()
      return { success: true, themes }
    } catch (error: any) {
      console.error('[Theme IPC] Error getting themes:', error)
      return { success: false, error: error.message }
    }
  })

  // Get a specific theme by ID
  ipcMain.handle(
    IPC_CHANNELS.THEME_GET,
    async (_event, themeId: string): Promise<GetThemeResponse> => {
      try {
        if (!isInitialized) {
          await initializeThemeSystem()
        }

        const theme = getTheme(themeId)
        if (!theme) {
          return { success: false, error: `Theme not found: ${themeId}` }
        }

        return { success: true, theme }
      } catch (error: any) {
        console.error('[Theme IPC] Error getting theme:', error)
        return { success: false, error: error.message }
      }
    }
  )

  // Apply a theme and get CSS variables
  ipcMain.handle(
    IPC_CHANNELS.THEME_APPLY,
    async (
      _event,
      themeId: string,
      mode: 'dark' | 'light'
    ): Promise<ApplyThemeResponse> => {
      try {
        if (!isInitialized) {
          await initializeThemeSystem()
        }

        const cssVariables = applyTheme(themeId, mode)
        return { success: true, cssVariables }
      } catch (error: any) {
        console.error('[Theme IPC] Error applying theme:', error)
        return { success: false, error: error.message }
      }
    }
  )

  // Refresh themes (reload from filesystem)
  ipcMain.handle(
    IPC_CHANNELS.THEME_REFRESH,
    async (_event, projectPath?: string): Promise<RefreshThemesResponse> => {
      try {
        const themes = refreshThemes(projectPath)
        return { success: true, themes }
      } catch (error: any) {
        console.error('[Theme IPC] Error refreshing themes:', error)
        return { success: false, error: error.message }
      }
    }
  )

  // Open themes folder in file explorer
  ipcMain.handle(IPC_CHANNELS.THEME_OPEN_FOLDER, async (): Promise<{ success: boolean; error?: string }> => {
    try {
      const themesPath = getThemesFolderPath()
      await shell.openPath(themesPath)
      return { success: true }
    } catch (error: any) {
      console.error('[Theme IPC] Error opening themes folder:', error)
      return { success: false, error: error.message }
    }
  })

  console.log('[Theme IPC] Handlers registered')
}
