import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

interface ElectronAppModule {
  app?: {
    isPackaged?: boolean
    getVersion?(): string
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

export function resolveElectronAppVersion(electronModule: unknown): string | undefined {
  const electron = electronModule as ElectronAppModule | null | undefined
  if (!electron || typeof electron !== 'object') return undefined
  const version = electron.app?.getVersion?.()
  return typeof version === 'string' && version.trim() ? version.trim() : undefined
}

/**
 * 宿主版本 —— 插件 minAppVersion 判定的输入。
 *
 * 走 require('electron') 而不是让调用方 import:main-process.ts 受
 * "apps/electron owns Electron ready handler" 规则约束,不许直接 import electron。
 */
export function getElectronAppVersion(): string | undefined {
  try {
    return resolveElectronAppVersion(require('electron'))
  } catch {
    return undefined
  }
}

export function getElectronResourcesPath(): string | undefined {
  return process.resourcesPath
}
