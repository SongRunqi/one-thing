import { createRequire } from 'node:module'
import type { OnethingTokenCryptoAdapter } from '@onething/runtime/auth'

const require = createRequire(import.meta.url)

interface ElectronNetModule {
  net?: {
    fetch?: typeof fetch
  }
}

interface ElectronSafeStorageModule {
  safeStorage?: OnethingTokenCryptoAdapter
}

export function resolveElectronNetFetch(electronModule: unknown): typeof fetch | undefined {
  const electron = electronModule as ElectronNetModule | null | undefined
  const electronNet = electron && typeof electron === 'object' ? electron.net : undefined
  const candidate = electronNet?.fetch
  return typeof candidate === 'function' ? candidate.bind(electronNet) : undefined
}

export function resolveElectronSafeStorage(electronModule: unknown): OnethingTokenCryptoAdapter | undefined {
  const electron = electronModule as ElectronSafeStorageModule | null | undefined
  const safeStorage = electron && typeof electron === 'object' ? electron.safeStorage : undefined

  return safeStorage
    && typeof safeStorage.isEncryptionAvailable === 'function'
    && typeof safeStorage.encryptString === 'function'
    && typeof safeStorage.decryptString === 'function'
    ? safeStorage
    : undefined
}

export function getElectronNetFetch(): typeof fetch | undefined {
  try {
    return resolveElectronNetFetch(require('electron'))
  } catch {
    return undefined
  }
}

export function getElectronSafeStorage(): OnethingTokenCryptoAdapter | undefined {
  try {
    return resolveElectronSafeStorage(require('electron'))
  } catch {
    return undefined
  }
}
