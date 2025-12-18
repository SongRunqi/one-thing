import { BrowserWindow } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export function createWindow() {
  const isMac = process.platform === 'darwin'

  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    minWidth: 600,
    minHeight: 600,
    // Use hidden title bar on macOS to keep traffic lights
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    // Position traffic lights
    trafficLightPosition: isMac ? { x: 16, y: 20 } : undefined,
    webPreferences: {
      // Preload is bundled with esbuild to dist/preload/index.js
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const isDevelopment = process.env.NODE_ENV === 'development'

  if (isDevelopment) {
    // Load from Vite dev server
    mainWindow.loadURL('http://127.0.0.1:5173')
    mainWindow.webContents.openDevTools()
  } else {
    // Load from built files
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}
