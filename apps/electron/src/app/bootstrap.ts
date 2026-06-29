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
  registerElectronPowerResumeHandlers,
  type ElectronPowerResumeHandlersOptions,
} from '../power/resume.js'

type MaybePromise<T> = T | Promise<T>

export type { ElectronActivateOptions } from './activate.js'

export interface RegisterElectronAppBootstrapOptions {
  storePathHost: ElectronStorePathHostOptions
  ready: Omit<ElectronReadyOptions, 'onReady'>
  mediaProtocol: ElectronMediaProtocolOptions
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

  registerElectronReadyHandler({
    ...options.ready,
    onReady: async () => {
      registerElectronMediaProtocol(options.mediaProtocol)
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
