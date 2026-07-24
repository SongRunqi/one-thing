/**
 * Theme IPC Handlers
 * Handles IPC communication for theme operations
 */

import {
  registerElectronThemesIpcHandlers,
  type ElectronThemeFolderOpener,
  type ElectronThemeMode,
} from '@onething/electron-host/ipc/themes'
import { defaultOnethingThemeRuntime } from '@onething/runtime/themes/theme-runtime'
import { IPC_CHANNELS } from '@shared/ipc.js'

/**
 * Initialize the theme system
 */
export async function initializeThemeSystem(): Promise<void> {
  console.log('[Theme IPC] Initializing theme system...')
  await defaultOnethingThemeRuntime.initialize()
  console.log('[Theme IPC] Theme system initialized')
}

/**
 * Register all theme-related IPC handlers
 */
export function registerThemeHandlers() {
  registerElectronThemesIpcHandlers({
    channels: {
      list: IPC_CHANNELS.THEME_GET_ALL,
      get: IPC_CHANNELS.THEME_GET,
      apply: IPC_CHANNELS.THEME_APPLY,
      refresh: IPC_CHANNELS.THEME_REFRESH,
      openFolder: IPC_CHANNELS.THEME_OPEN_FOLDER,
    },
    listThemes: () => {
      return defaultOnethingThemeRuntime.listThemes()
    },
    getTheme: (themeId: string) => {
      return defaultOnethingThemeRuntime.getTheme(themeId)
    },
    applyTheme: (themeId: string, mode: ElectronThemeMode) => {
      return defaultOnethingThemeRuntime.applyTheme(themeId, mode)
    },
    refreshThemes: (projectPath?: string) => {
      return defaultOnethingThemeRuntime.refreshThemes(projectPath)
    },
    openThemesFolder: (openThemesPath: ElectronThemeFolderOpener) => {
      return defaultOnethingThemeRuntime.openThemesFolder(openThemesPath)
    },
  })

  console.log('[Theme IPC] Handlers registered')
}
