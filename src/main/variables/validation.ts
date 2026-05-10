/**
 * Pure validation helpers shared by the registry and providers.
 *
 * Keeping these stateless and dependency-free means provider unit tests
 * can exercise the same rules without spinning up a registry.
 */

import { RESERVED_NAMES, VARIABLE_LIMITS, VariableError, type ReservedName } from './types.js'

const NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/

export function assertValidName(name: string): void {
  if (typeof name !== 'string' || name.length === 0) {
    throw new VariableError('INVALID_NAME', 'Variable name is required')
  }
  if (name.length > VARIABLE_LIMITS.MAX_NAME_LENGTH) {
    throw new VariableError(
      'INVALID_NAME',
      `Variable name exceeds ${VARIABLE_LIMITS.MAX_NAME_LENGTH} characters`,
    )
  }
  if (!NAME_RE.test(name)) {
    throw new VariableError(
      'INVALID_NAME',
      `Variable name must match /${NAME_RE.source}/ (got "${name}")`,
    )
  }
}

export function isReservedName(name: string): name is ReservedName {
  return (RESERVED_NAMES as readonly string[]).includes(name)
}

export function assertNotReserved(name: string): void {
  if (isReservedName(name)) {
    throw new VariableError(
      'RESERVED',
      `"${name}" is reserved by the system and cannot be set or deleted by user code`,
    )
  }
}

export function assertValidValue(value: string): void {
  if (typeof value !== 'string') {
    throw new VariableError('INVALID_VALUE', 'Variable value must be a string')
  }
  const bytes = Buffer.byteLength(value, 'utf8')
  if (bytes > VARIABLE_LIMITS.MAX_VALUE_BYTES) {
    throw new VariableError(
      'INVALID_VALUE',
      `Variable value exceeds ${VARIABLE_LIMITS.MAX_VALUE_BYTES} bytes (got ${bytes})`,
    )
  }
}

/**
 * Detect duplicate names within a single snapshot. Used by the registry
 * before publishing to consumers — a snapshot with duplicates points at
 * a provider configuration bug and we'd rather throw than ship a confusing
 * prompt.
 */
export function findDuplicateNames(names: string[]): string[] {
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const name of names) {
    if (seen.has(name)) dupes.add(name)
    else seen.add(name)
  }
  return [...dupes]
}
