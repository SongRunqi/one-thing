import {
  createAndBindElectronMainWindow,
  registerElectronActivateHandler,
  type ElectronActivateOptions,
} from './activate.js'
import {
  configureElectronStorePathHost,
  registerElectronReadyHandler,
  type ElectronReadyOptions,
  type ElectronStorePathHostOptions,
} from './ready.js'
import {
  registerElectronBeforeQuitCleanup,
  type ElectronBeforeQuitCleanupOptions,
} from './before-quit.js'
import {
  registerElectronDidBecomeActiveHandler,
  type ElectronDidBecomeActiveOptions,
} from './did-become-active.js'
import {
  registerElectronWindowAllClosedHandler,
  type ElectronWindowAllClosedOptions,
} from './window-all-closed.js'
import {
  registerElectronMediaProtocol,
  type ElectronMediaProtocolOptions,
} from '../media/protocol.js'
import {
  registerElectronPluginProtocol,
  registerElectronPluginProtocolScheme,
  type ElectronPluginProtocolOptions,
} from '../plugins/protocol.js'
import {
  registerElectronPowerResumeHandlers,
  type ElectronPowerResumeHandlersOptions,
} from '../power/resume.js'
import {
  registerElectronDeepLinkProtocol,
  type ElectronDeepLinkProtocolOptions,
} from '../deeplink/protocol.js'

type MaybePromise<T> = T | Promise<T>

export type { ElectronActivateOptions } from './activate.js'

export interface RegisterElectronAppBootstrapOptions {
  storePathHost: ElectronStorePathHostOptions
  ready: Omit<ElectronReadyOptions, 'onReady'>
  mediaProtocol: ElectronMediaProtocolOptions
  /** 插件 webview 静态协议(C 期)。scheme 登记发生在 ready **之前**。 */
  pluginProtocol: ElectronPluginProtocolOptions
  /**
   * `onething://` 深链(H4)。**同步段登记**,与 privileged scheme 同一条理由的
   * 镜像:`open-url` 的第一次触发可能在 ready 之前(冷启动就是这样),监听挂晚了
   * 那条链就没人接。到达的 URL 先进队列,由渲染层的 `deeplink:ready` 放行。
   */
  deepLinkProtocol: ElectronDeepLinkProtocolOptions
  powerResume: ElectronPowerResumeHandlersOptions
  windowAllClosed: ElectronWindowAllClosedOptions
  didBecomeActive: ElectronDidBecomeActiveOptions
  beforeQuit: ElectronBeforeQuitCleanupOptions
  createMainWindowOptions(): ElectronActivateOptions
  onReady(): MaybePromise<void>
  afterMainWindowCreated(): MaybePromise<void>
  startPostWindowServices(): MaybePromise<void>
}

export function registerElectronAppBootstrap(options: RegisterElectronAppBootstrapOptions): void {
  configureElectronStorePathHost(options.storePathHost)

  // privileged scheme 的登记**只在 app ready 之前有效** —— 放进 onReady 里
  // Electron 会直接抛。这行必须留在同步段的最前面。
  registerElectronPluginProtocolScheme()

  // 同上:`open-url` 要在 ready 之前就有人听着。
  registerElectronDeepLinkProtocol(options.deepLinkProtocol)

  registerElectronReadyHandler({
    ...options.ready,
    onReady: async () => {
      registerElectronMediaProtocol(options.mediaProtocol)
      registerElectronPluginProtocol(options.pluginProtocol)
      await options.onReady()
      createAndBindElectronMainWindow(options.createMainWindowOptions())
      await options.afterMainWindowCreated()
      registerElectronPowerResumeHandlers(options.powerResume)
      await options.startPostWindowServices()
    },
  })

  registerElectronWindowAllClosedHandler(options.windowAllClosed)
  registerElectronActivateHandler(options.createMainWindowOptions())
  registerElectronDidBecomeActiveHandler(options.didBecomeActive)
  registerElectronBeforeQuitCleanup(options.beforeQuit)
}
