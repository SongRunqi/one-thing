import { describe, expect, it } from 'vitest'
import { computeOnethingUsageSummary } from '../summary.js'
import type { OnethingUsageLedgerRecord } from '../types.js'

function record(overrides: Partial<OnethingUsageLedgerRecord> & { ts: number }): OnethingUsageLedgerRecord {
  return {
    providerId: 'anthropic',
    modelId: 'claude-fable-5',
    platform: 'electron',
    source: 'chat',
    billing: 'api',
    usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 150 },
    costUSD: 0.001,
    ...overrides,
  }
}

describe('computeOnethingUsageSummary', () => {
  it('buckets records by local day and keeps api/subscription costs separate', () => {
    const day1 = new Date(2026, 6, 13, 10, 0, 0).getTime()
    const day2 = new Date(2026, 6, 14, 10, 0, 0).getTime()
    const records = [
      record({ ts: day1, costUSD: 0.001, billing: 'api' }),
      record({ ts: day1, costUSD: 0.002, billing: 'subscription', providerId: 'codex' }),
      record({ ts: day2, costUSD: 0.003, billing: 'api' }),
    ]

    const summary = computeOnethingUsageSummary(records, { granularity: 'day', count: 3, now: day2 })

    expect(summary.buckets).toHaveLength(3)
    const [, bucketDay1, bucketDay2] = summary.buckets
    expect(bucketDay1.bucketKey).toBe('2026-07-13')
    expect(bucketDay1.records).toBe(2)
    expect(bucketDay1.apiCostUSD).toBeCloseTo(0.001, 10)
    expect(bucketDay1.subscriptionCostUSD).toBeCloseTo(0.002, 10)
    expect(bucketDay2.bucketKey).toBe('2026-07-14')
    expect(bucketDay2.records).toBe(1)
    expect(summary.totalApiCostUSD).toBeCloseTo(0.004, 10)
    expect(summary.totalSubscriptionCostUSD).toBeCloseTo(0.002, 10)
  })

  it('breaks down usage by provider, model, and platform within a bucket', () => {
    const ts = new Date(2026, 6, 13, 10, 0, 0).getTime()
    const records = [
      record({ ts, providerId: 'anthropic', modelId: 'claude-fable-5', platform: 'electron' }),
      record({ ts, providerId: 'codex', modelId: 'gpt-5-codex', platform: 'telegram', billing: 'subscription' }),
    ]

    const summary = computeOnethingUsageSummary(records, { granularity: 'day', count: 1, now: ts })
    const bucket = summary.buckets[0]
    expect(bucket.byProvider.map(e => e.key).sort()).toEqual(['anthropic', 'codex'])
    expect(bucket.byModel.map(e => e.key).sort()).toEqual(['claude-fable-5', 'gpt-5-codex'])
    expect(bucket.byPlatform.map(e => e.key).sort()).toEqual(['electron', 'telegram'])
  })

  it('rolls day-level records up into ISO week buckets (Monday start)', () => {
    // 2026-07-13 is a Monday; 2026-07-19 is the following Sunday (same ISO week).
    const monday = new Date(2026, 6, 13, 9, 0, 0).getTime()
    const sunday = new Date(2026, 6, 19, 9, 0, 0).getTime()
    const nextMonday = new Date(2026, 6, 20, 9, 0, 0).getTime()
    const records = [
      record({ ts: monday, costUSD: 0.001 }),
      record({ ts: sunday, costUSD: 0.002 }),
      record({ ts: nextMonday, costUSD: 0.004 }),
    ]

    const summary = computeOnethingUsageSummary(records, { granularity: 'week', count: 2, now: nextMonday })
    expect(summary.buckets).toHaveLength(2)
    expect(summary.buckets[0].bucketKey).toBe('2026-W29')
    expect(summary.buckets[0].records).toBe(2)
    expect(summary.buckets[0].apiCostUSD).toBeCloseTo(0.003, 10)
    expect(summary.buckets[1].bucketKey).toBe('2026-W30')
    expect(summary.buckets[1].records).toBe(1)
  })

  it('rolls day-level records up into calendar month buckets', () => {
    const julEarly = new Date(2026, 6, 1, 9, 0, 0).getTime()
    const julLate = new Date(2026, 6, 31, 9, 0, 0).getTime()
    const aug = new Date(2026, 7, 5, 9, 0, 0).getTime()
    const records = [
      record({ ts: julEarly, costUSD: 0.001 }),
      record({ ts: julLate, costUSD: 0.002 }),
      record({ ts: aug, costUSD: 0.004 }),
    ]

    const summary = computeOnethingUsageSummary(records, { granularity: 'month', count: 2, now: aug })
    expect(summary.buckets.map(b => b.bucketKey)).toEqual(['2026-07', '2026-08'])
    expect(summary.buckets[0].records).toBe(2)
    expect(summary.buckets[0].apiCostUSD).toBeCloseTo(0.003, 10)
    expect(summary.buckets[1].records).toBe(1)
  })

  it('ignores records outside the requested range', () => {
    const inRange = new Date(2026, 6, 13).getTime()
    const outOfRange = new Date(2026, 0, 1).getTime()
    const records = [record({ ts: inRange }), record({ ts: outOfRange })]
    const summary = computeOnethingUsageSummary(records, { granularity: 'day', count: 1, now: inRange })
    expect(summary.buckets[0].records).toBe(1)
  })
})
