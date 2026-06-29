import { powerMonitor, type BrowserWindow } from 'electron'

export type ElectronPowerResumeSource = 'resume' | 'unlock-screen'

export interface ElectronPowerMonitorLike {
  on(event: ElectronPowerResumeSource, listener: () => void): void
}

export interface ElectronPowerResumeHandlersOptions {
  getMainWindow(): BrowserWindow | null
  recoverMainWindow(mainWindow: BrowserWindow, source: ElectronPowerResumeSource): Promise<void>
  powerMonitor?: ElectronPowerMonitorLike
  logger?: Pick<Console, 'error'>
}

export function registerElectronPowerResumeHandlers(
  options: ElectronPowerResumeHandlersOptions,
): void {
  const monitor = options.powerMonitor ?? powerMonitor

  monitor.on('resume', () => {
    recoverAfterPowerEvent(options, 'resume', 'Resume')
  })

  monitor.on('unlock-screen', () => {
    recoverAfterPowerEvent(options, 'unlock-screen', 'Unlock')
  })
}

function recoverAfterPowerEvent(
  options: ElectronPowerResumeHandlersOptions,
  source: ElectronPowerResumeSource,
  label: string,
): void {
  const mainWindow = options.getMainWindow()
  if (!mainWindow || mainWindow.isDestroyed()) return

  const logger = options.logger ?? console
  options.recoverMainWindow(mainWindow, source)
    .catch(err => logger.error(`[Window] ${label} recovery failed:`, err))
}
