/**
 * NetEase's dual-id model. `encryptedId` (32-hex) is what playback commands
 * want; `originalId` (numeric) rides along because `play` requires the pair.
 * These validators are the reason a hallucinated id cannot reach the player:
 * the DJ copies ids out of search results, and anything that does not look
 * like a real pair is dropped at the store boundary.
 */

import type { OnethingRadioProgrammeEntry } from '../../radio-store.js'
import type { MusicIdSchema } from '../types.js'

const ENCRYPTED_ID = /^[0-9a-fA-F]{32}$/

export const ncmIdSchema: MusicIdSchema = {
  normalizeEntry(record: Record<string, unknown>): OnethingRadioProgrammeEntry | null {
    const encryptedId = typeof record.encryptedId === 'string' ? record.encryptedId.trim() : ''
    // The DJ copies originalId out of search results, where it is a number.
    const originalId =
      typeof record.originalId === 'string'
        ? record.originalId.trim()
        : typeof record.originalId === 'number'
          ? String(record.originalId)
          : ''
    // Both ids or the entry is unplayable — the player needs the pair.
    if (!ENCRYPTED_ID.test(encryptedId) || !/^\d+$/.test(originalId)) return null
    return {
      encryptedId,
      originalId,
      title: typeof record.title === 'string' && record.title ? record.title : '未知曲目',
      note: typeof record.note === 'string' && record.note ? record.note : undefined,
      say: typeof record.say === 'string' && record.say.trim() ? record.say.trim() : undefined,
      playFlag: typeof record.playFlag === 'boolean' ? record.playFlag : undefined,
    }
  },
  validateSpinId(id: string): boolean {
    return ENCRYPTED_ID.test(id)
  },
}
