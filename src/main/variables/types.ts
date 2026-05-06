/**
 * Variable system core types.
 *
 * The variable subsystem exposes a registry that aggregates ContextVariable
 * snapshots from one or more providers. Each provider owns a disjoint set
 * of names (claims) and decides how its values are persisted, computed,
 * or validated. Providers register at boot; consumers (tool, prompt,
 * inspector, IPC) talk only to the registry.
 */

import type { ContextVariable } from '../../shared/ipc.js'

export type { ContextVariable }

/** Per-call context. Currently just the session, but kept as a struct for forward-compat. */
export interface VariableContext {
  sessionId: string
}

/** Inputs for a `set` operation. Description is optional metadata for the prompt/inspector. */
export interface SetInput {
  name: string
  value: string
  description?: string
}

/**
 * A pluggable source of variables.
 *
 * Providers may be:
 *  - read-only (omit `set`/`delete`)
 *  - synthesized at read time (e.g. from session index)
 *  - persisted in the session document
 *  - backed by external state (env, git, etc.) — use `onExternalChange`
 *    to notify the registry that the snapshot has changed.
 *
 * `claims(name)` is consulted before routing a write/delete. If no
 * provider claims a name, the registry rejects with NO_PROVIDER.
 */
export interface VariableProvider {
  readonly id: string
  /** Lower priority numbers are tried first when routing writes/deletes. Default: 100. */
  readonly priority?: number

  list(ctx: VariableContext): Promise<ContextVariable[]> | ContextVariable[]
  claims(name: string): boolean

  set?(ctx: VariableContext, input: SetInput): Promise<ContextVariable> | ContextVariable
  delete?(ctx: VariableContext, name: string): Promise<void> | void

  /**
   * Optional hot-update hook. Registry calls this once per provider on
   * registration and forwards `emit()` calls as a registry-level change
   * for the provider's own ctx (or a broadcast if the provider doesn't
   * know which session changed). Returns a teardown.
   */
  onExternalChange?(emit: (ctx?: VariableContext) => void): () => void
}

export type VariableErrorCode =
  | 'INVALID_NAME'
  | 'INVALID_VALUE'
  | 'READONLY'
  | 'NOT_FOUND'
  | 'RESERVED'
  | 'LIMIT_EXCEEDED'
  | 'WORKDIR_NOT_FOUND'
  | 'NO_PROVIDER'
  | 'PROVIDER_CONFLICT'

export class VariableError extends Error {
  constructor(public readonly code: VariableErrorCode, message: string) {
    super(message)
    this.name = 'VariableError'
  }
}

/** Limits enforced uniformly across providers (see validation.ts). */
export const VARIABLE_LIMITS = {
  /** Max bytes (UTF-8) of a single value. */
  MAX_VALUE_BYTES: 4 * 1024,
  /** Max number of variables a single provider may store per session. */
  MAX_PER_PROVIDER: 64,
  /** Max length of a name. Validation regex caps at 64 too. */
  MAX_NAME_LENGTH: 64,
} as const

/**
 * Names whose semantics are owned by built-in system providers.
 * SessionStoreProvider's catch-all `claims()` excludes these so the
 * AI can't shadow a system variable by `set` under the same name.
 *
 * If you add a new system-level provider, append its names here. Keep
 * the list small and meaningful — anything aspirational (`cwd`,
 * `home`) included for collision safety even when no provider currently
 * claims them.
 */
export const RESERVED_NAMES = Object.freeze([
  'workdir',
  'cwd',
  'home',
  'ai_note_dir',
  'user_note_dir',
] as const)

export type ReservedName = (typeof RESERVED_NAMES)[number]
