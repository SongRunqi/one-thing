/**
 * VariableRegistry — routes list/set/delete across registered providers,
 * serializes writes per session, and fans out change notifications.
 *
 * The registry is intentionally framework-free: it knows nothing about
 * EventBus, IPC, or session storage. Adapters wire those in at the
 * boundaries (see ipc.ts and the provider implementations).
 */

import {
  VARIABLE_LIMITS,
  VariableError,
  type ContextVariable,
  type SetInput,
  type VariableContext,
  type VariableProvider,
} from './types.js'
import { assertNotReserved, assertValidName, assertValidValue, findDuplicateNames } from './validation.js'

type ChangeListener = (ctx: VariableContext, snapshot: ContextVariable[]) => void

export class VariableRegistry {
  private providers: VariableProvider[] = []
  private listeners = new Set<ChangeListener>()
  /** Serialize writes per session so concurrent set/delete don't race on shared state. */
  private writeChains = new Map<string, Promise<unknown>>()
  private externalUnsubs: Array<() => void> = []

  /**
   * Register a provider. Providers are sorted by ascending `priority`
   * (default 100). IDs must be unique. The registry subscribes to the
   * provider's external-change hook (if any) and forwards events to
   * registry-level listeners as a snapshot refresh.
   */
  register(provider: VariableProvider): void {
    if (this.providers.some(p => p.id === provider.id)) {
      throw new VariableError(
        'PROVIDER_CONFLICT',
        `Provider with id "${provider.id}" is already registered`,
      )
    }
    this.providers.push(provider)
    this.providers.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100))

    if (provider.onExternalChange) {
      const unsub = provider.onExternalChange((ctx) => {
        if (ctx) {
          // Best-effort: re-list and notify. Errors swallowed because
          // this is a notification path; consumers will pick up state
          // on next read.
          this.list(ctx)
            .then(snap => this.emit(ctx, snap))
            .catch(() => undefined)
        } else {
          // No specific session — listeners that care must re-list.
          this.broadcast()
        }
      })
      this.externalUnsubs.push(unsub)
    }
  }

  /** For tests / shutdown. Unsubscribes all external hooks. */
  reset(): void {
    for (const unsub of this.externalUnsubs) {
      try { unsub() } catch { /* swallow */ }
    }
    this.externalUnsubs = []
    this.providers = []
    this.listeners.clear()
    this.writeChains.clear()
  }

  /** Aggregated, ordered snapshot. Throws if providers expose duplicate names. */
  async list(ctx: VariableContext): Promise<ContextVariable[]> {
    const chunks = await Promise.all(
      this.providers.map(p => Promise.resolve(p.list(ctx))),
    )
    const flat = chunks.flat()

    const dupes = findDuplicateNames(flat.map(v => v.name))
    if (dupes.length > 0) {
      throw new VariableError(
        'PROVIDER_CONFLICT',
        `Providers exposed duplicate variable names: ${dupes.join(', ')}`,
      )
    }
    return flat
  }

  /** Find a single variable by exact name. */
  async get(ctx: VariableContext, name: string): Promise<ContextVariable | undefined> {
    assertValidName(name)
    const all = await this.list(ctx)
    return all.find(v => v.name === name)
  }

  /**
   * Route a write to the first provider that claims the name. Validates
   * shape *before* dispatch so providers can trust their inputs. Emits a
   * snapshot to listeners only on success.
   *
   * Declared `async` so synchronous validation errors surface as
   * rejections, not thrown exceptions — callers can rely on a uniform
   * Promise-returning contract.
   */
  async set(ctx: VariableContext, input: SetInput): Promise<ContextVariable> {
    assertValidName(input.name)
    assertValidValue(input.value)

    return this.serialize(ctx.sessionId, async () => {
      const provider = this.findClaimant(input.name, input.scope)
      if (!provider) {
        throw new VariableError(
          'NO_PROVIDER',
          `No provider accepts variable "${input.name}"`,
        )
      }
      if (!provider.set) {
        throw new VariableError(
          'READONLY',
          `Variable "${input.name}" is read-only`,
        )
      }
      const result = await provider.set(ctx, input)
      await this.emitForWrite(ctx, input.scope)
      return result
    })
  }

  /**
   * Route an append to a provider-owned ordered variable.
   */
  async append(ctx: VariableContext, input: SetInput): Promise<ContextVariable> {
    assertValidName(input.name)
    assertValidValue(input.value)

    return this.serialize(ctx.sessionId, async () => {
      const provider = this.findClaimant(input.name, input.scope)
      if (!provider) {
        throw new VariableError(
          'NO_PROVIDER',
          `No provider accepts variable "${input.name}"`,
        )
      }
      if (!provider.append) {
        throw new VariableError(
          'READONLY',
          `Variable "${input.name}" does not support append`,
        )
      }
      const result = await provider.append(ctx, input)
      await this.emitForWrite(ctx, input.scope)
      return result
    })
  }

  /**
   * Route a remove to a provider-owned ordered variable.
   */
  async remove(ctx: VariableContext, input: SetInput): Promise<ContextVariable> {
    assertValidName(input.name)
    assertValidValue(input.value)

    return this.serialize(ctx.sessionId, async () => {
      const provider = this.findClaimant(input.name, input.scope)
      if (!provider) {
        throw new VariableError(
          'NO_PROVIDER',
          `No provider accepts variable "${input.name}"`,
        )
      }
      if (!provider.remove) {
        throw new VariableError(
          'READONLY',
          `Variable "${input.name}" does not support remove`,
        )
      }
      const result = await provider.remove(ctx, input)
      await this.emitForWrite(ctx, input.scope)
      return result
    })
  }

  /**
   * Route a delete to the claiming provider. NOT_FOUND if nobody owns
   * the name; READONLY if the provider lacks a delete capability.
   */
  async delete(ctx: VariableContext, name: string, scope?: 'global' | 'session'): Promise<void> {
    assertValidName(name)
    return this.serialize(ctx.sessionId, async () => {
      const provider = this.findClaimant(name, scope)
      if (!provider) {
        throw new VariableError('NOT_FOUND', `No variable named "${name}"`)
      }
      if (!provider.delete) {
        throw new VariableError(
          'READONLY',
          `Variable "${name}" is read-only`,
        )
      }
      await provider.delete(ctx, name)
      await this.emitForWrite(ctx, scope)
    })
  }

  /** Subscribe to snapshot changes. Returns an unsubscribe handle. */
  subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Limits exported for providers that enforce per-session caps. */
  get limits() {
    return VARIABLE_LIMITS
  }

  /** Reserved-name guard, exposed so providers can fail fast. */
  assertNotReserved(name: string): void {
    assertNotReserved(name)
  }

  // ── internals ───────────────────────────────────────────────

  private findClaimant(name: string, scope?: 'global' | 'session'): VariableProvider | undefined {
    if (scope === 'global') {
      return this.providers.find(p => p.id === 'global-store' && p.claims(name))
        ?? this.providers.find(p => p.id !== 'session-store' && p.claims(name))
    }
    if (scope === 'session') {
      return this.providers.find(p => p.id !== 'global-store' && p.claims(name))
    }
    return this.providers.find(p => p.id !== 'global-store' && p.claims(name))
  }

  private async emitForWrite(ctx: VariableContext, scope?: 'global' | 'session'): Promise<void> {
    const snapshot = await this.list(ctx)
    this.emit(ctx, snapshot)
    if (scope === 'global') this.broadcast()
  }

  private serialize<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
    const prev = this.writeChains.get(sessionId) ?? Promise.resolve()
    const next = prev.catch(() => undefined).then(task)
    this.writeChains.set(sessionId, next)
    // Drop the reference once the task settles to avoid leaking memory.
    next.finally(() => {
      if (this.writeChains.get(sessionId) === next) {
        this.writeChains.delete(sessionId)
      }
    }).catch(() => undefined)
    return next
  }

  private emit(ctx: VariableContext, snapshot: ContextVariable[]): void {
    for (const listener of this.listeners) {
      try {
        listener(ctx, snapshot)
      } catch (err) {
        console.error('[VariableRegistry] listener error:', err)
      }
    }
  }

  private broadcast(): void {
    // No specific session known — emit with a sentinel ctx whose sessionId
    // is empty. Listeners that care should re-list on their own. We still
    // include an empty snapshot so the call signature stays uniform.
    this.emit({ sessionId: '' }, [])
  }
}

let singleton: VariableRegistry | null = null

export function getVariableRegistry(): VariableRegistry {
  if (!singleton) singleton = new VariableRegistry()
  return singleton
}

/** Tests only — replace the singleton with a fresh registry. */
export function resetVariableRegistryForTests(): VariableRegistry {
  singleton = new VariableRegistry()
  return singleton
}
