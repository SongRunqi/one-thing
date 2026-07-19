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
