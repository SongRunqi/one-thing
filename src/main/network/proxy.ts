import { session } from 'electron'
import type { ProxySettings, TestProxyResponse } from '../../shared/ipc.js'
import { clearAppDispatcherCache, createRequiredAppFetch, validateProxyUrl } from '../providers/bound-fetch.js'
import { getSettings } from '../stores/settings.js'

function normalizeBypassRules(rules?: string): string {
  return (rules || '')
    .split(/[;,]/)
    .map(rule => rule.trim())
    .filter(Boolean)
    .join(';')
}

export function buildElectronProxyRules(proxy?: ProxySettings): string | undefined {
  if (!proxy?.enabled) return undefined
  const validated = validateProxyUrl(proxy.url)
  if (!validated.valid) {
    throw new Error(validated.error)
  }
  return validated.normalizedUrl
}

export async function applyNetworkProxySettings(proxy: ProxySettings = getSettings().network?.proxy ?? {
  enabled: false,
  url: '',
}): Promise<void> {
  clearAppDispatcherCache()

  if (!proxy.enabled) {
    await session.defaultSession.setProxy({ mode: 'direct' })
    return
  }

  let proxyRules: string | undefined
  try {
    proxyRules = buildElectronProxyRules(proxy)
  } catch (error: any) {
    console.warn('[Network] Invalid proxy settings; Electron proxy was not applied:', error.message)
    await session.defaultSession.setProxy({ mode: 'direct' })
    return
  }

  await session.defaultSession.setProxy({
    mode: 'fixed_servers',
    proxyRules,
    proxyBypassRules: normalizeBypassRules(proxy.bypassRules),
  })
}

export async function testProxy(proxy: ProxySettings): Promise<TestProxyResponse> {
  if (!proxy.enabled) {
    return { success: false, error: 'Proxy is disabled.' }
  }

  const validated = validateProxyUrl(proxy.url)
  if (!validated.valid) {
    return { success: false, error: validated.error }
  }

  try {
    const fetchImpl = createRequiredAppFetch({
      proxy: {
        ...proxy,
        url: validated.normalizedUrl,
      },
    })
    const response = await fetchImpl('https://www.gstatic.com/generate_204', {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
    })
    return response.ok || response.status === 204
      ? { success: true, status: response.status }
      : { success: false, status: response.status, error: `Proxy test returned HTTP ${response.status}.` }
  } catch (error: any) {
    return { success: false, error: error.message || 'Proxy test failed.' }
  }
}
