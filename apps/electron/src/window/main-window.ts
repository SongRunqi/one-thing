import { BrowserWindow } from 'electron'
export type { ElectronBrowserWindow } from './types.js'

/**
 * 红绿灯与顶栏共线的坐标。tab 行(1px PanelTree 上边框 + 40px .tab-bar)中心在
 * 21px,红绿灯实测可见高 14px,故 y = 21 - 7 = 14。
 * 注意:setElectronWindowButtonVisibility 会在运行时重新钉一次位置,那边引用
 * 本常量 —— 只改一处不生效。改 .tab-bar 高度时这里要跟着走。
 */
export const MAIN_TRAFFIC_LIGHT_POSITION = { x: 16, y: 14 } as const

export interface ElectronMainWindowState {
  width: number
  height: number
  x?: number
  y?: number
  isMaximized?: boolean
}

export interface ElectronMainWindowOptions {
  windowState: ElectronMainWindowState
  isDevelopment: boolean
  isMac: boolean
  backgroundColor: string
  iconPath: string
  preloadPath: string
  shouldSuppressActivation(): boolean
  shouldHideForVoice(): boolean
  saveWindowState(window: BrowserWindow): void
}

export function createElectronMainWindow(options: ElectronMainWindowOptions): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: options.windowState.width,
    height: options.windowState.height,
    x: options.windowState.x,
    y: options.windowState.y,
    minWidth: 600,
    minHeight: 600,
    icon: options.iconPath,
    show: false,
    transparent: options.isMac,
    backgroundColor: options.isMac ? undefined : options.backgroundColor,
    titleBarStyle: options.isMac ? 'hidden' : 'default',
    trafficLightPosition: options.isMac ? MAIN_TRAFFIC_LIGHT_POSITION : undefined,
    webPreferences: {
      preload: options.preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })

  mainWindow.once('ready-to-show', () => {
    if (options.shouldSuppressActivation()) {
      mainWindow.hide()
      return
    }
    if (options.windowState.isMaximized) {
      mainWindow.maximize()
    }
    mainWindow.show()
  })

  mainWindow.on('resize', () => options.saveWindowState(mainWindow))
  mainWindow.on('move', () => options.saveWindowState(mainWindow))
  mainWindow.on('close', (event) => {
    options.saveWindowState(mainWindow)
    if (options.shouldHideForVoice()) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  if (options.isDevelopment) {
    mainWindow.webContents.openDevTools()
  }

  return mainWindow
}
