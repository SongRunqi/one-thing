import type { ElectronAPI } from '@/types'
import { createElectronPlatformApi } from './electron'
import { createWebPlatformApi } from './web'
import type { PlatformApi } from './types'

type WindowWithElectronApi = Window & {
  electronAPI?: ElectronAPI
}

let webApi: PlatformApi | undefined
const electronApiCache = new WeakMap<ElectronAPI, PlatformApi>()

function currentPlatformApi(): PlatformApi {
  // Resolved per access, not at module load: node-environment tests import
  // modules that reach this file without a window, and happy-dom tests stub
  // window.electronAPI after import.
  const electronAPI = typeof window === 'undefined'
    ? undefined
    : (window as WindowWithElectronApi).electronAPI
  if (electronAPI) {
    let api = electronApiCache.get(electronAPI)
    if (!api) {
      api = createElectronPlatformApi(electronAPI)
      electronApiCache.set(electronAPI, api)
    }
    return api
  }

  webApi ??= createWebPlatformApi()
  return webApi
}

export const platformApi: PlatformApi = new Proxy({} as PlatformApi, {
  get: (_target, prop) => Reflect.get(currentPlatformApi(), prop),
  has: (_target, prop) => Reflect.has(currentPlatformApi(), prop),
})

export type { PlatformApi, PlatformCapabilities, PlatformEnvironment } from './types'
