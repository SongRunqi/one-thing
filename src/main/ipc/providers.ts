import { ipcMain } from 'electron'
import os from 'node:os'
import { IPC_CHANNELS } from '../../shared/ipc.js'
import { getAvailableProviders } from '../providers/index.js'
import type { NetworkInterfaceInfo } from '../../shared/ipc.js'

export function registerProvidersHandlers() {
  // Get all available providers
  ipcMain.handle(IPC_CHANNELS.GET_PROVIDERS, async () => {
    try {
      const providers = getAvailableProviders()
      return {
        success: true,
        providers,
      }
    } catch (error: any) {
      console.error('Error getting providers:', error)
      return {
        success: false,
        error: error.message || 'Failed to get providers',
      }
    }
  })

  // List local network interfaces for the outbound-NIC selector in provider settings.
  // Link-local IPv6 addresses are skipped — they're not valid source addresses for WAN traffic.
  ipcMain.handle(IPC_CHANNELS.GET_NETWORK_INTERFACES, async () => {
    try {
      const raw = os.networkInterfaces()
      const interfaces: NetworkInterfaceInfo[] = []

      for (const [name, addrs] of Object.entries(raw)) {
        if (!addrs) continue
        for (const a of addrs) {
          if (a.internal) continue
          // Skip link-local IPv6 (fe80::/10) — unusable for external requests.
          if (a.family === 'IPv6' && a.address.toLowerCase().startsWith('fe80')) continue
          interfaces.push({
            name,
            address: a.address,
            family: a.family as 'IPv4' | 'IPv6',
            internal: a.internal,
          })
        }
      }

      return { success: true, interfaces }
    } catch (error: any) {
      console.error('Error getting network interfaces:', error)
      return {
        success: false,
        error: error.message || 'Failed to get network interfaces',
      }
    }
  })
}
