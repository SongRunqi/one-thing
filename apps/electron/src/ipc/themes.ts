import { ipcMain } from 'electron'
import { openElectronPath } from '../shell/operations.js'

export interface ElectronIpcMainLike {
  handle<TArgs extends unknown[]>(
    channel: string,
    listener: (event: unknown, ...args: TArgs) => unknown,
  ): void
}

export interface ElectronThemesIpcChannels {
  list: string
  get: string
  apply: string
  refresh: string
  openFolder: string
}

export type ElectronThemeMode = 'dark' | 'light'

export type ElectronThemeFolderOpener = (
  themesPath: string,
) => Promise<string | void | null | undefined> | string | void | null | undefined

export interface RegisterElectronThemesIpcHandlersOptions {
  channels: ElectronThemesIpcChannels
  listThemes(): unknown
  getTheme(themeId: string): unknown
  applyTheme(themeId: string, mode: ElectronThemeMode): unknown
  refreshThemes(projectPath?: string): unknown
  openThemesFolder(openThemesPath: ElectronThemeFolderOpener): unknown
  openPath?: ElectronThemeFolderOpener
  ipcMain?: ElectronIpcMainLike
}

export function registerElectronThemesIpcHandlers(
  options: RegisterElectronThemesIpcHandlersOptions,
): void {
  const host = options.ipcMain ?? ipcMain
  const openPath = options.openPath ?? openElectronPath

  host.handle(options.channels.list, () => {
    return options.listThemes()
  })

  host.handle(options.channels.get, (_event, themeId: string) => {
    return options.getTheme(themeId)
  })

  host.handle(options.channels.apply, (_event, themeId: string, mode: ElectronThemeMode) => {
    return options.applyTheme(themeId, mode)
  })

  host.handle(options.channels.refresh, (_event, projectPath?: string) => {
    return options.refreshThemes(projectPath)
  })

  host.handle(options.channels.openFolder, () => {
    return options.openThemesFolder(openPath)
  })
}
