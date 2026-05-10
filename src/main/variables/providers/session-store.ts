/**
 * SessionStoreProvider — owns session-scoped, AI/user-writable
 * variables. Names that pass validation and aren't reserved fall to
 * this provider via a permissive `claims()`. Persistence is delegated
 * to a small gateway so the variable subsystem stays decoupled from
 * the session store.
 *
 * Per-session cap is enforced here rather than in the registry because
 * "how many variables a session may hold" is a property of this
 * provider's storage shape, not a global rule.
 */

import {
  VARIABLE_LIMITS,
  VariableError,
  type ContextVariable,
  type SetInput,
  type VariableContext,
  type VariableProvider,
} from '../types.js'
import { assertNotReserved, isReservedName } from '../validation.js'

export interface SessionStoreGateway {
  /** Returns the persisted custom variables for `sessionId`. */
  read(sessionId: string): ContextVariable[]
  /** Persists the full custom-variable list. Caller passes a fresh array. */
  write(sessionId: string, variables: ContextVariable[]): void | Promise<void>
  onChange?(callback: (sessionId: string) => void): () => void
}

export interface SessionStoreProviderOptions {
  /** Hard cap on per-session custom variables. Defaults to VARIABLE_LIMITS.MAX_PER_PROVIDER. */
  maxPerSession?: number
}

export class SessionStoreProvider implements VariableProvider {
  readonly id = 'session-store'
  /**
   * Catch-all priority — routes for names not snapped up by named
   * providers. Higher number so it's tried last in routing order.
   */
  readonly priority = 1000

  private readonly maxPerSession: number

  constructor(
    private readonly gateway: SessionStoreGateway,
    options: SessionStoreProviderOptions = {},
  ) {
    this.maxPerSession = options.maxPerSession ?? VARIABLE_LIMITS.MAX_PER_PROVIDER
  }

  list(ctx: VariableContext): ContextVariable[] {
    const stored = this.gateway.read(ctx.sessionId) ?? []
    // Defensive: drop any entry whose name matches a reserved system
    // variable. Such entries shouldn't exist (set() rejects them), but
    // session.json files written by older code may still carry them.
    return stored
      .filter(v => !isReservedName(v.name))
      .map(v => ({
        name: v.name,
        value: v.value,
        scope: 'session',
        description: v.description,
        updatedAt: v.updatedAt,
      }))
  }

  claims(name: string): boolean {
    // Take any non-reserved name. Reserved names belong to other
    // built-in providers (core/notes); they pass `claims()` there
    // with higher priority and won't reach us.
    return !isReservedName(name)
  }

  async set(ctx: VariableContext, input: SetInput): Promise<ContextVariable> {
    // Defensive — registry already validates name shape, but reserved-name
    // protection is this provider's responsibility since the registry
    // is name-agnostic.
    assertNotReserved(input.name)

    const current = this.list(ctx)
    const without = current.filter(v => v.name !== input.name)
    const isUpdate = current.length !== without.length

    if (!isUpdate && without.length >= this.maxPerSession) {
      throw new VariableError(
        'LIMIT_EXCEEDED',
        `Session already has ${without.length} custom variables (max ${this.maxPerSession})`,
      )
    }

    const next: ContextVariable = {
      name: input.name,
      value: input.value,
      scope: 'session',
      description: input.description,
      updatedAt: Date.now(),
    }
    await this.gateway.write(ctx.sessionId, [...without, next])
    return next
  }

  async delete(ctx: VariableContext, name: string): Promise<void> {
    assertNotReserved(name)

    const current = this.list(ctx)
    const without = current.filter(v => v.name !== name)
    if (without.length === current.length) {
      throw new VariableError('NOT_FOUND', `No variable named "${name}"`)
    }
    await this.gateway.write(ctx.sessionId, without)
  }

  onExternalChange(emit: (ctx?: VariableContext) => void): () => void {
    if (!this.gateway.onChange) return () => undefined
    return this.gateway.onChange((sessionId) => emit({ sessionId }))
  }
}
