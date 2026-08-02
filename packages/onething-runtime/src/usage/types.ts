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
  /** Collab room daily digest — one call per room per folded day (P2). */
  collabDigest: 'collab-digest',
  /**
   * 房间编排(collab-coordinator-plan.md):**一条用户消息一次**,产出
   * 「谁说、什么次序」的整份 waves。它取代的是 N 路意愿判定,所以这一格与
   * `collab-willingness` 是此消彼长的关系 —— 两条线并排看得见,才说得清换算法
   * 到底省了多少。
   */
  collabPlan: 'collab-plan',
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
