import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  dumpOnethingProviderRequest,
  getOnethingProviderRequestDumpDir,
  safeOnethingProviderRequestDumpFilenamePart,
  shouldDumpOnethingProviderRequests,
  stringifyOnethingProviderRequestDump,
} from '../request-dump.js'

describe('onething provider request dump', () => {
  it('keeps dump path and feature flag policy in runtime', () => {
    expect(getOnethingProviderRequestDumpDir('/tmp/onething-logs')).toBe('/tmp/onething-logs/provider-requests')
    expect(shouldDumpOnethingProviderRequests({})).toBe(true)
    expect(shouldDumpOnethingProviderRequests({ ONETHING_DUMP_PROVIDER_REQUESTS: '0' })).toBe(false)
    expect(safeOnethingProviderRequestDumpFilenamePart('codex/http:model?x')).toBe('codex_http_model_x')
    expect(safeOnethingProviderRequestDumpFilenamePart('!!!')).toBe('unknown')
  })

  it('serializes diagnostic values without throwing', () => {
    const circular: Record<string, unknown> = { count: 1n, error: new Error('boom') }
    circular.self = circular

    const serialized = stringifyOnethingProviderRequestDump(circular)

    expect(serialized).toContain('"count": "1"')
    expect(serialized).toContain('"message": "boom"')
    expect(serialized).toContain('"self": "[Circular]"')
  })

  it('writes provider request dumps under the supplied log directory', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onething-provider-dump-'))
    const logger = { log: vi.fn(), warn: vi.fn() }

    const dumpPath = await dumpOnethingProviderRequest({
      providerId: 'deepseek/test',
      model: 'deepseek-chat',
      mode: 'stream',
      metadata: { sessionId: 'session-1' },
      requestBody: { model: 'deepseek-chat', messages: ['hello'] },
    }, {
      getLogDir: () => dir,
      env: {},
      logger,
    })

    expect(dumpPath).toContain(path.join(dir, 'provider-requests'))
    expect(path.basename(dumpPath ?? '')).toContain('deepseek_test')
    const parsed = JSON.parse(await fs.readFile(dumpPath ?? '', 'utf-8'))
    expect(parsed.metadata).toMatchObject({
      providerId: 'deepseek/test',
      model: 'deepseek-chat',
      mode: 'stream',
      sessionId: 'session-1',
    })
    expect(parsed.requestBody).toEqual({ model: 'deepseek-chat', messages: ['hello'] })
    expect(logger.log).toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('does not write when provider request dumps are disabled', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'onething-provider-dump-disabled-'))

    await expect(dumpOnethingProviderRequest({
      providerId: 'deepseek',
      model: 'deepseek-chat',
      mode: 'stream',
      requestBody: {},
    }, {
      getLogDir: () => dir,
      env: { ONETHING_DUMP_PROVIDER_REQUESTS: '0' },
    })).resolves.toBeUndefined()

    await expect(fs.readdir(dir)).resolves.toEqual([])
  })
})
