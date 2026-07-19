import fsp from 'node:fs/promises'
import path from 'node:path'
import { buildOnethingUsageLedgerRecord } from './pricing.js'
import type { OnethingUsageLedgerRecord, OnethingUsageRecordInput } from './types.js'

export type { OnethingUsageLedgerRecord, OnethingUsageRecordInput } from './types.js'
export { buildOnethingUsageLedgerRecord, computeOnethingUsageCostUSD, resolveOnethingUsageBillingMode } from './pricing.js'

const FLUSH_INTERVAL_MS = 500
const MONTH_FILE_RE = /^usage-(\d{4})-(\d{2})\.jsonl$/

export function onethingUsageMonthKey(ts: number): string {
  const date = new Date(ts)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

export function onethingUsageLedgerFileName(ts: number): string {
  return `usage-${onethingUsageMonthKey(ts)}.jsonl`
}

function monthKeyToRange(monthKey: string): { start: number; end: number } | null {
  const match = MONTH_FILE_RE.exec(`usage-${monthKey}.jsonl`)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const start = new Date(year, month - 1, 1).getTime()
  const end = new Date(year, month, 1).getTime()
  return { start, end }
}

function parseUsageLedgerLine(line: string): OnethingUsageLedgerRecord | null {
  try {
    const parsed = JSON.parse(line)
    if (!parsed || typeof parsed.ts !== 'number' || typeof parsed.providerId !== 'string') return null
    return parsed as OnethingUsageLedgerRecord
  } catch {
    return null
  }
}

function safeJsonLine(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return JSON.stringify({ unserializable: true })
  }
}

export interface OnethingUsageLedgerOptions {
  ledgerDir?: string | (() => string)
  now?: () => number
}

/**
 * Append-only per-turn usage ledger. One JSONL file per calendar month
 * (~/.onething/usage/usage-YYYY-MM.jsonl by default); day/week/month
 * aggregation is computed by scanning records, not stored separately.
 */
export class OnethingUsageLedger {
  private readonly ledgerDirSource: string | (() => string)
  private readonly now: () => number
  private writeBuffer: string[] = []
  private flushTimer: NodeJS.Timeout | null = null
  private lastError: string | undefined
  private pendingFlush: Promise<void> | null = null

  constructor(options: OnethingUsageLedgerOptions = {}) {
    this.ledgerDirSource = options.ledgerDir ?? (() => path.join(process.cwd(), '.onething', 'usage'))
    this.now = options.now ?? Date.now
  }

  getLedgerDir(): string {
    return typeof this.ledgerDirSource === 'function' ? this.ledgerDirSource() : this.ledgerDirSource
  }

  /** Builds the full record (cost calc, defaults) and queues it for append. */
  record(input: OnethingUsageRecordInput): OnethingUsageLedgerRecord {
    const record = buildOnethingUsageLedgerRecord(input, this.now)
    this.queueWrite(record)
    return record
  }

  /** Waits for any buffered writes to hit disk. Call before reading for consistency. */
  async flush(): Promise<void> {
    if (this.pendingFlush) await this.pendingFlush
    await this.flushNow()
  }

  getLastError(): string | undefined {
    return this.lastError
  }

  async listLedgerFiles(): Promise<string[]> {
    const dir = this.getLedgerDir()
    try {
      const entries = await fsp.readdir(dir, { withFileTypes: true })
      return entries
        .filter(entry => entry.isFile() && MONTH_FILE_RE.test(entry.name))
        .map(entry => path.join(dir, entry.name))
        .sort()
    } catch (error) {
      if (isNodeErrorCode(error, 'ENOENT')) return []
      throw error
    }
  }

  /** Reads all records whose ts falls in [startTs, endTs). Scans only overlapping monthly files. */
  async readRecordsInRange(startTs: number, endTs: number): Promise<OnethingUsageLedgerRecord[]> {
    await this.flush()
    const files = await this.listLedgerFiles()
    const records: OnethingUsageLedgerRecord[] = []
    for (const filePath of files) {
      const monthKey = path.basename(filePath).match(MONTH_FILE_RE)
      if (!monthKey) continue
      const range = monthKeyToRange(`${monthKey[1]}-${monthKey[2]}`)
      if (range && (range.end <= startTs || range.start >= endTs)) continue
      const text = await fsp.readFile(filePath, 'utf-8').catch(() => '')
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue
        const record = parseUsageLedgerLine(line)
        if (record && record.ts >= startTs && record.ts < endTs) records.push(record)
      }
    }
    records.sort((left, right) => left.ts - right.ts)
    return records
  }

  private queueWrite(record: OnethingUsageLedgerRecord): void {
    this.writeBuffer.push(safeJsonLine(record))
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null
        this.pendingFlush = this.flushNow().catch(error => {
          this.lastError = error instanceof Error ? error.message : String(error)
        })
      }, FLUSH_INTERVAL_MS)
      this.flushTimer.unref?.()
    }
  }

  private async flushNow(): Promise<void> {
    const lines = this.writeBuffer.splice(0)
    if (lines.length === 0) return
    const byFile = new Map<string, string[]>()
    for (const line of lines) {
      const ts = JSON.parse(line).ts as number
      const fileName = onethingUsageLedgerFileName(ts)
      const bucket = byFile.get(fileName) ?? []
      bucket.push(line)
      byFile.set(fileName, bucket)
    }
    const dir = this.getLedgerDir()
    await fsp.mkdir(dir, { recursive: true })
    for (const [fileName, fileLines] of byFile) {
      await fsp.appendFile(path.join(dir, fileName), `${fileLines.join('\n')}\n`, 'utf-8')
    }
  }
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code
}

export function usageLedgerPathFor(ledgerDir: string, ts: number): string {
  return path.join(ledgerDir, onethingUsageLedgerFileName(ts))
}
