import { session } from 'electron'

export interface ElectronProxyConfig {
  enabled: boolean
  proxyRules?: string
  proxyBypassRules?: string
}

export type ElectronProxySetProxyConfig =
  | { mode: 'direct' }
  | {
    mode: 'fixed_servers'
    proxyRules?: string
    proxyBypassRules?: string
  }

export interface ElectronProxySessionLike {
  setProxy(config: ElectronProxySetProxyConfig): Promise<void>
}

export interface ApplyElectronNetworkProxyOptions {
  session?: ElectronProxySessionLike
}

export async function applyElectronNetworkProxySettings(
  proxy: ElectronProxyConfig,
  options: ApplyElectronNetworkProxyOptions = {},
): Promise<void> {
  const electronSession = options.session ?? session.defaultSession

  if (!proxy.enabled) {
    await electronSession.setProxy({ mode: 'direct' })
    return
  }

  await electronSession.setProxy({
    mode: 'fixed_servers',
    proxyRules: proxy.proxyRules,
    proxyBypassRules: proxy.proxyBypassRules,
  })
}
