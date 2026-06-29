import type { CoreConversationRuntime } from '@onething/core/gateway-runtime'
import { isGatewayEnabledFromEnv } from '@onething/gateway/config'
import type { Channel, GatewayCommandProvider } from '@onething/gateway'
import type { WechatAuthEvent, WechatChannel } from '@onething/gateway'
import type {
  AppSettings,
  GatewayStartRequest,
  GatewayStatus,
  GatewayWechatLoginStatus,
} from '@shared/ipc'
import {
  type GatewayRuntime,
} from '@onething/gateway'

export interface ElectronGatewayLifecycleOptions {
  getConversationRuntime(): CoreConversationRuntime
  getSettings?: () => Pick<AppSettings, 'channels'>
  env?: NodeJS.ProcessEnv
  logger?: Pick<Console, 'log'>
  commandProvider?: GatewayCommandProvider
  importGateway?: () => Promise<{
    startGateway(options: {
      runtime: CoreConversationRuntime
      env?: NodeJS.ProcessEnv
      channels?: Channel[]
      background?: boolean
      commandProvider?: GatewayCommandProvider
    }): Promise<GatewayRuntime>
    WechatChannel: typeof WechatChannel
    clearWechatAuthState?: () => Promise<void>
  }>
}

export interface ElectronGatewayLifecycle {
  isGatewayEnabled(env?: NodeJS.ProcessEnv): boolean
  initializeGateway(): Promise<void>
  shutdownGateway(): Promise<void>
  applySettings(settings?: Pick<AppSettings, 'channels'>): Promise<GatewayStatus>
  getStatus(): GatewayStatus
  startGateway(request?: GatewayStartRequest): Promise<GatewayStatus>
  stopGateway(): Promise<GatewayStatus>
  logoutWechat(): Promise<GatewayStatus>
}

export function createElectronGatewayLifecycle(
  options: ElectronGatewayLifecycleOptions,
): ElectronGatewayLifecycle {
  let gatewayRuntime: GatewayRuntime | null = null
  let starting = false
  let stopping = false
  let lastError: string | undefined
  let managedWechat = false
  let wechatState: GatewayStatus['wechat'] = createInitialWechatStatus(false)
  const env = options.env ?? process.env
  const logger = options.logger ?? console

  const isWechatEnabled = (settings = options.getSettings?.()): boolean =>
    settings?.channels?.wechat?.enabled === true

  const setWechatEnabled = (): void => {
    wechatState = {
      ...wechatState,
      enabled: isWechatEnabled(),
      running: Boolean(gatewayRuntime && managedWechat),
    }
  }

  const updateWechatState = (patch: Partial<GatewayStatus['wechat']>): void => {
    wechatState = {
      ...wechatState,
      ...patch,
      enabled: isWechatEnabled(),
      running: Boolean(gatewayRuntime && managedWechat),
      lastUpdatedAt: Date.now(),
    }
  }

  const handleWechatAuthEvent = (event: WechatAuthEvent): void => {
    switch (event.type) {
      case 'saved-auth':
      case 'confirmed':
        updateWechatState({
          loginStatus: 'logged-in',
          qrUrl: undefined,
          loggedIn: true,
          accountId: event.auth.ilinkUserId,
          botId: event.auth.ilinkBotId,
          baseUrl: event.auth.baseUrl,
          lastError: undefined,
        })
        break
      case 'qr':
        updateWechatState({
          loginStatus: 'waiting-for-scan',
          qrUrl: event.qrUrl,
          loggedIn: false,
          lastError: undefined,
        })
        break
      case 'status':
        updateWechatState({
          loginStatus: mapWechatQrStatus(event.status),
          baseUrl: event.baseUrl,
        })
        break
      case 'redirect':
        updateWechatState({ baseUrl: event.baseUrl })
        break
      case 'expired':
        updateWechatState({ loginStatus: 'expired', qrUrl: undefined, loggedIn: false })
        break
    }
  }

  return {
    isGatewayEnabled(checkEnv: NodeJS.ProcessEnv = env): boolean {
      return isGatewayEnabledFromEnv(checkEnv) || isWechatEnabled()
    },

    async initializeGateway(): Promise<void> {
      if (!isGatewayEnabledFromEnv(env) && !isWechatEnabled()) return
      await this.startGateway(isWechatEnabled() ? { channel: 'wechat' } : undefined)
    },

    async applySettings(settings?: Pick<AppSettings, 'channels'>): Promise<GatewayStatus> {
      const enabled = isWechatEnabled(settings)
      wechatState = {
        ...wechatState,
        enabled,
      }
      if (enabled) {
        return this.startGateway({ channel: 'wechat' })
      }
      if (!isGatewayEnabledFromEnv(env)) {
        return this.stopGateway()
      }
      return this.getStatus()
    },

    getStatus(): GatewayStatus {
      setWechatEnabled()
      return {
        running: Boolean(gatewayRuntime) && !starting,
        starting,
        stopping,
        enabled: isGatewayEnabledFromEnv(env) || isWechatEnabled(),
        lastError,
        wechat: { ...wechatState },
      }
    },

    async startGateway(request: GatewayStartRequest = {}): Promise<GatewayStatus> {
      if (gatewayRuntime || starting) return this.getStatus()
      if (request.channel && request.channel !== 'wechat') return this.getStatus()
      const shouldStartWechat = request.channel === 'wechat' || isWechatEnabled()
      if (!shouldStartWechat && !isGatewayEnabledFromEnv(env)) return this.getStatus()

      starting = true
      stopping = false
      lastError = undefined
      if (shouldStartWechat) {
        managedWechat = true
        updateWechatState({
          loginStatus: wechatState.loggedIn ? 'logged-in' : 'idle',
          lastError: undefined,
        })
      }

      try {
        const gatewayModule = await (options.importGateway ?? defaultImportGateway)()
        const channels = shouldStartWechat
          ? [
              new gatewayModule.WechatChannel({
                onAuthEvent: handleWechatAuthEvent,
              }),
            ]
          : undefined
        const startOptions = {
          runtime: options.getConversationRuntime(),
          env,
          channels,
          background: true,
          ...(options.commandProvider ? { commandProvider: options.commandProvider } : {}),
        }
        const runtime = await gatewayModule.startGateway(startOptions)
        gatewayRuntime = runtime
        runtime.startPromise
          ?.then(() => {
            if (gatewayRuntime !== runtime) return
            starting = false
            updateWechatState({ running: managedWechat && Boolean(gatewayRuntime) })
            logger.log('[Gateway] Started from Electron host')
          })
          .catch(error => {
            if (gatewayRuntime !== runtime) return
            const message = formatError(error)
            starting = false
            gatewayRuntime = null
            lastError = message
            updateWechatState({
              loginStatus: message === 'WechatChannel stopped' ? 'idle' : 'error',
              running: false,
              lastError: message,
            })
            if (message !== 'WechatChannel stopped') {
              logger.log(`[Gateway] Start failed: ${message}`)
            }
          })
        return this.getStatus()
      } catch (error) {
        starting = false
        lastError = formatError(error)
        updateWechatState({
          loginStatus: 'error',
          running: false,
          lastError,
        })
        return this.getStatus()
      }
    },

    async stopGateway(): Promise<GatewayStatus> {
      if (!gatewayRuntime) {
        starting = false
        managedWechat = false
        updateWechatState({ running: false })
        return this.getStatus()
      }

      const runtime = gatewayRuntime
      gatewayRuntime = null
      starting = false
      stopping = true
      try {
        await runtime.gateway.stop()
        logger.log('[Gateway] Stopped')
      } finally {
        stopping = false
        managedWechat = false
        updateWechatState({ running: false, loginStatus: wechatState.loggedIn ? 'logged-in' : 'idle' })
      }
      return this.getStatus()
    },

    async logoutWechat(): Promise<GatewayStatus> {
      await this.stopGateway()
      const gatewayModule = await (options.importGateway ?? defaultImportGateway)()
      await gatewayModule.clearWechatAuthState?.()
      wechatState = createInitialWechatStatus(isWechatEnabled())
      return isWechatEnabled()
        ? this.startGateway({ channel: 'wechat' })
        : this.getStatus()
    },

    async shutdownGateway(): Promise<void> {
      await this.stopGateway()
    },
  }
}

function createInitialWechatStatus(enabled: boolean): GatewayStatus['wechat'] {
  return {
    enabled,
    running: false,
    loginStatus: 'idle',
    loggedIn: false,
  }
}

function mapWechatQrStatus(status: string): GatewayWechatLoginStatus {
  if (status === 'scaned' || status === 'scaned_but_redirect') return 'scanned'
  if (status === 'confirmed' || status === 'binded_redirect') return 'confirmed'
  if (status === 'expired' || status === 'verify_code_blocked') return 'expired'
  if (status === 'need_verifycode') return 'error'
  return 'waiting-for-scan'
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function defaultImportGateway(): Promise<{
  startGateway(options: {
    runtime: CoreConversationRuntime
    env?: NodeJS.ProcessEnv
    channels?: Channel[]
    background?: boolean
    commandProvider?: GatewayCommandProvider
  }): Promise<GatewayRuntime>
  WechatChannel: typeof WechatChannel
  clearWechatAuthState?: () => Promise<void>
}> {
  return import('@onething/gateway')
}
