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
  private writeChains = new Map<string, Promise<unknown>>()
  private externalUnsubs: Array<() => void> = []

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
          this.list(ctx)
            .then(snapshot => this.emit(ctx, snapshot))
            .catch(() => undefined)
        } else {
          this.broadcast()
        }
      })
      this.externalUnsubs.push(unsub)
    }
  }

  reset(): void {
    for (const unsub of this.externalUnsubs) {
      try {
        unsub()
      } catch {
        // Ignore teardown failures from host adapters.
      }
    }
    this.externalUnsubs = []
    this.providers = []
    this.listeners.clear()
    this.writeChains.clear()
  }

  async list(ctx: VariableContext): Promise<ContextVariable[]> {
    const chunks = await Promise.all(
      this.providers.map(provider => Promise.resolve(provider.list(ctx))),
    )
    // Sort within each provider chunk so the flattened list is ordered by
    // (provider priority, name). Identical variable sets must always render
    // to identical bytes, or prompt-cache prefixes get invalidated for free.
    const flat = chunks
      .map(chunk => [...chunk].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)))
      .flat()

    const dupes = findDuplicateNames(flat.map(variable => variable.name))
    if (dupes.length > 0) {
      throw new VariableError(
        'PROVIDER_CONFLICT',
        `Providers exposed duplicate variable names: ${dupes.join(', ')}`,
      )
    }
    return flat
  }

  async get(ctx: VariableContext, name: string): Promise<ContextVariable | undefined> {
    assertValidName(name)
    const all = await this.list(ctx)
    return all.find(variable => variable.name === name)
  }

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

  subscribe(listener: ChangeListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  get limits() {
    return VARIABLE_LIMITS
  }

  assertNotReserved(name: string): void {
    assertNotReserved(name)
  }

  private findClaimant(name: string, scope?: 'global' | 'session'): VariableProvider | undefined {
    if (scope === 'global') {
      return this.providers.find(provider => provider.id === 'global-store' && provider.claims(name))
        ?? this.providers.find(provider => provider.id !== 'session-store' && provider.claims(name))
    }
    if (scope === 'session') {
      return this.providers.find(provider => provider.id !== 'global-store' && provider.claims(name))
    }
    return this.providers.find(provider => provider.id !== 'global-store' && provider.claims(name))
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
      } catch (error) {
        console.error('[VariableRegistry] listener error:', error)
      }
    }
  }

  private broadcast(): void {
    this.emit({ sessionId: '' }, [])
  }
}

let singleton: VariableRegistry | null = null

export function getVariableRegistry(): VariableRegistry {
  if (!singleton) singleton = new VariableRegistry()
  return singleton
}

export function resetVariableRegistryForTests(): VariableRegistry {
  singleton = new VariableRegistry()
  return singleton
}
