/**
 * Search Everywhere - onething Electron window lifecycle.
 */

import path from 'path'
import { fileURLToPath } from 'url'
import { DEFAULT_GENERAL_SETTINGS } from '@shared/defaults/settings.js'
import { IPC_CHANNELS } from '@shared/ipc.js'
import type { SearchWindowGuideState } from '@shared/ipc/search.js'
import { getSettings } from '@main/stores/settings.js'
import {
  getThemeBackgroundColor,
  resolveOnethingWindowThemeSelection,
} from '@onething/runtime/themes'
import {
  createElectronSearchWindowController,
  getElectronSystemShouldUseDarkColors,
} from '@onething/electron-host/window/search-window'
import { getElectronRendererDevUrl } from '@onething/electron-host/window/renderer-targets'
import {
  ELECTRON_SEARCH_WINDOW_MIN_HEIGHT,
  ELECTRON_SEARCH_WINDOW_MIN_WIDTH,
  getElectronDefaultSearchWindowBounds,
  getElectronSearchWindowGuideState,
  getElectronSearchWindowSizeConstraints,
} from '@onething/electron-host/window/search-window-layout'
import type { ElectronBrowserWindow } from '@onething/electron-host/window/types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const HIDDEN_GUIDES: SearchWindowGuideState = {
  visible: false,
  centerX: false,
  defaultTop: false,
  defaultHeight: false,
  defaultBounds: false,
}

function getRendererIndexPath(): string {
  return path.join(__dirname, '../renderer/index.html')
}

function getSearchWindowVisualOptions() {
  const settings = getSettings()
  const selection = resolveOnethingWindowThemeSelection({
    theme: settings.theme,
    general: settings.general,
    defaults: DEFAULT_GENERAL_SETTINGS,
    systemShouldUseDarkColors: getElectronSystemShouldUseDarkColors(),
  })

  return {
    isDevelopment: process.env.NODE_ENV === 'development',
    isMac: process.platform === 'darwin',
    backgroundColor: getThemeBackgroundColor(selection.themeId, selection.mode),
    routeHash: `/search?theme=${selection.mode}&colorTheme=${selection.colorTheme}`,
    rendererDevUrl: getElectronRendererDevUrl(),
    rendererIndexPath: getRendererIndexPath(),
    preloadPath: path.join(__dirname, '../preload/index.js'),
  }
}

const searchWindowController = createElectronSearchWindowController({
  shownChannel: IPC_CHANNELS.SEARCH_WINDOW_SHOWN,
  guidesChannel: IPC_CHANNELS.SEARCH_WINDOW_GUIDES,
  hiddenGuides: HIDDEN_GUIDES,
  layout: {
    minWidth: ELECTRON_SEARCH_WINDOW_MIN_WIDTH,
    minHeight: ELECTRON_SEARCH_WINDOW_MIN_HEIGHT,
    getSizeConstraints: getElectronSearchWindowSizeConstraints,
    getDefaultBounds: getElectronDefaultSearchWindowBounds,
    getGuideState: getElectronSearchWindowGuideState,
  },
  getVisualOptions: getSearchWindowVisualOptions,
})

export function openSearchWindow(parentWindow: ElectronBrowserWindow): ElectronBrowserWindow {
  return searchWindowController.open(parentWindow)
}

export function warmSearchWindow(parentWindow: ElectronBrowserWindow): ElectronBrowserWindow {
  return searchWindowController.warm(parentWindow)
}

export function closeSearchWindow(): void {
  searchWindowController.close()
}

export function toggleSearchWindow(parentWindow: ElectronBrowserWindow): void {
  searchWindowController.toggle(parentWindow)
}

export function getSearchWindow(): ElectronBrowserWindow | null {
  return searchWindowController.getWindow()
}
