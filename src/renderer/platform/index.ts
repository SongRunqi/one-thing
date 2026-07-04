import type { ElectronAPI } from '@/types'
import { createElectronPlatformApi } from './electron'
import { createWebPlatformApi } from './web'
import type { PlatformApi } from './types'

type WindowWithElectronApi = Window & {
  electronAPI?: ElectronAPI
}

function createPlatformApi(): PlatformApi {
  const electronAPI = (window as WindowWithElectronApi).electronAPI
  if (electronAPI) {
    return createElectronPlatformApi(electronAPI)
  }

  return createWebPlatformApi()
}

export const platformApi = createPlatformApi()
export type { PlatformApi, PlatformCapabilities, PlatformEnvironment } from './types'

