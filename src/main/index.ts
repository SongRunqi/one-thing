import { app, BrowserWindow } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { createWindow } from './window.js'
import { initializeIPC } from './ipc/handlers.js'
import { initializeStores } from './store.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null

app.on('ready', async () => {
  // Initialize stores and migrate data if needed
  initializeStores()

  mainWindow = createWindow()
  initializeIPC()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    mainWindow = createWindow()
  }
})

export { mainWindow }
