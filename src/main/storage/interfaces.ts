/**
 * Storage Abstraction Layer
 *
 * Simplified storage interfaces after memory system removal.
 * Kept for future extensibility.
 */

// ============================================
// Storage Factory Interface
// ============================================

export interface IStorageProvider {
  /**
   * Initialize storage
   */
  initialize(): Promise<void>

  /**
   * Close storage
   */
  close(): Promise<void>
}

// ============================================
// Storage Configuration
// ============================================

export type StorageType = 'file' | 'sqlite' | 'postgres'

export interface StorageConfig {
  type: StorageType
  dataDir?: string
  database?: {
    host?: string
    port?: number
    name?: string
    user?: string
    password?: string
  }
}
