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
import { SocksClient } from 'socks'
import type { NetworkInterfaceSettings, ProxySettings } from '../../shared/ipc.js'
import { getSettings } from '../stores/settings.js'

type FetchFn = typeof globalThis.fetch

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

export function shouldBypassProxy(input: unknown, bypassRules?: string): boolean {
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

function createDispatcherOptions(networkInterface?: NetworkInterfaceSettings): Record<string, unknown> {
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

function createProxyDispatcherOptions(proxy: ProxySettings, networkInterface?: NetworkInterfaceSettings): Record<string, unknown> {
  return {
    bodyTimeout: APP_FETCH_BODY_TIMEOUT_MS,
    ...(shouldBindProxyConnection(proxy, networkInterface)
      ? { proxyTls: { localAddress: networkInterface?.address } }
      : {}),
  }
}

function createSocks5ProxyAgent(proxy: ProxySettings, options: Record<string, unknown>, networkInterface?: NetworkInterfaceSettings): Dispatcher {
  const Socks5ProxyAgent = (undici as any).Socks5ProxyAgent
  if (!Socks5ProxyAgent) {
    throw new Error('SOCKS5 proxy support is not available in this undici version.')
  }

  if (!shouldBindProxyConnection(proxy, networkInterface)) {
    return new Socks5ProxyAgent(proxy.url, options)
  }

  const localAddress = networkInterface!.address
  const proxyUrl = new URL(proxy.url)
  const proxyHost = normalizeHostname(proxyUrl.hostname)
  const proxyPort = Number(proxyUrl.port) || 1080
  const username = proxyUrl.username ? decodeURIComponent(proxyUrl.username) : undefined
  const password = proxyUrl.password ? decodeURIComponent(proxyUrl.password) : undefined
  const connectTimeout = Number((options.proxyTls as any)?.timeout ?? (options as any).connectTimeout ?? 10000)

  const BoundSocks5ProxyAgent = class extends (Socks5ProxyAgent as new (...args: any[]) => any) {
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
        } as any,
      })

      return result.socket
    }
  }

  return new BoundSocks5ProxyAgent(proxy.url, options) as unknown as Dispatcher
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
      } as any)
    }
  } else {
    const dispatcherOptions = createDispatcherOptions(networkInterface)
    dispatcher = new undici.Agent(dispatcherOptions as any)
  }

  if (!dispatcher) throw new Error('Failed to create app network dispatcher')
  dispatcherCache.set(key, dispatcher)
  return dispatcher
}

export function clearAppDispatcherCache(): void {
  dispatcherCache.clear()
}

/**
 * Create a fetch using the app network settings.
 * The proxy setting is resolved at request time so cached provider instances
 * pick up proxy changes without needing to recreate their SDK clients first.
 */
export function createAppFetch(options: { proxy?: ProxySettings; networkInterface?: NetworkInterfaceSettings } = {}): FetchFn {
  return (async (input: any, init?: any) => {
    const proxy = getActiveProxySettings(options.proxy)
    const networkInterface = getActiveNetworkInterfaceSettings(options.networkInterface)
    const activeProxy = proxy && !shouldBypassProxy(input, proxy.bypassRules) ? proxy : undefined
    if (!activeProxy && !networkInterface) {
      return fetch(input, init)
    }

    const dispatcher = getAppDispatcher(activeProxy, networkInterface)
    try {
      return await undici.fetch(input, { ...(init || {}), dispatcher })
    } catch (error: any) {
      const target = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input?.url || String(input)
      const cause = error?.cause
      console.error('[Network] App fetch failed:', {
        target,
        proxy: activeProxy?.url,
        localAddress: networkInterface?.address,
        code: cause?.code || error?.code,
        message: cause?.message || error?.message,
      })
      throw error
    }
  }) as unknown as FetchFn
}

export function createRequiredAppFetch(options: { proxy?: ProxySettings; networkInterface?: NetworkInterfaceSettings } = {}): FetchFn {
  return createAppFetch(options)
}

export function createBoundFetch(): FetchFn {
  return createAppFetch()
}
