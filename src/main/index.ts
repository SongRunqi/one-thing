import { app, BrowserWindow } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { createWindow } from './window.js'
import { initializeIPC, initializeMCP, shutdownMCP } from './ipc/handlers.js'
import { initializeStores } from './store.js'
import { initializeToolRegistry } from './tools/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null

app.on('ready', async () => {
  // Initialize stores and migrate data if needed
  initializeStores()

  // Initialize tool registry
  await initializeToolRegistry()

  // Initialize IPC handlers
  initializeIPC()

  // Initialize MCP system (connects to configured MCP servers)
  await initializeMCP()

  mainWindow = createWindow()
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

// Cleanup on quit
app.on('before-quit', async () => {
  await shutdownMCP()
})

export { mainWindow }
