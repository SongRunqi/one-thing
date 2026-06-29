import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  createMemoryDiagnosticsFetch,
  MemoryDiagnosticsLogger,
  sanitizeForMemoryLog,
  sanitizeUrlForMemoryLog,
} from '../diagnostics-logger.js'

let logRoot = ''

beforeEach(() => {
  logRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-memory-diagnostics-'))
})

afterEach(() => {
  fs.rmSync(logRoot, { recursive: true, force: true })
})

describe('runtime MemoryDiagnosticsLogger', () => {
  it('writes, reads, filters, and summarizes redacted JSONL logs', async () => {
    const logger = new MemoryDiagnosticsLogger({ logDir: logRoot })
    logger.configure({
      enabled: true,
      retentionDays: 7,
      level: 'debug',
      maxPreviewChars: 120,
      includeHttpErrorBody: true,
    })

    logger.log({
      subsystem: 'embedding',
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

    const listed = await logger.list({ subsystem: 'embedding', limit: 20 })
    expect(listed.entries).toHaveLength(1)
    expect(listed.entries[0].request?.apiKey).toBe('[redacted]')
    expect(String(listed.entries[0].request?.url)).toContain('api_key=%5Bredacted%5D')
    expect(String(listed.entries[0].request?.prompt).length).toBeLessThanOrEqual(123)

    const stats = await logger.stats()
    expect(stats.entriesInBuffer).toBe(2)
    expect(stats.bySubsystem.embedding).toBe(1)
    expect(fs.readdirSync(logRoot).some(file => file.endsWith('.jsonl'))).toBe(true)
  })

  it('cleans log files older than the retention window', async () => {
    const logger = new MemoryDiagnosticsLogger({ logDir: logRoot })
    logger.configure({ enabled: true, retentionDays: 7 })
    fs.writeFileSync(path.join(logRoot, 'memory-2020-01-01.jsonl'), '{}\n')
    const today = new Date()
    const todayName = [
      today.getFullYear(),
      String(today.getMonth() + 1).padStart(2, '0'),
      String(today.getDate()).padStart(2, '0'),
    ].join('-')
    fs.writeFileSync(path.join(logRoot, `memory-${todayName}.jsonl`), '{}\n')

    const deleted = await logger.cleanup(7)
    expect(deleted).toContain('memory-2020-01-01.jsonl')
    expect(fs.existsSync(path.join(logRoot, `memory-${todayName}.jsonl`))).toBe(true)
  })

  it('redacts sensitive keys and URL query values', () => {
    expect(sanitizeUrlForMemoryLog('https://example.com/v1?token=abc&query=hello')).toBe(
      'https://example.com/v1?token=%5Bredacted%5D&query=hello',
    )
    expect(sanitizeForMemoryLog({
      Authorization: 'Bearer abc',
      nested: { password: 'secret', ok: 'yes' },
    })).toEqual({
      Authorization: '[redacted]',
      nested: { password: '[redacted]', ok: 'yes' },
    })
  })

  it('logs embedding HTTP failures through the diagnostics fetch wrapper', async () => {
    const logger = new MemoryDiagnosticsLogger({ logDir: logRoot })
    logger.configure({
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
      { subsystem: 'embedding', operation: 'provider-http', runId: 'test-run', providerId: 'openai', model: 'text-embedding-3-small' },
      logger,
    )

    await wrapped('https://api.openai.com/v1/embeddings?api_key=sk-test', { method: 'POST' })
    const listed = await logger.list({ subsystem: 'embedding', status: 'error', limit: 10 })
    expect(listed.entries.some(entry => entry.response?.status === 401)).toBe(true)
    expect(JSON.stringify(listed.entries)).not.toContain('sk-test')
  })
})
