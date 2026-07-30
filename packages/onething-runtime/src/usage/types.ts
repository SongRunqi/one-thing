export interface OnethingUsageTokens {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  reasoning: number
  total: number
}

export interface OnethingUsageUnitPrice {
  /** USD per 1M tokens */
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

export type OnethingUsageBillingMode = 'api' | 'subscription'

/**
 * Call categories that land in the ledger. Kept as named constants rather than
 * bare string literals at each call site so the usage panel's breakdown and the
 * producers cannot drift apart.
 *
 * Deliberately not a closed union on the record type: the ledger is
 * append-only and already holds historical values, so a narrowed type would
 * make old records unreadable.
 */
export const ONETHING_USAGE_SOURCES = {
  /** The main chat turn. */
  chat: 'chat',
  /** Session title generation. */
  title: 'title',
  /** soul-memory capture + idle review. */
  memory: 'memory',
  /** Skill review trigger. */
  skill: 'skill',
  /** Session table-of-contents segmentation. */
  toc: 'toc',
  /** Evals workbench / replay / judge. */
  evals: 'evals',
  /** Collab room response-willingness judgement (one small call per member). */
  collabWillingness: 'collab-willingness',
} as const

export type OnethingUsageSource =
  (typeof ONETHING_USAGE_SOURCES)[keyof typeof ONETHING_USAGE_SOURCES]

export interface OnethingUsageLedgerRecord {
  ts: number
  sessionId?: string
  providerId: string
  modelId: string
  /** Originating channel: electron | telegram | wechat | cli | api | server */
  platform: string
  /** Call category: chat | title | memory | goal | evals | ... */
  source: string
  billing: OnethingUsageBillingMode
  usage: OnethingUsageTokens
  unitPrice?: OnethingUsageUnitPrice
  costUSD?: number | null
  /** Set when the stream aborted mid-turn and usage may be incomplete. */
  partial?: boolean
}

export interface OnethingUsageRecordInput {
  ts?: number
  sessionId?: string
  providerId: string
  modelId: string
  platform: string
  source: string
  billing: OnethingUsageBillingMode
  usage: Partial<OnethingUsageTokens> & { input: number; output: number }
  unitPrice?: OnethingUsageUnitPrice
  partial?: boolean
}
