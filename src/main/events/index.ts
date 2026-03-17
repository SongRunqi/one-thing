/**
 * Event System — Singleton Access & Lifecycle
 *
 * Provides singleton getters for EventBus and StreamChannel,
 * plus init/shutdown functions called from main/index.ts.
 *
 * Usage:
 *   import { getEventBus, getStreamChannel } from '../events/index.js'
 *   const bus = getEventBus()
 *   bus.emit(sessionId, { type: 'stream:start', assistantMessageId })
 */

import type { WebContents } from 'electron'
import { EventBus } from './event-bus.js'
import { StreamChannel } from './stream-channel.js'
import { IPCBridge } from '../bridges/ipc-bridge.js'

let eventBus: EventBus | null = null
let streamChannel: StreamChannel | null = null
let ipcBridge: IPCBridge | null = null

/**
 * Get the singleton EventBus instance.
 * Throws if called before initializeEventSystem().
 */
export function getEventBus(): EventBus {
  if (!eventBus) {
    throw new Error('[EventSystem] EventBus not initialized. Call initializeEventSystem() first.')
  }
  return eventBus
}

/**
 * Get the singleton StreamChannel instance.
 * Throws if called before initializeEventSystem().
 */
export function getStreamChannel(): StreamChannel {
  if (!streamChannel) {
    throw new Error('[EventSystem] StreamChannel not initialized. Call initializeEventSystem() first.')
  }
  return streamChannel
}

/**
 * Initialize the event system. Called once from app.on('ready').
 */
export function initializeEventSystem(): void {
  if (eventBus) {
    console.warn('[EventSystem] Already initialized, skipping')
    return
  }

  eventBus = new EventBus()
  streamChannel = new StreamChannel()

  console.log('[EventSystem] Initialized (EventBus + StreamChannel)')
}

// ── IPCBridge lifecycle ──────────────────────────

/**
 * Initialize the IPCBridge for a BrowserWindow.
 * Called after createWindow() in app.on('ready') and app.on('activate').
 */
export function initializeIPCBridge(sender: WebContents): void {
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

/**
 * Shut down the event system. Called from app.on('before-quit').
 */
export function shutdownEventSystem(): void {
  if (eventBus) {
    eventBus.shutdown()
    eventBus = null
  }
  if (streamChannel) {
    streamChannel.shutdown()
    streamChannel = null
  }

  console.log('[EventSystem] Shut down')
}

// Re-export classes for direct use in tests
export { EventBus } from './event-bus.js'
export { StreamChannel } from './stream-channel.js'
export { RingBuffer } from './ring-buffer.js'
export { IPCBridge } from '../bridges/ipc-bridge.js'
