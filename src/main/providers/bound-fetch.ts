/**
 * Application Fetch
 *
 * Produces a `fetch` implementation for main-process HTTP(S) requests.
 * When enabled in settings, it routes requests through the global application
 * proxy.
 */

import * as undici from 'undici'
import type { Dispatcher } from 'undici'
import type { ProxySettings } from '../../shared/ipc.js'
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

function dispatcherKey(proxy: ProxySettings | undefined): string {
  if (proxy) return `proxy#${proxy.url}#${proxy.bypassRules || ''}`
  return 'direct'
}

export function getAppDispatcher(proxy?: ProxySettings): Dispatcher {
  const key = dispatcherKey(proxy)
  let dispatcher = dispatcherCache.get(key)
  if (dispatcher) return dispatcher

  if (proxy) {
    if (proxy.url.toLowerCase().startsWith('socks5:')) {
      const Socks5ProxyAgent = (undici as any).Socks5ProxyAgent
      if (!Socks5ProxyAgent) {
        throw new Error('SOCKS5 proxy support is not available in this undici version.')
      }
      dispatcher = new Socks5ProxyAgent(proxy.url, {
        bodyTimeout: APP_FETCH_BODY_TIMEOUT_MS,
      })
    } else {
      dispatcher = new undici.ProxyAgent({
        uri: proxy.url,
        bodyTimeout: APP_FETCH_BODY_TIMEOUT_MS,
      } as any)
    }
  } else {
    dispatcher = new undici.Agent({
      bodyTimeout: APP_FETCH_BODY_TIMEOUT_MS,
    })
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
export function createAppFetch(options: { proxy?: ProxySettings } = {}): FetchFn {
  return (async (input: any, init?: any) => {
    const proxy = getActiveProxySettings(options.proxy)
    if (!proxy || shouldBypassProxy(input, proxy.bypassRules)) {
      return fetch(input, init)
    }

    const dispatcher = getAppDispatcher(proxy)
    try {
      return await undici.fetch(input, { ...(init || {}), dispatcher })
    } catch (error: any) {
      const target = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input?.url || String(input)
      const cause = error?.cause
      console.error('[Network] Proxied fetch failed:', {
        target,
        proxy: proxy.url,
        code: cause?.code || error?.code,
        message: cause?.message || error?.message,
      })
      throw error
    }
  }) as unknown as FetchFn
}

export function createRequiredAppFetch(options: { proxy?: ProxySettings } = {}): FetchFn {
  return createAppFetch(options)
}

export function createBoundFetch(): FetchFn {
  return createAppFetch()
}
