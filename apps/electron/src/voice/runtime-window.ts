import path from 'path'
import { fileURLToPath } from 'url'
import { IPC_CHANNELS, type VoiceRuntimeCommand } from '@shared/ipc.js'
import { getElectronRendererDevUrl } from '@onething/electron-host/window/renderer-targets'
import type { ElectronBrowserWindow } from '@onething/electron-host/window/types'
import { createElectronVoiceRuntimeWindowController } from './runtime-window-controller.js'

export { createElectronVoiceRuntimeWindowController } from './runtime-window-controller.js'
export type {
  ElectronVoiceRuntimeWindowController,
  ElectronVoiceRuntimeWindowControllerOptions,
  ElectronVoiceRuntimeWindowVisualOptions,
} from './runtime-window-controller.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const voiceRuntimeWindow = createElectronVoiceRuntimeWindowController<VoiceRuntimeCommand>({
  commandChannel: IPC_CHANNELS.VOICE_RUNTIME_COMMAND,
  getVisualOptions: () => ({
    isDevelopment: process.env.NODE_ENV === 'development',
    rendererDevUrl: getElectronRendererDevUrl(),
    rendererIndexPath: path.join(__dirname, '../renderer/index.html'),
    preloadPath: path.join(__dirname, '../preload/index.js'),
    routeHash: '/voice-runtime',
  }),
})

export function getVoiceRuntimeWindow(): ElectronBrowserWindow | null {
  return voiceRuntimeWindow.getWindow()
}

export function ensureVoiceRuntimeWindow(): ElectronBrowserWindow {
  return voiceRuntimeWindow.ensureWindow()
}

export function sendVoiceRuntimeCommand(command: VoiceRuntimeCommand): void {
  voiceRuntimeWindow.sendCommand(command)
}

export function markVoiceRuntimeReady(): void {
  voiceRuntimeWindow.markReady()
}

export function isVoiceRuntimeReady(): boolean {
  return voiceRuntimeWindow.isReady()
}

export function flushVoiceRuntimeCommands(): void {
  voiceRuntimeWindow.flushCommands()
}

export function destroyVoiceRuntimeWindow(): void {
  voiceRuntimeWindow.destroyWindow()
}
