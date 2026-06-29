import type { BrowserWindow, RenderProcessGoneDetails } from 'electron'

export const MAIN_WINDOW_RELOAD_DEBOUNCE_MS = 5000
export const MAIN_WINDOW_RESUME_HEALTH_CHECK_DELAY_MS = 800

export type ElectronMainWindowRendererHealth =
  | 'ready'
  | 'content'
  | 'loading'
  | 'blank'
  | 'missing-root'
  | 'crashed'
  | 'destroyed'
  | 'probe-failed'

export interface ElectronMainWindowRecoveryOptions {
  mainWindow: BrowserWindow
  loadMainWindowContent(mainWindow: BrowserWindow, reason: string): void
  logger?: Pick<Console, 'error' | 'log' | 'warn'>
  now?: () => number
  sleep?: (delayMs: number) => Promise<void>
  reloadDebounceMs?: number
  healthCheckDelayMs?: number
}

export interface ElectronMainWindowResumeRecoveryOptions extends ElectronMainWindowRecoveryOptions {
  source?: 'resume' | 'unlock-screen'
}

const MAIN_WINDOW_HEALTH_CHECK_SCRIPT = `
(() => {
  if (document.readyState === 'loading') return 'loading'
  if (document.querySelector('.app-shell, .error-boundary')) return 'ready'
  const appRoot = document.getElementById('app')
  if (!appRoot) return 'missing-root'
  if ((appRoot.textContent || '').trim().length > 0) return 'content'
  return 'blank'
})()
`

let lastMainWindowRendererReloadAt = Number.NEGATIVE_INFINITY

export function resetElectronMainWindowRecoveryState(): void {
  lastMainWindowRendererReloadAt = Number.NEGATIVE_INFINITY
}

export function reloadElectronMainWindowRenderer(
  options: ElectronMainWindowRecoveryOptions,
  reason: string,
): boolean {
  const logger = options.logger ?? console
  const mainWindow = options.mainWindow
  if (mainWindow.isDestroyed()) return false

  const now = options.now?.() ?? Date.now()
  const reloadDebounceMs = options.reloadDebounceMs ?? MAIN_WINDOW_RELOAD_DEBOUNCE_MS
  if (now - lastMainWindowRendererReloadAt < reloadDebounceMs) {
    logger.warn(`[Window] Skipping main window reload (${reason}); reload already attempted recently`)
    return false
  }
  lastMainWindowRendererReloadAt = now

  const url = mainWindow.webContents.getURL()
  logger.warn(`[Window] Reloading main window renderer (${reason})`, { url })

  try {
    if (url) {
      mainWindow.webContents.reloadIgnoringCache()
    } else {
      options.loadMainWindowContent(mainWindow, reason)
    }
    return true
  } catch (error) {
    logger.error(`[Window] Failed to reload main window renderer (${reason}):`, error)
    return false
  }
}

export function requestElectronMainWindowRepaint(
  mainWindow: BrowserWindow,
  reason: string,
  logger: Pick<Console, 'warn'> = console,
): void {
  if (mainWindow.isDestroyed()) return
  try {
    mainWindow.webContents.invalidate()
  } catch (error) {
    logger.warn(`[Window] Failed to invalidate main window after ${reason}:`, error)
  }
}

export async function getElectronMainWindowRendererHealth(
  mainWindow: BrowserWindow,
  logger: Pick<Console, 'warn'> = console,
): Promise<ElectronMainWindowRendererHealth> {
  if (mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return 'destroyed'
  if (mainWindow.webContents.isCrashed()) return 'crashed'
  if (mainWindow.webContents.isLoading()) return 'loading'

  try {
    const result = await mainWindow.webContents.executeJavaScript(MAIN_WINDOW_HEALTH_CHECK_SCRIPT, true)
    if (
      result === 'ready' ||
      result === 'content' ||
      result === 'loading' ||
      result === 'blank' ||
      result === 'missing-root'
    ) {
      return result
    }
    return 'probe-failed'
  } catch (error) {
    logger.warn('[Window] Main window renderer health probe failed:', error)
    return 'probe-failed'
  }
}

export function isHealthyElectronMainWindowRenderer(health: ElectronMainWindowRendererHealth): boolean {
  return health === 'ready' || health === 'content' || health === 'loading'
}

export function attachElectronMainWindowRecovery(options: ElectronMainWindowRecoveryOptions): void {
  const logger = options.logger ?? console
  const mainWindow = options.mainWindow

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame || errorCode === -3) return
    logger.error('[Window] Main window failed to load:', { errorCode, errorDescription, validatedURL })
    reloadElectronMainWindowRenderer(options, `did-fail-load:${errorCode}`)
  })

  mainWindow.webContents.on('render-process-gone', (_event, details: RenderProcessGoneDetails) => {
    logger.error('[Window] Main window renderer process gone:', details)
    if (details.reason === 'clean-exit') return
    reloadElectronMainWindowRenderer(options, `render-process-gone:${details.reason}`)
  })

  mainWindow.webContents.on('unresponsive', () => {
    logger.warn('[Window] Main window renderer became unresponsive')
  })

  mainWindow.webContents.on('responsive', () => {
    logger.log('[Window] Main window renderer became responsive')
  })
}

export async function recoverElectronMainWindowAfterSystemResume(
  options: ElectronMainWindowResumeRecoveryOptions,
): Promise<void> {
  const logger = options.logger ?? console
  const mainWindow = options.mainWindow
  const source = options.source ?? 'resume'
  if (mainWindow.isDestroyed()) return

  requestElectronMainWindowRepaint(mainWindow, source, logger)
  if (!mainWindow.isVisible()) return

  const sleep = options.sleep ?? (delayMs => new Promise<void>(resolve => setTimeout(resolve, delayMs)))
  await sleep(options.healthCheckDelayMs ?? MAIN_WINDOW_RESUME_HEALTH_CHECK_DELAY_MS)
  if (mainWindow.isDestroyed()) return

  const health = await getElectronMainWindowRendererHealth(mainWindow, logger)
  if (isHealthyElectronMainWindowRenderer(health)) {
    return
  }

  logger.warn(`[Window] Main window renderer unhealthy after ${source}:`, health)
  reloadElectronMainWindowRenderer(options, `${source}:${health}`)
}
