import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
} from 'electron'

export interface ElectronVoiceTrayState {
  enabled?: boolean
  alwaysOn?: boolean
}

export interface ElectronVoiceTrayControllerOptions {
  getVoiceState(): ElectronVoiceTrayState | undefined
  getIconPath(): string
  getPlatform?: () => NodeJS.Platform
  shutdownVoiceService(): void | Promise<void>
}

export interface ElectronVoiceTrayController {
  attachMainWindow(window: BrowserWindow): void
  markQuitRequested(): void
  shouldHideMainWindowForVoice(): boolean
  update(): void
}

export function createElectronVoiceTrayController(
  options: ElectronVoiceTrayControllerOptions,
): ElectronVoiceTrayController {
  let tray: Tray | null = null
  let mainWindow: BrowserWindow | null = null
  let quitRequested = false

  function platform(): NodeJS.Platform {
    return options.getPlatform?.() ?? process.platform
  }

  function shouldShowTray(): boolean {
    const voice = options.getVoiceState()
    return Boolean(voice?.enabled && voice.alwaysOn && platform() !== 'darwin')
  }

  function showMainWindow(): void {
    if (!mainWindow || mainWindow.isDestroyed()) return
    mainWindow.show()
    mainWindow.focus()
  }

  function destroyTray(): void {
    tray?.destroy()
    tray = null
  }

  function createTray(): Tray {
    const image = nativeImage.createFromPath(options.getIconPath())
    const trayImage = image.isEmpty()
      ? nativeImage.createEmpty()
      : image.resize({ width: 18, height: 18 })
    const createdTray = new Tray(trayImage)
    createdTray.setToolTip('onething')
    createdTray.on('click', () => showMainWindow())
    return createdTray
  }

  function update(): void {
    const voice = options.getVoiceState()
    if (!shouldShowTray()) {
      destroyTray()
      return
    }

    tray ??= createTray()
    tray.setContextMenu(Menu.buildFromTemplate([
      {
        label: 'Show onething',
        click: () => showMainWindow(),
      },
      {
        label: voice?.enabled ? 'Voice On' : 'Voice Off',
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          quitRequested = true
          void options.shutdownVoiceService()
          app.quit()
        },
      },
    ]))
  }

  return {
    attachMainWindow(window: BrowserWindow): void {
      mainWindow = window
      update()
    },
    markQuitRequested(): void {
      quitRequested = true
    },
    shouldHideMainWindowForVoice(): boolean {
      if (quitRequested) return false
      if (platform() === 'darwin') return false
      const voice = options.getVoiceState()
      return Boolean(voice?.enabled && voice.alwaysOn)
    },
    update,
  }
}
