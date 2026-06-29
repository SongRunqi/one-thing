import { app } from 'electron'

type MaybePromise<T> = T | Promise<T>
type CleanupFn = () => MaybePromise<void>

export interface ElectronBeforeQuitAppLike {
  on(event: 'before-quit', listener: () => MaybePromise<void>): void
}

export interface ElectronBeforeQuitCleanupOptions {
  markVoiceQuitRequested: CleanupFn
  shutdownVoiceService: CleanupFn
  unregisterGlobalWindowShortcuts: CleanupFn
  shutdownGateway: CleanupFn
  shutdownMCP: CleanupFn
  shutdownACP: CleanupFn
  killTrackedDetachedChildren: CleanupFn
  shutdownStreamEngine: CleanupFn
  shutdownPermission: CleanupFn
  shutdownSessionLayer: CleanupFn
  shutdownEventSystem: CleanupFn
  flushAllPendingSaves: CleanupFn
  shutdownAppLogging: CleanupFn
  releaseDesktopStoreLock: CleanupFn
  app?: ElectronBeforeQuitAppLike
  logger?: Pick<Console, 'error'>
}

export function registerElectronBeforeQuitCleanup(
  options: ElectronBeforeQuitCleanupOptions,
): void {
  const electronApp = options.app ?? app
  const logger = options.logger ?? console

  electronApp.on('before-quit', async () => {
    await runElectronBeforeQuitCleanup(options, logger)
  })
}

export async function runElectronBeforeQuitCleanup(
  options: ElectronBeforeQuitCleanupOptions,
  logger: Pick<Console, 'error'> = options.logger ?? console,
): Promise<void> {
  options.markVoiceQuitRequested()
  await options.shutdownVoiceService()
  options.unregisterGlobalWindowShortcuts()

  await options.shutdownGateway()
  await options.shutdownMCP()
  await options.shutdownACP()

  options.killTrackedDetachedChildren()

  await options.shutdownStreamEngine()
  options.shutdownPermission()
  options.shutdownSessionLayer()
  options.shutdownEventSystem()

  try {
    await options.flushAllPendingSaves()
  } catch (err) {
    logger.error('[Shutdown] flushAllPendingSaves error:', err)
  }

  await options.shutdownAppLogging()
  await options.releaseDesktopStoreLock()
}
