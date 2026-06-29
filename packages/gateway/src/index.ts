import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  isCoreConversationRuntime,
  type CoreConversationRuntime,
} from '@onething/core/gateway-runtime'
import { TelegramChannel } from './channels/telegram/index.js'
import { WechatChannel } from './channels/wechat/index.js'
import {
  readAllowlistConfigFromEnv,
  readGatewayChannelIdsFromEnv,
  readPositiveInteger,
  readTelegramBotToken,
} from './config.js'
import {
  Allowlist,
  type Channel,
  Gateway,
  GatewayBridge,
  type GatewayCommandProvider,
  GatewaySessionRegistry,
  RateLimiter,
} from './core/index.js'

export {
  TelegramChannel,
} from './channels/telegram/index.js'
export {
  WechatChannel,
  clearAuthState as clearWechatAuthState,
} from './channels/wechat/index.js'
export type {
  WechatAuthEvent,
} from './channels/wechat/index.js'
export {
  isGatewayEnabledFromEnv,
  readGatewayChannelIdsFromEnv,
} from './config.js'
export type {
  GatewayChannelId,
} from './config.js'
export {
  Allowlist,
  Gateway,
  GatewayBridge,
  GatewaySessionRegistry,
  RateLimiter,
} from './core/index.js'
export type {
  AllowlistConfig,
  Channel,
  GatewayBridgeOptions,
  GatewayCommandExecutionRequest,
  GatewayCommandExecutionResult,
  GatewayCommandInfo,
  GatewayCommandProvider,
  GatewaySession,
  GatewaySessionRegistryOptions,
  InboundMessage,
  OutboundMessage,
  RateLimiterConfig,
} from './core/index.js'

export interface GatewayRuntime {
  gateway: Gateway
  startPromise?: Promise<void>
}

export interface StartGatewayOptions {
  runtime: CoreConversationRuntime
  env?: NodeJS.ProcessEnv
  channels?: Channel[]
  background?: boolean
  commandProvider?: GatewayCommandProvider
}

export interface StartGatewayFromEnvOptions {
  env?: NodeJS.ProcessEnv
  importRuntimeModule?: (specifier: string) => Promise<unknown>
  startGatewayImpl?: (options: StartGatewayOptions) => Promise<GatewayRuntime>
}

export async function startGateway(options: StartGatewayOptions): Promise<GatewayRuntime> {
  const env = options.env ?? process.env
  const allowlist = new Allowlist(readAllowlistConfigFromEnv(env))
  const rateLimiter = new RateLimiter({
    maxPerMinute: readPositiveInteger(env.GATEWAY_RATE_LIMIT, 10),
  })
  const registry = new GatewaySessionRegistry(options.runtime)
  const bridge = new GatewayBridge({
    allowlist,
    rateLimiter,
    registry,
    runtime: options.runtime,
    commandProvider: options.commandProvider,
  })
  const gateway = new Gateway(bridge)
  const channels = options.channels ?? createGatewayChannelsFromEnv(env)

  if (!channels.length) {
    throw new Error('No gateway channels configured. Set GATEWAY_CHANNELS=wechat,telegram or enable at least one supported channel.')
  }

  for (const channel of channels) {
    gateway.register(channel)
  }

  const startPromise = gateway.start()
  if (options.background) {
    return { gateway, startPromise }
  }

  await startPromise
  return { gateway, startPromise }
}

export function createGatewayChannelsFromEnv(env: NodeJS.ProcessEnv): Channel[] {
  return readGatewayChannelIdsFromEnv(env).map(channel => {
    if (channel === 'telegram') {
      return new TelegramChannel({
        botToken: readTelegramBotToken(env),
        apiBaseUrl: env.GATEWAY_TELEGRAM_API_BASE_URL ?? env.TELEGRAM_API_BASE_URL,
      })
    }

    return new WechatChannel()
  })
}

export async function startGatewayFromEnv(options: StartGatewayFromEnvOptions = {}): Promise<GatewayRuntime> {
  const env = options.env ?? process.env
  const runtime = await loadGatewayConversationRuntimeFromEnv(
    env,
    options.importRuntimeModule ?? importGatewayRuntimeModule,
  )
  return (options.startGatewayImpl ?? startGateway)({
    runtime,
    env,
  })
}

async function loadGatewayConversationRuntimeFromEnv(
  env: NodeJS.ProcessEnv,
  importRuntimeModule: (specifier: string) => Promise<unknown>,
): Promise<CoreConversationRuntime> {
  const moduleSpecifier = env.ONETHING_GATEWAY_RUNTIME_MODULE ?? env.GATEWAY_RUNTIME_MODULE
  if (!moduleSpecifier?.trim()) {
    throw new Error(
      'Standalone Gateway needs a real onething runtime. Set ONETHING_GATEWAY_RUNTIME_MODULE to a module that exports default/runtime/createGatewayRuntime returning an OnethingConversationRuntime from @onething/runtime.',
    )
  }

  const moduleExports = await importRuntimeModule(resolveRuntimeModuleSpecifier(moduleSpecifier))
  const runtime = await resolveRuntimeExport(moduleExports)
  if (!isCoreConversationRuntime(runtime)) {
    throw new Error(
      'Gateway runtime module must export default, runtime, conversationRuntime, createGatewayRuntime, createOnethingGatewayRuntime, or getConversationRuntime as an OnethingConversationRuntime.',
    )
  }
  return runtime
}

async function importGatewayRuntimeModule(specifier: string): Promise<unknown> {
  return import(specifier)
}

function resolveRuntimeModuleSpecifier(specifier: string): string {
  const trimmed = specifier.trim()
  if (trimmed.startsWith('.') || trimmed.startsWith('/')) {
    return pathToFileURL(resolve(trimmed)).href
  }
  return trimmed
}

async function resolveRuntimeExport(moduleExports: unknown): Promise<unknown> {
  const runtimeExport = selectRuntimeExport(moduleExports)
  return typeof runtimeExport === 'function'
    ? runtimeExport()
    : runtimeExport
}

function selectRuntimeExport(moduleExports: unknown): unknown {
  if (!moduleExports || typeof moduleExports !== 'object') return moduleExports
  const exports = moduleExports as Record<string, unknown>
  return exports.default
    ?? exports.runtime
    ?? exports.conversationRuntime
    ?? exports.createGatewayRuntime
    ?? exports.createOnethingGatewayRuntime
    ?? exports.getConversationRuntime
    ?? moduleExports
}

async function stopGateway(runtime: GatewayRuntime): Promise<void> {
  await runtime.gateway.stop()
}

async function main(): Promise<void> {
  const runtime = await startGatewayFromEnv()
  const stop = async (): Promise<void> => {
    await stopGateway(runtime)
    process.exit(0)
  }

  process.once('SIGINT', () => {
    void stop()
  })
  process.once('SIGTERM', () => {
    void stop()
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error) => {
    console.error('[Gateway] Fatal startup error:', error)
    process.exit(1)
  })
}
