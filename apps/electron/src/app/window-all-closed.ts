import { app } from 'electron'

export interface ElectronWindowAllClosedAppLike {
  on(event: 'window-all-closed', listener: () => void): void
  quit(): void
}

export interface ElectronWindowAllClosedOptions {
  isVoiceKeepAliveEnabled(): boolean
  app?: ElectronWindowAllClosedAppLike
  platform?: NodeJS.Platform
}

export function registerElectronWindowAllClosedHandler(
  options: ElectronWindowAllClosedOptions,
): void {
  const electronApp = options.app ?? app
  const platform = options.platform ?? process.platform

  electronApp.on('window-all-closed', () => {
    if (options.isVoiceKeepAliveEnabled()) return
    if (platform !== 'darwin') {
      electronApp.quit()
    }
  })
}
