import type { ElectronAPI } from '@/types'
import type { PlatformApi, PlatformCapabilities } from './types'

const electronCapabilities: PlatformCapabilities = {
  localFileSystem: true,
  workspaceFileSystem: true,
  nativeWindowControls: true,
  shellTools: true,
  clipboardWrite: true,
  desktopWindows: true,
  globalMenuEvents: true,
}

export function createElectronPlatformApi(electronAPI: ElectronAPI): PlatformApi {
  return Object.assign({}, electronAPI, {
    environment: 'electron' as const,
    capabilities: electronCapabilities,
    getCapabilities: async () => electronCapabilities,
  })
}
