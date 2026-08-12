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
  /**
   * 模型是否需要**一直**知道这个值(agent-self-state-variables.md §R)。
   *
   * true 的变量每回合全量进 `<context-update>` 尾部块;其余的一个字节都不进
   * 请求,只能用 `variable` 工具的 keys/get 读。判据是"要不要一直在眼前",
   * 不是"变得快不快":笔记目录几个月不变,但每次写笔记都要用,所以是 state。
   */
  state?: boolean
  updatedAt?: number
}

/**
 * 旧盘上的三档 `volatility` 读到即转成 `state`(§R.6),旧文件不回写。
 *
 * 'turn' 是三档里唯一"要一直在眼前"的那一档;'static' 与从未有 provider 产出过的
 * 'on-demand' 都归 false —— 用户自建的 static 变量因此从"每回合都在眼前"变成
 * "要自己去读",想要旧行为显式写 `state: true`。
 */
export function readStateFlag(
  raw: { state?: unknown; volatility?: unknown } | null | undefined,
): boolean | undefined {
  if (typeof raw?.state === 'boolean') return raw.state
  if (typeof raw?.volatility === 'string') return raw.volatility === 'turn'
  return undefined
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
   * 显式声明这个变量要不要一直在模型眼前(见 ContextVariable.state)。
   * 自建变量默认 false —— 不写就是"要用时自己去读"。
   */
  state?: boolean
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
  'user_note_dir',
  'work_note_dir',
  'datetime',
  'git_branch',
  'background_jobs',
  'goal',
  // agent 自我状态的事实层(agent-self provider):只读、每回合现算。
  'my_cards',
  'my_rooms',
  'my_dms',
] as const)

export type ReservedName = (typeof RESERVED_NAMES)[number]
