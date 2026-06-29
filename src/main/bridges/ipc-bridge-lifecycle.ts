import { IPCBridge, type IPCBridgeSender } from './ipc-bridge.js'

let ipcBridge: IPCBridge | null = null

/**
 * Initialize the IPCBridge for a BrowserWindow.
 * Called after createWindow() in app.on('ready') and app.on('activate').
 */
export function initializeIPCBridge(sender: IPCBridgeSender): void {
  if (!ipcBridge) {
    ipcBridge = new IPCBridge()
  }
  ipcBridge.bind(sender)
  console.log('[EventSystem] IPCBridge initialized')
}

/**
 * Get the singleton IPCBridge instance.
 */
export function getIPCBridge(): IPCBridge | null {
  return ipcBridge
}

/**
 * Shut down the IPCBridge. Called when the BrowserWindow closes.
 */
export function shutdownIPCBridge(): void {
  if (ipcBridge) {
    ipcBridge.unbind()
    ipcBridge = null
  }
  console.log('[EventSystem] IPCBridge shut down')
}
