import {
  VARIABLE_LIMITS,
  VariableError,
  type ContextVariable,
  type SetInput,
  type VariableContext,
  type VariableProvider,
} from '../types.js'
import { assertNotReserved, isReservedName } from '../validation.js'

export interface GlobalStoreGateway {
  read(): ContextVariable[]
  write(variables: ContextVariable[]): void | Promise<void>
  onChange?(callback: () => void): () => void
}

export class GlobalStoreProvider implements VariableProvider {
  readonly id = 'global-store'
  readonly priority = 900

  constructor(
    private readonly gateway: GlobalStoreGateway,
    private readonly maxGlobal: number = VARIABLE_LIMITS.MAX_PER_PROVIDER,
  ) {}

  list(_ctx: VariableContext): ContextVariable[] {
    return (this.gateway.read() ?? [])
      .filter(variable => !isReservedName(variable.name))
      .map(variable => ({
        name: variable.name,
        value: variable.value,
        scope: 'global',
        description: variable.description,
        updatedAt: variable.updatedAt,
      }))
  }

  claims(name: string): boolean {
    return !isReservedName(name)
  }

  async set(_ctx: VariableContext, input: SetInput): Promise<ContextVariable> {
    assertNotReserved(input.name)

    const current = this.list({ sessionId: '' })
    const without = current.filter(variable => variable.name !== input.name)
    const isUpdate = current.length !== without.length

    if (!isUpdate && without.length >= this.maxGlobal) {
      throw new VariableError(
        'LIMIT_EXCEEDED',
        `Global variables already has ${without.length} variables (max ${this.maxGlobal})`,
      )
    }

    const next: ContextVariable = {
      name: input.name,
      value: input.value,
      scope: 'global',
      description: input.description,
      updatedAt: Date.now(),
    }
    await this.gateway.write([...without, next])
    return next
  }

  async delete(_ctx: VariableContext, name: string): Promise<void> {
    assertNotReserved(name)
    const current = this.list({ sessionId: '' })
    const without = current.filter(variable => variable.name !== name)
    if (without.length === current.length) {
      throw new VariableError('NOT_FOUND', `No global variable named "${name}"`)
    }
    await this.gateway.write(without)
  }

  onExternalChange(emit: (ctx?: VariableContext) => void): () => void {
    if (!this.gateway.onChange) return () => undefined
    return this.gateway.onChange(() => emit())
  }
}
