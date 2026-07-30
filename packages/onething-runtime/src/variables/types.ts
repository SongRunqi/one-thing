/**
 * How often a variable's value is expected to change, which decides where it
 * is rendered:
 * - 'static' (default): stable across turns → the system-prompt
 *   <context-variables> block. A change busts the prompt-cache prefix,
 *   so only low-churn values belong here.
 * - 'turn': may change every turn (datetime, git branch) → injected after the
 *   latest user message as a <context-update> block, never into the prefix.
 * - 'on-demand': surfaced only in `variable` tool output and the Context
 *   inspector; never rendered into the prompt.
 */
export type VariableVolatility = 'static' | 'turn' | 'on-demand'

/**
 * Where a variable lives and who sees it:
 * - 'session' (default): this session only.
 * - 'agent': shared by every session bound to the same agent.
 * - 'project': attached to the active workdir's project — visible in any
 *   session whose workdir points at that directory.
 * - 'global': shared across all sessions.
 */
export type VariableScope = 'global' | 'session' | 'agent' | 'project'

/**
 * Value type of a custom variable. `value` always holds the canonical string
 * serialization — scalars as plain text, collections as compact JSON — and
 * writes are validated/normalized against the declared type
 * (see typed-values.ts). 'set' is a list with unique elements.
 */
export type VariableType = 'string' | 'number' | 'bool' | 'list' | 'map' | 'set'

export interface ContextVariable {
  name: string
  value: string
  values?: string[]
  type?: VariableType
  scope?: VariableScope
  description?: string
  readonly?: boolean
  volatility?: VariableVolatility
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
  scope?: VariableScope
  /**
   * Value type. On set: defaults to the variable's existing type, else
   * 'string'. On append to a missing variable: defaults to 'list'.
   */
  type?: VariableType
  description?: string
  /**
   * Custom variables may opt into 'turn' so frequent updates ride the
   * per-turn <context-update> channel instead of rewriting the system
   * prompt (which would invalidate the prompt-cache prefix every time).
   */
  volatility?: VariableVolatility
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
  | 'FORBIDDEN'

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

/**
 * Variables whose value is not just text: the system reads it and acts on it.
 * The note directories decide where notes are written and — because the
 * note-skills plugin scans them recursively for SKILL.md — which skills load.
 *
 * Repointing one changes what the assistant can reach, so the `variable` tool
 * raises a permission effect for these instead of writing them silently the way
 * it writes ordinary state. The assistant may still propose the change; the
 * user approves it.
 *
 * This list is the seed of a real capability registry — see
 * docs/design/capability-registry.md.
 */
export const CAPABILITY_VARIABLE_NAMES = Object.freeze([
  'ai_note_dir',
  'user_note_dir',
  'work_note_dir',
] as const)

export function isCapabilityVariable(name: string): boolean {
  return (CAPABILITY_VARIABLE_NAMES as readonly string[]).includes(name.trim())
}

export const RESERVED_NAMES = Object.freeze([
  'workdir',
  'cwd',
  'home',
  'ai_note_dir',
  'user_note_dir',
  'work_note_dir',
  'datetime',
  'git_branch',
  'background_jobs',
  'goal',
] as const)

export type ReservedName = (typeof RESERVED_NAMES)[number]
