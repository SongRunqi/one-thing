import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import path from 'path'
import { getSettings } from '../stores/settings.js'
import { getVoiceServiceSafe } from './service.js'

let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
let quitRequested = false

export function attachVoiceTrayMainWindow(window: BrowserWindow): void {
  mainWindow = window
  updateVoiceTray()
}

export function markVoiceQuitRequested(): void {
  quitRequested = true
}

export function shouldHideMainWindowForVoice(): boolean {
  if (quitRequested) return false
  if (process.platform === 'darwin') return false
  const voice = getSettings().voice
  return Boolean(voice?.enabled && voice.alwaysOn)
}

export function updateVoiceTray(): void {
  const voice = getSettings().voice
  const shouldShow = Boolean(voice?.enabled && voice.alwaysOn && process.platform !== 'darwin')

  if (!shouldShow) {
    tray?.destroy()
    tray = null
    return
  }

  if (!tray) {
    const iconPath = path.join(__dirname, '../../resources/onething.png')
    const image = nativeImage.createFromPath(iconPath)
    tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image.resize({ width: 18, height: 18 }))
    tray.setToolTip('onething')
    tray.on('click', () => showMainWindow())
  }

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
        getVoiceServiceSafe()?.shutdown()
        app.quit()
      },
    },
  ]))
}

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.show()
  mainWindow.focus()
}

