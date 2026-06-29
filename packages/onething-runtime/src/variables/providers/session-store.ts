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
  read(sessionId: string): ContextVariable[]
  write(sessionId: string, variables: ContextVariable[]): void | Promise<void>
  onChange?(callback: (sessionId: string) => void): () => void
}

export interface SessionStoreProviderOptions {
  maxPerSession?: number
}

export class SessionStoreProvider implements VariableProvider {
  readonly id = 'session-store'
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
    return stored
      .filter(variable => !isReservedName(variable.name))
      .map(variable => ({
        name: variable.name,
        value: variable.value,
        scope: 'session',
        description: variable.description,
        updatedAt: variable.updatedAt,
      }))
  }

  claims(name: string): boolean {
    return !isReservedName(name)
  }

  async set(ctx: VariableContext, input: SetInput): Promise<ContextVariable> {
    assertNotReserved(input.name)

    const current = this.list(ctx)
    const without = current.filter(variable => variable.name !== input.name)
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
    const without = current.filter(variable => variable.name !== name)
    if (without.length === current.length) {
      throw new VariableError('NOT_FOUND', `No variable named "${name}"`)
    }
    await this.gateway.write(ctx.sessionId, without)
  }

  onExternalChange(emit: (ctx?: VariableContext) => void): () => void {
    if (!this.gateway.onChange) return () => undefined
    return this.gateway.onChange(sessionId => emit({ sessionId }))
  }
}
