/**
 * SQLite Storage - Stub
 *
 * Simplified after memory system removal.
 * Previously used better-sqlite3 + sqlite-vec for vector search.
 */

import type { IStorageProvider } from './interfaces.js'

// Memory link types (kept for export compatibility)
export type MemoryLinkRelationship = 'similar' | 'contradicts' | 'updates' | 'related'

export interface MemoryLink {
  id: string
  sourceId: string
  targetId: string
  relationship: MemoryLinkRelationship
  similarity: number
  createdAt: number
}

export class SQLiteStorageProvider implements IStorageProvider {
  async initialize(): Promise<void> {
    // No-op after memory system removal
  }

  async close(): Promise<void> {
    // No-op
  }
}
