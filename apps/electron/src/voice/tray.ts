import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { ElectronBrowserWindow } from '@onething/electron-host/window/types'
import {
  createElectronVoiceTrayController,
  type ElectronVoiceTrayState,
} from './tray-controller.js'

export { createElectronVoiceTrayController } from './tray-controller.js'
export type {
  ElectronVoiceTrayController,
  ElectronVoiceTrayControllerOptions,
  ElectronVoiceTrayState,
} from './tray-controller.js'

export interface ConfigureVoiceTrayOptions {
  getVoiceState(): ElectronVoiceTrayState | undefined
  shutdownVoiceService(): void | Promise<void>
  getIconPath?: () => string
  getPlatform?: () => NodeJS.Platform
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function getDefaultVoiceTrayIconPath(): string {
  return path.join(__dirname, '../../resources/onething.png')
}

let voiceTray = createElectronVoiceTrayController({
  getVoiceState: () => undefined,
  getIconPath: getDefaultVoiceTrayIconPath,
  shutdownVoiceService: () => undefined,
})

export function configureVoiceTray(options: ConfigureVoiceTrayOptions): void {
  voiceTray = createElectronVoiceTrayController({
    getVoiceState: options.getVoiceState,
    getIconPath: options.getIconPath ?? getDefaultVoiceTrayIconPath,
    shutdownVoiceService: options.shutdownVoiceService,
    getPlatform: options.getPlatform,
  })
}

export function attachVoiceTrayMainWindow(window: ElectronBrowserWindow): void {
  voiceTray.attachMainWindow(window)
}

export function markVoiceQuitRequested(): void {
  voiceTray.markQuitRequested()
}

export function shouldHideMainWindowForVoice(): boolean {
  return voiceTray.shouldHideMainWindowForVoice()
}

export function updateVoiceTray(): void {
  voiceTray.update()
}
