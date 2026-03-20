/**
 * File-based Storage Implementation
 *
 * Simplified after memory system removal.
 */

import type { IStorageProvider } from './interfaces.js'
import { ensureStoreDirs } from '../stores/paths.js'

// ============================================
// File Storage Provider
// ============================================

export class FileStorageProvider implements IStorageProvider {
  async initialize(): Promise<void> {
    ensureStoreDirs()
  }

  async close(): Promise<void> {
    // File storage doesn't need cleanup
  }
}
