import type { ElectronAPI } from '@/types'
import type { PlatformApi, PlatformCapabilities } from './types'

const electronCapabilities: PlatformCapabilities = {
  localFileSystem: true,
  workspaceFileSystem: true,
  nativeWindowControls: true,
  shellTools: true,
  terminal: true,
  embeddedBrowser: true,
  clipboardWrite: true,
  desktopWindows: true,
  globalMenuEvents: true,
}

export function createElectronPlatformApi(electronAPI: ElectronAPI): PlatformApi {
  const extras = {
    environment: 'electron' as const,
    capabilities: electronCapabilities,
    getCapabilities: async () => electronCapabilities,
  }
  // Forward per-access instead of snapshotting: tests (and the preload bridge
  // on reload) replace individual methods on window.electronAPI after this
  // wrapper is created, and those replacements must stay visible.
  return new Proxy(extras as PlatformApi, {
    get: (target, prop, receiver) =>
      prop in extras ? Reflect.get(target, prop, receiver) : Reflect.get(electronAPI, prop),
    has: (target, prop) => prop in extras || prop in electronAPI,
  })
}
