/**
 * Project ID derivation.
 *
 * IDs are sha256-derived from the canonical path so they:
 *  - are stable: the same path always produces the same id
 *  - are filesystem-safe: hex characters, no escaping needed
 *  - decouple in-app references from the user's path string (which
 *    they may want to display with `~`)
 *
 * 16 hex chars = 64 bits. Collision risk for the realistic project
 * counts a single user has is negligible.
 */

import { createHash } from 'crypto'

const ID_LENGTH = 16

export function projectIdFromPath(path: string): string {
  return createHash('sha256')
    .update(canonicalize(path))
    .digest('hex')
    .slice(0, ID_LENGTH)
}

/**
 * Normalize a path before hashing so trivial differences (trailing
 * slash) don't produce different IDs. We do NOT expand `~` here —
 * the literal stored in the project record is what we hash, so
 * future `~` ↔ absolute path round-trips remain stable.
 */
function canonicalize(path: string): string {
  return path.replace(/\/+$/, '')
}
