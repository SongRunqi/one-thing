import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMemoryDiagnosticsFetch,
  MemoryDiagnosticsLogger,
  memoryDiagnosticsLogger,
  sanitizeForMemoryLog,
  sanitizeUrlForMemoryLog,
} from '../diagnostics-logger.js'

let homeDir = ''

function logDir(): string {
  return path.join(homeDir, '.onething', 'log', 'memory')
}

beforeEach(() => {
  homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-diagnostics-'))
  vi.spyOn(os, 'homedir').mockReturnValue(homeDir)
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(homeDir, { recursive: true, force: true })
})

describe('MemoryDiagnosticsLogger', () => {
  it('writes, reads, filters, and summarizes redacted JSONL logs', async () => {
    const logger = new MemoryDiagnosticsLogger()
    logger.configure({
      enabled: true,
      retentionDays: 7,
      level: 'debug',
      maxPreviewChars: 120,
      includeHttpErrorBody: true,
    })

    logger.log({
      subsystem: 'daily',
      operation: 'embed-texts',
      stage: 'request',
      status: 'started',
      request: {
        url: 'https://api.openai.com/v1/embeddings?api_key=sk-test',
        apiKey: 'sk-test',
        prompt: 'x'.repeat(500),
      },
    })
    logger.log({
      subsystem: 'capture',
      operation: 'after-assistant-response',
      stage: 'finish',
      status: 'ok',
      response: { candidates: 2 },
    })

    const listed = await logger.list({ subsystem: 'daily', limit: 20 })
    expect(listed.entries).toHaveLength(1)
    expect(listed.entries[0].request?.apiKey).toBe('[redacted]')
    expect(String(listed.entries[0].request?.url)).toContain('api_key=%5Bredacted%5D')
    expect(String(listed.entries[0].request?.prompt).length).toBeLessThanOrEqual(123)

    const stats = await logger.stats()
    expect(stats.entriesInBuffer).toBe(2)
    expect(stats.bySubsystem.daily).toBe(1)
    expect(fs.readdirSync(logDir()).some(file => file.endsWith('.jsonl'))).toBe(true)
  })

  it('cleans log files older than the retention window', async () => {
    const logger = new MemoryDiagnosticsLogger()
    logger.configure({ enabled: true, retentionDays: 7 })
    fs.mkdirSync(logDir(), { recursive: true })
    fs.writeFileSync(path.join(logDir(), 'memory-2020-01-01.jsonl'), '{}\n')
    const today = new Date()
    const todayName = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-')
    fs.writeFileSync(path.join(logDir(), `memory-${todayName}.jsonl`), '{}\n')

    const deleted = await logger.cleanup(7)
    expect(deleted).toContain('memory-2020-01-01.jsonl')
    expect(fs.existsSync(path.join(logDir(), `memory-${todayName}.jsonl`))).toBe(true)
  })

  it('redacts sensitive keys and URL query values', () => {
    expect(sanitizeUrlForMemoryLog('https://example.com/v1?token=abc&query=hello')).toBe(
      'https://example.com/v1?token=%5Bredacted%5D&query=hello',
    )
    expect(sanitizeForMemoryLog({
      authorization: 'Bearer secret',
      nested: { password: 'secret', value: 'ok' },
    })).toEqual({
      authorization: '[redacted]',
      nested: { password: '[redacted]', value: 'ok' },
    })
  })

  it('logs provider HTTP failures through the diagnostics fetch wrapper', async () => {
    memoryDiagnosticsLogger.configure({
      enabled: true,
      retentionDays: 7,
      level: 'debug',
      includeHttpErrorBody: true,
      maxPreviewChars: 200,
    })
    const wrapped = createMemoryDiagnosticsFetch(
      async () => new Response(JSON.stringify({ error: { message: 'bad key', token: 'secret' } }), {
        status: 401,
        statusText: 'Unauthorized',
        headers: { 'content-type': 'application/json' },
      }),
      { subsystem: 'capture', operation: 'provider-http', runId: 'test-run', providerId: 'openai', model: 'text-embedding-3-small' },
    )

    await wrapped('https://api.openai.com/v1/embeddings?api_key=sk-test', { method: 'POST' })
    const listed = await memoryDiagnosticsLogger.list({ subsystem: 'capture', status: 'error', limit: 10 })
    expect(listed.entries.some(entry => entry.response?.status === 401)).toBe(true)
    expect(JSON.stringify(listed.entries)).not.toContain('sk-test')
  })
})
