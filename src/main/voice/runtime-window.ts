import { BrowserWindow } from 'electron'
import path from 'path'
import { IPC_CHANNELS, type VoiceRuntimeCommand } from '../../shared/ipc.js'

let runtimeWindow: BrowserWindow | null = null
let runtimeReady = false
let pendingCommands: VoiceRuntimeCommand[] = []

function getRendererDevUrl(): string {
  return process.env.ELECTRON_RENDERER_URL || 'http://127.0.0.1:5173'
}

export function getVoiceRuntimeWindow(): BrowserWindow | null {
  return runtimeWindow && !runtimeWindow.isDestroyed() ? runtimeWindow : null
}

export function ensureVoiceRuntimeWindow(): BrowserWindow {
  const existing = getVoiceRuntimeWindow()
  if (existing) return existing

  const isDevelopment = process.env.NODE_ENV === 'development'
  runtimeReady = false
  runtimeWindow = new BrowserWindow({
    width: 360,
    height: 240,
    show: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })

  runtimeWindow.on('closed', () => {
    runtimeWindow = null
    runtimeReady = false
    pendingCommands = []
  })

  if (isDevelopment) {
    runtimeWindow.loadURL(`${getRendererDevUrl()}/#/voice-runtime`)
  } else {
    runtimeWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
      hash: '/voice-runtime',
    })
  }

  return runtimeWindow
}

export function sendVoiceRuntimeCommand(command: VoiceRuntimeCommand): void {
  const win = getVoiceRuntimeWindow()
  if (!win || !runtimeReady) {
    pendingCommands.push(command)
    return
  }
  win.webContents.send(IPC_CHANNELS.VOICE_RUNTIME_COMMAND, command)
}

export function markVoiceRuntimeReady(): void {
  runtimeReady = true
}

export function isVoiceRuntimeReady(): boolean {
  return runtimeReady && Boolean(getVoiceRuntimeWindow())
}

export function flushVoiceRuntimeCommands(): void {
  const win = getVoiceRuntimeWindow()
  if (!win || !runtimeReady || pendingCommands.length === 0) return

  const commands = pendingCommands
  pendingCommands = []
  for (const command of commands) {
    win.webContents.send(IPC_CHANNELS.VOICE_RUNTIME_COMMAND, command)
  }
}

export function destroyVoiceRuntimeWindow(): void {
  const win = getVoiceRuntimeWindow()
  if (win) {
    win.destroy()
  }
  runtimeWindow = null
  runtimeReady = false
  pendingCommands = []
}
