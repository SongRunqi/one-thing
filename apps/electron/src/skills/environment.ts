import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

interface ElectronAppModule {
  app?: {
    isPackaged?: boolean
  }
}

export function resolveElectronAppIsPackaged(electronModule: unknown): boolean {
  const electron = electronModule as ElectronAppModule | null | undefined
  return Boolean(electron && typeof electron === 'object' && electron.app?.isPackaged)
}

export function getElectronAppIsPackaged(): boolean {
  try {
    return resolveElectronAppIsPackaged(require('electron'))
  } catch {
    return false
  }
}

export function getElectronResourcesPath(): string | undefined {
  return process.resourcesPath
}
