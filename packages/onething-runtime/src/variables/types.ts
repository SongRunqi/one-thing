export interface ContextVariable {
  name: string
  value: string
  values?: string[]
  scope?: 'global' | 'session'
  description?: string
  readonly?: boolean
  updatedAt?: number
}

export interface VariableContext {
  sessionId: string
  messageId?: string
  toolCallId?: string
}

export interface SetInput {
  name: string
  value: string
  scope?: 'global' | 'session'
  description?: string
}

export interface VariableProvider {
  readonly id: string
  readonly priority?: number

  list(ctx: VariableContext): Promise<ContextVariable[]> | ContextVariable[]
  claims(name: string): boolean

  set?(ctx: VariableContext, input: SetInput): Promise<ContextVariable> | ContextVariable
  append?(ctx: VariableContext, input: SetInput): Promise<ContextVariable> | ContextVariable
  remove?(ctx: VariableContext, input: SetInput): Promise<ContextVariable> | ContextVariable
  delete?(ctx: VariableContext, name: string): Promise<void> | void

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

export const VARIABLE_LIMITS = {
  MAX_VALUE_BYTES: 4 * 1024,
  MAX_PER_PROVIDER: 64,
  MAX_NAME_LENGTH: 64,
} as const

export const RESERVED_NAMES = Object.freeze([
  'workdir',
  'cwd',
  'home',
  'ai_note_dir',
  'user_note_dir',
  'work_note_dir',
] as const)

export type ReservedName = (typeof RESERVED_NAMES)[number]
