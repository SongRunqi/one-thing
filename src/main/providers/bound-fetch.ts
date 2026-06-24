/**
 * Application Fetch
 *
 * Produces a `fetch` implementation for main-process HTTP(S) requests.
 * When enabled in settings, it routes requests through the global application
 * proxy.
 */

import * as undici from 'undici'
import type { Dispatcher } from 'undici'
import { isIP } from 'node:net'
import type { SocketConnectOpts } from 'node:net'
import { SocksClient } from 'socks'
import type { NetworkInterfaceSettings, ProxySettings } from '../../shared/ipc.js'
import { getSettings } from '../stores/settings.js'

type FetchFn = typeof globalThis.fetch
type AgentOptions = NonNullable<ConstructorParameters<typeof undici.Agent>[0]>
type ProxyAgentOptions = Exclude<ConstructorParameters<typeof undici.ProxyAgent>[0], string | URL>
type ProxyTlsOptions = {
  localAddress?: string
  timeout?: number | null
}
type ProxyDispatcherOptions = Omit<ProxyAgentOptions, 'uri' | 'proxyTls'> & {
  proxyTls?: ProxyTlsOptions
}
type Socks5ProxyAgentOptions = NonNullable<ConstructorParameters<typeof undici.Socks5ProxyAgent>[1]>
type Socks5ProxyAgentConstructor = typeof undici.Socks5ProxyAgent
type FetchErrorDetails = {
  code?: string
  message?: string
}
type ErrorWithCause = Error & {
  cause?: Error | FetchErrorDetails
}
type UndiciFetchInput = Parameters<typeof undici.fetch>[0]
type UndiciFetchInit = NonNullable<Parameters<typeof undici.fetch>[1]>

const dispatcherCache = new Map<string, Dispatcher>()
// AI streams can legitimately pause for more than Undici's 300s default while
// a reasoning model works; callers still cancel through AbortSignal.
const APP_FETCH_BODY_TIMEOUT_MS = 0

export function validateProxyUrl(url: string): { valid: true; normalizedUrl: string } | { valid: false; error: string } {
  const trimmed = url.trim()
  if (!trimmed) return { valid: false, error: 'Proxy URL is required when proxy is enabled.' }

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { valid: false, error: 'Proxy URL is not a valid URL.' }
  }

  const protocol = parsed.protocol.toLowerCase()
  if (!['http:', 'https:', 'socks5:'].includes(protocol)) {
    return { valid: false, error: 'Proxy URL must use http://, https://, or socks5://.' }
  }
  if (!parsed.hostname) {
    return { valid: false, error: 'Proxy URL must include a host.' }
  }

  return { valid: true, normalizedUrl: parsed.toString() }
}

function normalizeProxySettings(proxy?: ProxySettings): ProxySettings | undefined {
  if (!proxy?.enabled) return undefined
  const validated = validateProxyUrl(proxy.url)
  if (!validated.valid) {
    throw new Error(validated.error)
  }
  return {
    enabled: true,
    url: validated.normalizedUrl,
    bypassRules: proxy.bypassRules,
  }
}

function getActiveProxySettings(override?: ProxySettings): ProxySettings | undefined {
  if (override) return normalizeProxySettings(override)
  return normalizeProxySettings(getSettings().network?.proxy)
}

function normalizeNetworkInterfaceSettings(networkInterface?: NetworkInterfaceSettings): NetworkInterfaceSettings | undefined {
  if (!networkInterface?.enabled) return undefined
  const address = typeof networkInterface.address === 'string' ? networkInterface.address.trim() : ''
  if (!address) return undefined
  return {
    ...networkInterface,
    address,
  }
}

function getActiveNetworkInterfaceSettings(override?: NetworkInterfaceSettings): NetworkInterfaceSettings | undefined {
  if (override) return normalizeNetworkInterfaceSettings(override)
  return normalizeNetworkInterfaceSettings(getSettings().network?.networkInterface)
}

function splitBypassRules(rules?: string): string[] {
  return (rules || '')
    .split(/[;,]/)
    .map(rule => rule.trim())
    .filter(Boolean)
}

function hostnameMatchesRule(hostname: string, rule: string): boolean {
  const lowerHost = hostname.toLowerCase()
  const lowerRule = rule.toLowerCase()
  if (lowerRule === '<local>') return !lowerHost.includes('.')
  if (lowerRule === lowerHost) return true
  if (lowerRule.startsWith('*.')) {
    const suffix = lowerRule.slice(1)
    return lowerHost.endsWith(suffix)
  }
  if (lowerRule.endsWith('*')) {
    return lowerHost.startsWith(lowerRule.slice(0, -1))
  }
  return false
}

export function shouldBypassProxy(input: RequestInfo | URL, bypassRules?: string): boolean {
  let url: URL
  try {
    url = input instanceof URL ? input : new URL(String(input))
  } catch {
    return false
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  return splitBypassRules(bypassRules).some(rule => hostnameMatchesRule(hostname, rule))
}

function dispatcherKey(proxy: ProxySettings | undefined, networkInterface?: NetworkInterfaceSettings): string {
  const localAddress = networkInterface?.address || 'default'
  if (proxy) return `proxy#${proxy.url}#${proxy.bypassRules || ''}#${localAddress}`
  return `direct#${localAddress}`
}

function createDispatcherOptions(networkInterface?: NetworkInterfaceSettings): AgentOptions {
  return {
    bodyTimeout: APP_FETCH_BODY_TIMEOUT_MS,
    ...(networkInterface?.address ? { localAddress: networkInterface.address } : {}),
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').toLowerCase()
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname)
  if (normalized === 'localhost' || normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true
  if (isIP(normalized) === 4 && normalized.startsWith('127.')) return true
  return false
}

function shouldBindProxyConnection(proxy: ProxySettings, networkInterface?: NetworkInterfaceSettings): boolean {
  if (!networkInterface?.address) return false
  try {
    return !isLoopbackHostname(new URL(proxy.url).hostname)
  } catch {
    return true
  }
}

function createProxyDispatcherOptions(proxy: ProxySettings, networkInterface?: NetworkInterfaceSettings): ProxyDispatcherOptions {
  return {
    bodyTimeout: APP_FETCH_BODY_TIMEOUT_MS,
    ...(shouldBindProxyConnection(proxy, networkInterface)
      ? { proxyTls: { localAddress: networkInterface?.address } }
      : {}),
  }
}

function createSocks5ProxyAgent(proxy: ProxySettings, options: ProxyDispatcherOptions, networkInterface?: NetworkInterfaceSettings): Dispatcher {
  const Socks5ProxyAgent: Socks5ProxyAgentConstructor = undici.Socks5ProxyAgent
  if (!Socks5ProxyAgent) {
    throw new Error('SOCKS5 proxy support is not available in this undici version.')
  }

  if (!shouldBindProxyConnection(proxy, networkInterface)) {
    return new Socks5ProxyAgent(proxy.url, options as Socks5ProxyAgentOptions)
  }

  const localAddress = networkInterface!.address
  const proxyUrl = new URL(proxy.url)
  const proxyHost = normalizeHostname(proxyUrl.hostname)
  const proxyPort = Number(proxyUrl.port) || 1080
  const username = proxyUrl.username ? decodeURIComponent(proxyUrl.username) : undefined
  const password = proxyUrl.password ? decodeURIComponent(proxyUrl.password) : undefined
  const connectTimeout = Number(options.proxyTls?.timeout ?? 10000)

  const BoundSocks5ProxyAgent = class extends Socks5ProxyAgent {
    async createSocks5Connection(targetHost: string, targetPort: number) {
      const result = await SocksClient.createConnection({
        command: 'connect',
        destination: {
          host: targetHost,
          port: targetPort,
        },
        proxy: {
          host: proxyHost,
          port: proxyPort,
          type: 5,
          ...(username ? { userId: username } : {}),
          ...(password ? { password } : {}),
        },
        timeout: connectTimeout > 0 ? connectTimeout : 10000,
        socket_options: {
          localAddress,
        } as SocketConnectOpts,
      })

      return result.socket
    }
  }

  return new BoundSocks5ProxyAgent(proxy.url, options as Socks5ProxyAgentOptions)
}

export function getAppDispatcher(proxy?: ProxySettings, networkInterface?: NetworkInterfaceSettings): Dispatcher {
  const key = dispatcherKey(proxy, networkInterface)
  let dispatcher = dispatcherCache.get(key)
  if (dispatcher) return dispatcher

  if (proxy) {
    const proxyDispatcherOptions = createProxyDispatcherOptions(proxy, networkInterface)
    if (proxy.url.toLowerCase().startsWith('socks5:')) {
      dispatcher = createSocks5ProxyAgent(proxy, proxyDispatcherOptions, networkInterface)
    } else {
      dispatcher = new undici.ProxyAgent({
        uri: proxy.url,
        ...proxyDispatcherOptions,
      } as ProxyAgentOptions)
    }
  } else {
    const dispatcherOptions = createDispatcherOptions(networkInterface)
    dispatcher = new undici.Agent(dispatcherOptions)
  }

  if (!dispatcher) throw new Error('Failed to create app network dispatcher')
  dispatcherCache.set(key, dispatcher)
  return dispatcher
}

export function clearAppDispatcherCache(): void {
  dispatcherCache.clear()
}

function fetchInputToString(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url || String(input)
}

function errorToDetails(error: Error): FetchErrorDetails {
  const withCode = error as Error & { code?: string }
  return {
    code: withCode.code,
    message: error.message,
  }
}

function errorCauseToDetails(error: Error): FetchErrorDetails | undefined {
  const cause = (error as ErrorWithCause).cause
  if (!cause || typeof cause !== 'object') {
    return undefined
  }
  if (cause instanceof Error) {
    const withCode = cause as Error & { code?: string }
    return {
      code: withCode.code,
      message: cause.message,
    }
  }
  const details = cause as FetchErrorDetails
  return {
    code: details.code,
    message: details.message,
  }
}

/**
 * Create a fetch using the app network settings.
 * The proxy setting is resolved at request time so cached provider instances
 * pick up proxy changes without needing to recreate their SDK clients first.
 */
export function createAppFetch(options: { proxy?: ProxySettings; networkInterface?: NetworkInterfaceSettings } = {}): FetchFn {
  const appFetch: FetchFn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const proxy = getActiveProxySettings(options.proxy)
    const networkInterface = getActiveNetworkInterfaceSettings(options.networkInterface)
    const activeProxy = proxy && !shouldBypassProxy(input, proxy.bypassRules) ? proxy : undefined
    if (!activeProxy && !networkInterface) {
      return fetch(input, init)
    }

    const dispatcher = getAppDispatcher(activeProxy, networkInterface)
    try {
      const undiciInit = { ...(init || {}), dispatcher } as UndiciFetchInit
      const response = await undici.fetch(input as UndiciFetchInput, undiciInit)
      return response as Response
    } catch (error) {
      const target = fetchInputToString(input)
      const errorDetails = error instanceof Error
        ? errorToDetails(error)
        : { message: String(error) }
      const causeDetails = error instanceof Error ? errorCauseToDetails(error) : undefined
      console.error('[Network] App fetch failed:', {
        target,
        proxy: activeProxy?.url,
        localAddress: networkInterface?.address,
        code: causeDetails?.code || errorDetails.code,
        message: causeDetails?.message || errorDetails.message,
      })
      throw error
    }
  }

  return appFetch
}

export function createRequiredAppFetch(options: { proxy?: ProxySettings; networkInterface?: NetworkInterfaceSettings } = {}): FetchFn {
  return createAppFetch(options)
}

export function createBoundFetch(): FetchFn {
  return createAppFetch()
}
