import type { OnethingUsageLedger } from './ledger.js'
import type { OnethingUsageBillingMode, OnethingUsageLedgerRecord, OnethingUsageTokens } from './types.js'

export type OnethingUsageSummaryGranularity = 'day' | 'week' | 'month'

const DEFAULT_BUCKET_COUNT: Record<OnethingUsageSummaryGranularity, number> = {
  day: 30,
  week: 12,
  month: 12,
}

export interface OnethingUsageBreakdownEntry {
  key: string
  usage: OnethingUsageTokens
  apiCostUSD: number
  subscriptionCostUSD: number
  records: number
}

export interface OnethingUsageBucket {
  bucketKey: string
  startTs: number
  endTs: number
  usage: OnethingUsageTokens
  apiCostUSD: number
  subscriptionCostUSD: number
  records: number
  byProvider: OnethingUsageBreakdownEntry[]
  byModel: OnethingUsageBreakdownEntry[]
  byPlatform: OnethingUsageBreakdownEntry[]
}

export interface OnethingUsageSummaryRequest {
  granularity: OnethingUsageSummaryGranularity
  /** Number of trailing buckets to return. Defaults: 30 day / 12 week / 12 month. */
  count?: number
  now?: number
}

export interface OnethingUsageSummaryResult {
  granularity: OnethingUsageSummaryGranularity
  buckets: OnethingUsageBucket[]
  totalApiCostUSD: number
  totalSubscriptionCostUSD: number
}

function zeroUsage(): OnethingUsageTokens {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 0 }
}

function addUsage(a: OnethingUsageTokens, b: OnethingUsageTokens): OnethingUsageTokens {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
    reasoning: a.reasoning + b.reasoning,
    total: a.total + b.total,
  }
}

function startOfLocalDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function addDays(ts: number, days: number): number {
  const d = new Date(ts)
  d.setDate(d.getDate() + days)
  return d.getTime()
}

function startOfLocalMonth(ts: number): number {
  const d = new Date(ts)
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function addMonths(ts: number, months: number): number {
  const d = new Date(ts)
  d.setMonth(d.getMonth() + months)
  return d.getTime()
}

/** Monday-start ISO week containing ts. */
function startOfIsoWeek(ts: number): number {
  const d = new Date(startOfLocalDay(ts))
  const isoDayOfWeek = (d.getDay() + 6) % 7 // 0 = Monday
  d.setDate(d.getDate() - isoDayOfWeek)
  return d.getTime()
}

function dayKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function monthKey(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** ISO 8601 week key, e.g. '2026-W28'. Week 1 is the week containing the year's first Thursday. */
function isoWeekKey(weekStartTs: number): string {
  const thursday = addDays(weekStartTs, 3)
  const d = new Date(thursday)
  const year = d.getFullYear()
  const jan1 = new Date(year, 0, 1).getTime()
  const week = Math.floor((thursday - startOfIsoWeek(jan1)) / (7 * 86400000)) + 1
  return `${year}-W${String(week).padStart(2, '0')}`
}

function bucketRange(granularity: OnethingUsageSummaryGranularity, ts: number): { start: number; end: number; key: string } {
  if (granularity === 'day') {
    const start = startOfLocalDay(ts)
    return { start, end: addDays(start, 1), key: dayKey(start) }
  }
  if (granularity === 'week') {
    const start = startOfIsoWeek(ts)
    return { start, end: addDays(start, 7), key: isoWeekKey(start) }
  }
  const start = startOfLocalMonth(ts)
  return { start, end: addMonths(start, 1), key: monthKey(start) }
}

function stepBack(granularity: OnethingUsageSummaryGranularity, ts: number): number {
  if (granularity === 'day') return addDays(ts, -1)
  if (granularity === 'week') return addDays(ts, -7)
  return addMonths(ts, -1)
}

function emptyBreakdownMap(): Map<string, OnethingUsageBreakdownEntry> {
  return new Map()
}

function accumulateBreakdown(
  map: Map<string, OnethingUsageBreakdownEntry>,
  key: string,
  record: OnethingUsageLedgerRecord,
): void {
  const entry = map.get(key) ?? { key, usage: zeroUsage(), apiCostUSD: 0, subscriptionCostUSD: 0, records: 0 }
  entry.usage = addUsage(entry.usage, record.usage)
  entry.records += 1
  if (record.costUSD != null) {
    if (record.billing === 'subscription') entry.subscriptionCostUSD += record.costUSD
    else entry.apiCostUSD += record.costUSD
  }
  map.set(key, entry)
}

function costForBilling(record: OnethingUsageLedgerRecord, billing: OnethingUsageBillingMode): number {
  return record.costUSD != null && record.billing === billing ? record.costUSD : 0
}

/** Buckets already-loaded records into day/week/month totals plus per-provider/model/platform breakdowns. */
export function computeOnethingUsageSummary(
  records: OnethingUsageLedgerRecord[],
  request: OnethingUsageSummaryRequest,
): OnethingUsageSummaryResult {
  const now = request.now ?? Date.now()
  const count = request.count ?? DEFAULT_BUCKET_COUNT[request.granularity]

  const ranges: Array<{ start: number; end: number; key: string }> = []
  let cursor = now
  for (let i = 0; i < count; i++) {
    ranges.unshift(bucketRange(request.granularity, cursor))
    cursor = stepBack(request.granularity, cursor)
  }

  const buckets: OnethingUsageBucket[] = ranges.map(range => ({
    bucketKey: range.key,
    startTs: range.start,
    endTs: range.end,
    usage: zeroUsage(),
    apiCostUSD: 0,
    subscriptionCostUSD: 0,
    records: 0,
    byProvider: [],
    byModel: [],
    byPlatform: [],
  }))

  const providerMaps = buckets.map(() => emptyBreakdownMap())
  const modelMaps = buckets.map(() => emptyBreakdownMap())
  const platformMaps = buckets.map(() => emptyBreakdownMap())

  const overallStart = ranges[0]?.start ?? now
  const overallEnd = ranges[ranges.length - 1]?.end ?? now

  let totalApiCostUSD = 0
  let totalSubscriptionCostUSD = 0

  for (const record of records) {
    if (record.ts < overallStart || record.ts >= overallEnd) continue
    const index = ranges.findIndex(range => record.ts >= range.start && record.ts < range.end)
    if (index === -1) continue
    const bucket = buckets[index]
    bucket.usage = addUsage(bucket.usage, record.usage)
    bucket.records += 1
    const apiCost = costForBilling(record, 'api')
    const subscriptionCost = costForBilling(record, 'subscription')
    bucket.apiCostUSD += apiCost
    bucket.subscriptionCostUSD += subscriptionCost
    totalApiCostUSD += apiCost
    totalSubscriptionCostUSD += subscriptionCost
    accumulateBreakdown(providerMaps[index], record.providerId, record)
    accumulateBreakdown(modelMaps[index], record.modelId, record)
    accumulateBreakdown(platformMaps[index], record.platform, record)
  }

  buckets.forEach((bucket, index) => {
    bucket.byProvider = Array.from(providerMaps[index].values())
    bucket.byModel = Array.from(modelMaps[index].values())
    bucket.byPlatform = Array.from(platformMaps[index].values())
  })

  return {
    granularity: request.granularity,
    buckets,
    totalApiCostUSD,
    totalSubscriptionCostUSD,
  }
}

/** Reads the ledger for the needed range and computes the bucketed summary. */
export async function getOnethingUsageSummary(
  ledger: OnethingUsageLedger,
  request: OnethingUsageSummaryRequest,
): Promise<OnethingUsageSummaryResult> {
  const now = request.now ?? Date.now()
  const count = request.count ?? DEFAULT_BUCKET_COUNT[request.granularity]
  let rangeStart = now
  for (let i = 0; i < count; i++) rangeStart = stepBack(request.granularity, rangeStart)
  const start = bucketRange(request.granularity, rangeStart).start
  const end = bucketRange(request.granularity, now).end
  const records = await ledger.readRecordsInRange(start, end)
  return computeOnethingUsageSummary(records, request)
}

export interface OnethingSessionUsageTotal {
  apiCostUSD: number
  subscriptionCostUSD: number
  turnCount: number
  usage: OnethingUsageTokens
}

/**
 * Total cost/usage for one session — a live in-session readout, distinct
 * from the day/week/month settings summary above. Scans the whole ledger
 * since a session's records may span multiple monthly files; fine at
 * personal-use volume, revisit with a per-session index if the ledger grows.
 */
export async function getOnethingSessionUsageTotal(
  ledger: OnethingUsageLedger,
  sessionId: string,
): Promise<OnethingSessionUsageTotal> {
  const records = await ledger.readRecordsInRange(0, Date.now() + 86_400_000)
  const total: OnethingSessionUsageTotal = {
    apiCostUSD: 0,
    subscriptionCostUSD: 0,
    turnCount: 0,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 0 },
  }
  for (const record of records) {
    if (record.sessionId !== sessionId) continue
    total.turnCount += 1
    if (record.costUSD != null) {
      if (record.billing === 'subscription') total.subscriptionCostUSD += record.costUSD
      else total.apiCostUSD += record.costUSD
    }
    total.usage.input += record.usage.input
    total.usage.output += record.usage.output
    total.usage.cacheRead += record.usage.cacheRead
    total.usage.cacheWrite += record.usage.cacheWrite
    total.usage.reasoning += record.usage.reasoning
    total.usage.total += record.usage.total
  }
  return total
}
