/**
 * Storage Module Entry Point
 *
 * Simplified after memory system removal.
 */

import type { IStorageProvider, StorageConfig, StorageType } from './interfaces.js'
import { FileStorageProvider } from './file-storage.js'

let storageInstance: IStorageProvider | null = null
let currentStorageType: StorageType = 'file'

function createStorageProvider(config: StorageConfig): IStorageProvider {
  switch (config.type) {
    case 'file':
    default:
      return new FileStorageProvider()
  }
}

export async function initializeStorage(
  type: StorageType = 'file'
): Promise<IStorageProvider> {
  if (storageInstance && currentStorageType === type) {
    return storageInstance
  }

  if (storageInstance) {
    await storageInstance.close()
  }

  const config: StorageConfig = { type }
  storageInstance = createStorageProvider(config)
  currentStorageType = type
  await storageInstance.initialize()

  console.log(`[Storage] Initialized with ${type} backend`)
  return storageInstance
}

export function getStorage(): IStorageProvider {
  if (!storageInstance) {
    storageInstance = new FileStorageProvider()
    currentStorageType = 'file'
    storageInstance.initialize().catch(console.error)
  }
  return storageInstance
}

export async function closeStorage(): Promise<void> {
  if (storageInstance) {
    await storageInstance.close()
    storageInstance = null
  }
}

export * from './interfaces.js'
export { FileStorageProvider } from './file-storage.js'
