import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { toJsonObject, type JsonObject, type JsonValue } from '@onething/core'
import type { SoulMemoryLoggingSettings } from './types.js'

export type MemoryDiagnosticLevel = 'debug' | 'info' | 'warn' | 'error'
export type MemoryDiagnosticSubsystem =
  | 'capture'
  | 'daily'
  | 'review'
  | 'scheduler'
  | 'ipc'
export type MemoryDiagnosticStatus = 'started' | 'ok' | 'error' | 'skipped' | 'fallback'

export interface MemoryDiagnosticLogEntry {
  id: string
  timestamp: number
  level: MemoryDiagnosticLevel
  subsystem: MemoryDiagnosticSubsystem
  operation: string
  stage: string
  status: MemoryDiagnosticStatus
  summary?: string
  durationMs?: number
  sessionId?: string
  runId?: string
  request?: JsonObject
  response?: JsonObject
  error?: JsonObject
  metadata?: JsonObject
}

export interface MemoryLogsListRequest {
  limit?: number
  query?: string
  level?: MemoryDiagnosticLevel | 'all'
  subsystem?: MemoryDiagnosticSubsystem | 'all'
  status?: MemoryDiagnosticStatus | 'all'
  since?: number
}

export interface MemoryDiagnosticsLogInput {
  level?: MemoryDiagnosticLevel
  subsystem: MemoryDiagnosticSubsystem
  operation: string
  stage: string
  status: MemoryDiagnosticStatus
  summary?: string
  durationMs?: number
  sessionId?: string
  runId?: string
  request?: JsonObject
  response?: JsonObject
  error?: unknown
  metadata?: JsonObject
}

export type MemoryDiagnosticsLoggerConfig = Required<SoulMemoryLoggingSettings>

export interface MemoryDiagnosticsLoggerOptions {
  logDir?: string | (() => string)
}

export interface MemoryDiagnosticsFetchContext {
  subsystem?: MemoryDiagnosticSubsystem
  operation?: string
  runId?: string
  providerId?: string
  model?: string
}

const DEFAULT_CONFIG: MemoryDiagnosticsLoggerConfig = {
  enabled: true,
  retentionDays: 7,
  level: 'info',
  maxPreviewChars: 600,
  includeHttpErrorBody: true,
}

const LEVEL_WEIGHT: Record<MemoryDiagnosticLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}

const SENSITIVE_KEY_RE = /authorization|api[-_]?key|token|password|secret|credential|cookie|set-cookie/i
const SENSITIVE_QUERY_RE = /api[-_]?key|token|password|secret|credential|code|state|client_secret/i
const MAX_BUFFER = 1000
const FLUSH_INTERVAL_MS = 750
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000

function defaultMemoryLogDir(): string {
  return path.join(process.cwd(), '.onething-runtime', 'log', 'memory')
}

function dayKey(timestamp = Date.now()): string {
  const date = new Date(timestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return JSON.stringify({ unserializable: true })
  }
}

export function sanitizeUrlForMemoryLog(value: string): string {
  try {
    const parsed = new URL(value)
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (SENSITIVE_QUERY_RE.test(key)) {
        parsed.searchParams.set(key, '[redacted]')
      }
    }
    return parsed.toString()
  } catch {
    return value
  }
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value
  return `${value.slice(0, Math.max(0, maxChars))}...`
}

export function sanitizeForMemoryLog(
  value: unknown,
  maxPreviewChars = DEFAULT_CONFIG.maxPreviewChars,
): JsonValue | undefined {
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    const sanitized = /^https?:\/\//i.test(value) ? sanitizeUrlForMemoryLog(value) : value
    return truncate(sanitized, maxPreviewChars)
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) {
    return value.slice(0, 40)
      .map(item => sanitizeForMemoryLog(item, maxPreviewChars))
      .filter((item): item is JsonValue => item !== undefined)
  }
  if (typeof value === 'object') {
    const result: JsonObject = {}
    for (const [key, entry] of Object.entries(value)) {
      if (SENSITIVE_KEY_RE.test(key)) {
        result[key] = '[redacted]'
      } else {
        const sanitized = sanitizeForMemoryLog(entry, maxPreviewChars)
        if (sanitized !== undefined) result[key] = sanitized
      }
    }
    return result
  }
  return String(value)
}

function cleanError(error: unknown, maxPreviewChars: number): JsonObject {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: truncate(error.message, maxPreviewChars),
      stack: error.stack ? truncate(error.stack, maxPreviewChars * 2) : undefined,
    }
  }
  return {
    message: truncate(String(error), maxPreviewChars),
  }
}

function requestMeta(input: RequestInfo | URL, init?: RequestInit): JsonObject {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url
  const method = init?.method ||
    (typeof input === 'object' && 'method' in input ? (input as Request).method : undefined) ||
    'GET'
  return {
    method,
    url: sanitizeUrlForMemoryLog(url),
  }
}

async function responsePreview(response: Response, maxChars: number): Promise<string | undefined> {
  try {
    const text = await response.clone().text()
    return truncate(text.replace(/\s+/g, ' ').trim(), maxChars)
  } catch {
    return undefined
  }
}

function parseLogLine(line: string): MemoryDiagnosticLogEntry | null {
  try {
    const parsed = JSON.parse(line)
    if (!parsed || typeof parsed.id !== 'string' || typeof parsed.timestamp !== 'number') return null
    return parsed as MemoryDiagnosticLogEntry
  } catch {
    return null
  }
}

export class MemoryDiagnosticsLogger {
  private config: MemoryDiagnosticsLoggerConfig = { ...DEFAULT_CONFIG }
  private buffer: MemoryDiagnosticLogEntry[] = []
  private writeBuffer: string[] = []
  private flushTimer: NodeJS.Timeout | null = null
  private cleanupTimer: NodeJS.Timeout | null = null
  private lastError: string | undefined
  private readonly logDirSource: string | (() => string)

  constructor(options: MemoryDiagnosticsLoggerOptions = {}) {
    this.logDirSource = options.logDir ?? defaultMemoryLogDir
  }

  configure(settings?: SoulMemoryLoggingSettings): void {
    this.config = {
      enabled: settings?.enabled ?? DEFAULT_CONFIG.enabled,
      retentionDays: Math.max(1, Math.min(90, Math.floor(settings?.retentionDays ?? DEFAULT_CONFIG.retentionDays))),
      level: settings?.level === 'debug' || settings?.level === 'warn' || settings?.level === 'error' || settings?.level === 'info'
        ? settings.level
        : DEFAULT_CONFIG.level,
      maxPreviewChars: Math.max(120, Math.min(4000, Math.floor(settings?.maxPreviewChars ?? DEFAULT_CONFIG.maxPreviewChars))),
      includeHttpErrorBody: settings?.includeHttpErrorBody ?? DEFAULT_CONFIG.includeHttpErrorBody,
    }
    this.ensureCleanupTimer()
  }

  getLogDir(): string {
    return typeof this.logDirSource === 'function' ? this.logDirSource() : this.logDirSource
  }

  getConfig(): MemoryDiagnosticsLoggerConfig {
    return { ...this.config }
  }

  log(input: MemoryDiagnosticsLogInput): MemoryDiagnosticLogEntry | null {
    if (!this.config.enabled) return null
    const level = input.level || (input.status === 'error' ? 'error' : input.status === 'fallback' ? 'warn' : 'info')
    if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[this.config.level]) return null
    const entry: MemoryDiagnosticLogEntry = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      level,
      subsystem: input.subsystem,
      operation: input.operation,
      stage: input.stage,
      status: input.status,
      ...(input.summary ? { summary: truncate(input.summary, this.config.maxPreviewChars) } : {}),
      ...(typeof input.durationMs === 'number' ? { durationMs: Math.max(0, Math.round(input.durationMs)) } : {}),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.runId ? { runId: input.runId } : {}),
      ...(input.request ? { request: toJsonObject(sanitizeForMemoryLog(input.request, this.config.maxPreviewChars)) } : {}),
      ...(input.response ? { response: toJsonObject(sanitizeForMemoryLog(input.response, this.config.maxPreviewChars)) } : {}),
      ...(input.error ? { error: cleanError(input.error, this.config.maxPreviewChars) } : {}),
      ...(input.metadata ? { metadata: toJsonObject(sanitizeForMemoryLog(input.metadata, this.config.maxPreviewChars)) } : {}),
    }
    this.buffer.push(entry)
    if (this.buffer.length > MAX_BUFFER) this.buffer.splice(0, this.buffer.length - MAX_BUFFER)
    this.queueWrite(entry)
    return entry
  }

  async list(request: MemoryLogsListRequest = {}): Promise<{ entries: MemoryDiagnosticLogEntry[]; total: number; logDir: string }> {
    const limit = Math.max(1, Math.min(500, Math.floor(request.limit || 200)))
    const entries = await this.readRecentEntries(limit * 4)
    const filtered = entries.filter(entry => this.matches(entry, request))
    return {
      entries: filtered.slice(0, limit),
      total: filtered.length,
      logDir: this.getLogDir(),
    }
  }

  async stats(): Promise<{
    logDir: string
    files: number
    entriesInBuffer: number
    retainedDays: number
    oldestFile?: string
    newestFile?: string
    byLevel: Record<string, number>
    bySubsystem: Record<string, number>
    lastError?: string
  }> {
    const files = await this.listLogFiles()
    const byLevel: Record<string, number> = {}
    const bySubsystem: Record<string, number> = {}
    for (const entry of this.buffer) {
      byLevel[entry.level] = (byLevel[entry.level] || 0) + 1
      bySubsystem[entry.subsystem] = (bySubsystem[entry.subsystem] || 0) + 1
    }
    return {
      logDir: this.getLogDir(),
      files: files.length,
      entriesInBuffer: this.buffer.length,
      retainedDays: this.config.retentionDays,
      ...(files[0] ? { oldestFile: path.basename(files[0]) } : {}),
      ...(files[files.length - 1] ? { newestFile: path.basename(files[files.length - 1]) } : {}),
      byLevel,
      bySubsystem,
      ...(this.lastError ? { lastError: this.lastError } : {}),
    }
  }

  async cleanup(retentionDays = this.config.retentionDays): Promise<string[]> {
    const dir = this.getLogDir()
    await fsp.mkdir(dir, { recursive: true })
    const cutoff = Date.now() - Math.max(1, retentionDays) * 86400000
    const deleted: string[] = []
    for (const filePath of await this.listLogFiles()) {
      const name = path.basename(filePath)
      const match = name.match(/^memory-(\d{4}-\d{2}-\d{2})\.jsonl$/)
      if (!match) continue
      const fileTime = new Date(`${match[1]}T00:00:00`).getTime()
      if (Number.isFinite(fileTime) && fileTime < cutoff) {
        try {
          await fsp.unlink(filePath)
          deleted.push(name)
        } catch (error) {
          if (!isNodeErrorCode(error, 'ENOENT')) throw error
        }
      }
    }
    return deleted
  }

  private queueWrite(entry: MemoryDiagnosticLogEntry): void {
    this.writeBuffer.push(safeJson(entry))
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        void this.flush().catch(error => {
          this.lastError = error instanceof Error ? error.message : String(error)
        })
      }, FLUSH_INTERVAL_MS)
      this.flushTimer.unref?.()
    }
  }

  private async flush(): Promise<void> {
    const lines = this.writeBuffer.splice(0)
    this.flushTimer = null
    if (lines.length === 0) return
    const filePath = this.logFileFor()
    await fsp.mkdir(path.dirname(filePath), { recursive: true })
    await fsp.appendFile(filePath, `${lines.join('\n')}\n`, 'utf-8')
  }

  private ensureCleanupTimer(): void {
    if (this.cleanupTimer) return
    this.cleanupTimer = setInterval(() => {
      void this.cleanup().catch(error => {
        this.lastError = error instanceof Error ? error.message : String(error)
      })
    }, CLEANUP_INTERVAL_MS)
    this.cleanupTimer.unref?.()
  }

  private logFileFor(timestamp = Date.now()): string {
    return path.join(this.getLogDir(), `memory-${dayKey(timestamp)}.jsonl`)
  }

  private async listLogFiles(): Promise<string[]> {
    const dir = this.getLogDir()
    try {
      const entries = await fsp.readdir(dir, { withFileTypes: true })
      return entries
        .filter(entry => entry.isFile() && /^memory-\d{4}-\d{2}-\d{2}\.jsonl$/.test(entry.name))
        .map(entry => path.join(dir, entry.name))
        .sort()
    } catch (error: any) {
      if (error?.code === 'ENOENT') return []
      throw error
    }
  }

  private async readRecentEntries(limit: number): Promise<MemoryDiagnosticLogEntry[]> {
    await this.flush()
    const entriesById = new Map<string, MemoryDiagnosticLogEntry>()
    for (const entry of this.buffer) {
      entriesById.set(entry.id, entry)
    }
    const files = (await this.listLogFiles()).reverse()
    for (const filePath of files) {
      if (entriesById.size >= limit * 2) break
      const text = fs.readFileSync(filePath, 'utf-8')
      const lines = text.trim().split(/\r?\n/).filter(Boolean).reverse()
      for (const line of lines) {
        const entry = parseLogLine(line)
        if (entry) entriesById.set(entry.id, entry)
        if (entriesById.size >= limit * 2) break
      }
    }
    return Array.from(entriesById.values())
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, limit * 2)
  }

  private matches(entry: MemoryDiagnosticLogEntry, request: MemoryLogsListRequest): boolean {
    if (request.since && entry.timestamp < request.since) return false
    if (request.level && request.level !== 'all' && entry.level !== request.level) return false
    if (request.subsystem && request.subsystem !== 'all' && entry.subsystem !== request.subsystem) return false
    if (request.status && request.status !== 'all' && entry.status !== request.status) return false
    if (request.query?.trim()) {
      const haystack = [
        entry.summary,
        entry.subsystem,
        entry.operation,
        entry.stage,
        entry.status,
        entry.error?.message,
        safeJson(entry.request),
        safeJson(entry.response),
        safeJson(entry.metadata),
      ].join('\n').toLowerCase()
      if (!haystack.includes(request.query.trim().toLowerCase())) return false
    }
    return true
  }
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && (error as { code?: unknown }).code === code
}

export const memoryDiagnosticsLogger = new MemoryDiagnosticsLogger()

export function configureMemoryDiagnosticsLogger(settings?: SoulMemoryLoggingSettings): void {
  memoryDiagnosticsLogger.configure(settings)
}

export function logMemoryDiagnostic(input: MemoryDiagnosticsLogInput): MemoryDiagnosticLogEntry | null {
  return memoryDiagnosticsLogger.log(input)
}

export function createMemoryDiagnosticsFetch(
  baseFetch: typeof fetch,
  context: MemoryDiagnosticsFetchContext = {},
  logger: MemoryDiagnosticsLogger = memoryDiagnosticsLogger,
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const startedAt = Date.now()
    const request = {
      ...requestMeta(input, init),
      ...(context.providerId ? { providerId: context.providerId } : {}),
      ...(context.model ? { model: context.model } : {}),
    }
    logger.log({
      subsystem: context.subsystem || 'ipc',
      operation: context.operation || 'http',
      stage: 'request',
      status: 'started',
      runId: context.runId,
      request,
    })
    try {
      const response = await baseFetch(input, init)
      const config = logger.getConfig()
      const preview = !response.ok && config.includeHttpErrorBody
        ? await responsePreview(response, Math.min(2048, config.maxPreviewChars * 4))
        : undefined
      logger.log({
        level: response.ok ? 'info' : 'warn',
        subsystem: context.subsystem || 'ipc',
        operation: context.operation || 'http',
        stage: 'response',
        status: response.ok ? 'ok' : 'error',
        durationMs: Date.now() - startedAt,
        runId: context.runId,
        request,
        response: {
          status: response.status,
          statusText: response.statusText,
          contentType: response.headers.get('content-type') || '',
          ...(preview ? { bodyPreview: preview } : {}),
        },
      })
      return response
    } catch (error) {
      logger.log({
        level: 'error',
        subsystem: context.subsystem || 'ipc',
        operation: context.operation || 'http',
        stage: 'response',
        status: 'error',
        durationMs: Date.now() - startedAt,
        runId: context.runId,
        request,
        error,
      })
      throw error
    }
  }
}
