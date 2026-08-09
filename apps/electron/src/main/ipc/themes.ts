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
import { applyPluginThemeOverrides } from '@onething/app/plugins/theme-overrides.js'
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
    applyTheme: async (themeId: string, mode: ElectronThemeMode) => {
      // 合成点(B 期,L2):主题产出 ⊕ 插件 `contributes.theme` 覆盖。
      //
      // 放在**变量流出宿主之前**的最后一步 —— 主题系统本身(generateCSSVariables)
      // 零改动,renderer 的 applyThemeVariables 也零改动:它只是消费下发的表。
      // 方案 A 口径:只有 desktop 这一个宿主做合成,server 只透传声明。
      const response = await defaultOnethingThemeRuntime.applyTheme(themeId, mode)
      if (!response.success || !response.cssVariables) return response
      return { ...response, cssVariables: applyPluginThemeOverrides(response.cssVariables) }
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
