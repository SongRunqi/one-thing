import { app } from 'electron'

type MaybePromise<T> = T | Promise<T>
type CleanupFn = () => MaybePromise<void>

export interface ElectronBeforeQuitAppLike {
  on(event: 'before-quit', listener: () => MaybePromise<void>): void
}

export interface ElectronBeforeQuitCleanupOptions {
  markVoiceQuitRequested: CleanupFn
  shutdownVoiceService: CleanupFn
  shutdownMusicService: CleanupFn
  unregisterGlobalWindowShortcuts: CleanupFn
  shutdownGateway: CleanupFn
  shutdownMCP: CleanupFn
  shutdownACP: CleanupFn
  killTrackedDetachedChildren: CleanupFn
  killAllTerminals: CleanupFn
  killAllBrowserTabs: CleanupFn
  /**
   * 拆插件系统。
   *
   * 必须排在 shutdownEventSystem **之前**:插件 dispose 还要往总线发 cleared
   * (R6 的状态清扫)与 catalog-changed,总线先关的话那些事件发进一个没人听的
   * 地方,而账本里留着记录。
   *
   * 这一项此前是缺的:`backend.shutdown()` 里那句
   * `getPluginManager()?.shutdown()` 只有 apps/server 会走到,而 server 从不
   * bootstrap 插件(那里恒为 null);真正跑插件的 Electron 主进程退出走的是本表,
   * 表里没有插件项 —— 又一次"结构对了但没接到真实作用点上"。
   */
  shutdownPlugins: CleanupFn
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
  await options.shutdownMusicService()
  options.unregisterGlobalWindowShortcuts()

  await options.shutdownGateway()
  await options.shutdownMCP()
  await options.shutdownACP()

  options.killTrackedDetachedChildren()
  options.killAllTerminals()
  options.killAllBrowserTabs()

  await options.shutdownPlugins()
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
