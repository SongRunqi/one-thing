import type {
  ApplyThemeResponse,
  GetThemeResponse,
  GetThemesResponse,
  OpenThemesFolderResponse,
  RefreshThemesResponse,
  ThemeFolderOpener,
} from './types.js'
import {
  applyTheme,
  getTheme,
  getThemeList,
  getThemesFolderPath,
  initializeThemes,
  loadCustomThemes,
  refreshThemes,
} from './index.js'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class OnethingThemeRuntime {
  private initialized = false

  async initialize(): Promise<void> {
    if (this.initialized) return

    initializeThemes()
    loadCustomThemes()
    this.initialized = true
  }

  async listThemes(): Promise<GetThemesResponse> {
    try {
      await this.initialize()
      return { success: true, themes: getThemeList() }
    } catch (error) {
      return { success: false, error: errorMessage(error) }
    }
  }

  async getTheme(themeId: string): Promise<GetThemeResponse> {
    try {
      await this.initialize()
      const theme = getTheme(themeId)
      if (!theme) {
        return { success: false, error: `Theme not found: ${themeId}` }
      }
      return { success: true, theme }
    } catch (error) {
      return { success: false, error: errorMessage(error) }
    }
  }

  async applyTheme(themeId: string, mode: 'dark' | 'light'): Promise<ApplyThemeResponse> {
    try {
      await this.initialize()
      return { success: true, cssVariables: applyTheme(themeId, mode) }
    } catch (error) {
      return { success: false, error: errorMessage(error) }
    }
  }

  async refreshThemes(projectPath?: string): Promise<RefreshThemesResponse> {
    try {
      return { success: true, themes: refreshThemes(projectPath) }
    } catch (error) {
      return { success: false, error: errorMessage(error) }
    }
  }

  getThemesFolderPath(): string {
    return getThemesFolderPath()
  }

  async openThemesFolder(openThemesPath: ThemeFolderOpener): Promise<OpenThemesFolderResponse> {
    try {
      const result = await openThemesPath(this.getThemesFolderPath())
      if (typeof result === 'string' && result.trim().length > 0) {
        return { success: false, error: result }
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: errorMessage(error) }
    }
  }
}

export const defaultOnethingThemeRuntime = new OnethingThemeRuntime()
