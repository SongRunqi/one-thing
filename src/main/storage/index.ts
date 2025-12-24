/**
 * Storage Module Entry Point
 *
 * 提供统一的存储访问入口
 * 支持 File 和 SQLite 两种存储后端
 */

import type { IStorageProvider, StorageConfig, StorageType } from './interfaces.js'
import { FileStorageProvider } from './file-storage.js'
import { SQLiteStorageProvider } from './sqlite-storage.js'

// 全局存储实例
let storageInstance: IStorageProvider | null = null

// 当前存储类型
let currentStorageType: StorageType = 'file'

/**
 * 创建存储提供者
 */
function createStorageProvider(config: StorageConfig): IStorageProvider {
  switch (config.type) {
    case 'file':
      return new FileStorageProvider()

    case 'sqlite':
      return new SQLiteStorageProvider()

    case 'postgres':
      // TODO: 未来实现 PostgreSQL 存储
      throw new Error('PostgreSQL storage not implemented yet')

    default:
      return new FileStorageProvider()
  }
}

/**
 * 初始化存储系统
 * Default to SQLite for vector search support
 */
export async function initializeStorage(
  type: StorageType = 'sqlite'
): Promise<IStorageProvider> {
  if (storageInstance && currentStorageType === type) {
    return storageInstance
  }

  // Close existing storage if switching types
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

/**
 * 获取存储实例
 * 如果未初始化，自动使用 SQLite 存储
 */
export function getStorage(): IStorageProvider {
  if (!storageInstance) {
    // 自动初始化为 SQLite 存储
    storageInstance = new SQLiteStorageProvider()
    currentStorageType = 'sqlite'
    // 同步初始化
    storageInstance.initialize().catch(console.error)
  }
  return storageInstance
}

/**
 * 获取 SQLite 存储实例（用于高级操作）
 */
export function getSQLiteStorage(): SQLiteStorageProvider | null {
  if (storageInstance instanceof SQLiteStorageProvider) {
    return storageInstance
  }
  return null
}

/**
 * 关闭存储连接
 */
export async function closeStorage(): Promise<void> {
  if (storageInstance) {
    await storageInstance.close()
    storageInstance = null
  }
}

// 导出类型和接口
export * from './interfaces.js'
export { FileStorageProvider } from './file-storage.js'
export { SQLiteStorageProvider, type MemoryLink, type MemoryLinkRelationship } from './sqlite-storage.js'
