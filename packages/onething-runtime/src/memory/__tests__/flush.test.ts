import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  runMemoryFlush,
} from '../flush.js'
import type {
  MemoryWorkspace,
  ResolvedSoulMemorySettings,
} from '../types.js'

const tempDirs: string[] = []

function makeWorkspace(): MemoryWorkspace {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-memory-flush-'))
  tempDirs.push(root)
  const settings = {
    enabled: true,
    memoryFlush: {
      enabled: true,
      maxInputChars: 1200,
    },
  } as ResolvedSoulMemorySettings

  return {
    settings,
    agentId: 'test-agent',
    root,
    memoryDir: path.join(root, 'memory'),
    soulPath: path.join(root, 'SOUL.md'),
    userPath: path.join(root, 'USER.md'),
    memoryPath: path.join(root, 'MEMORY.md'),
    dreamsPath: path.join(root, 'DREAMS.md'),
    todayPath: path.join(root, 'memory/2026-06-27.md'),
    dbPath: path.join(root, 'memory.sqlite'),
  }
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('runtime memory flush operations', () => {
  it('skips disabled memory flush inside the runtime', async () => {
    const workspace = makeWorkspace()
    workspace.settings.memoryFlush.enabled = false

    const result = await runMemoryFlush({
      workspace,
      sessionId: 'session-a',
      messagesToSummarize: [{ role: 'user', content: 'remember this' }],
      resolveProvider: () => {
        throw new Error('provider should not be resolved')
      },
      generateFlush: () => {
        throw new Error('model should not be called')
      },
    })

    expect(result).toEqual({
      status: 'skipped',
      reason: 'disabled',
    })
  })

  it('flushes compacted messages into a daily note inside the runtime', async () => {
    const workspace = makeWorkspace()
    fs.mkdirSync(workspace.memoryDir, { recursive: true })
    fs.writeFileSync(workspace.memoryPath, '# MEMORY\n')
    const diagnostics: Array<{ operation: string; stage: string; status: string }> = []
    const writes: string[] = []

    const result = await runMemoryFlush<{ id: string }>({
      workspace,
      sessionId: 'session-a',
      messagesToSummarize: [
        { role: 'user', content: '我今天在 gateway 里接入微信。' },
        { role: 'assistant', content: '已改成调用 onething-runtime。' },
      ],
      resolveProvider: () => ({
        provider: { id: 'mock-provider' },
        providerId: 'mock',
        model: 'mock-flush',
        source: 'test',
      }),
      generateFlush: () => '- 用户今天在 gateway 里接入微信，并改成调用 onething-runtime。',
      logDiagnostic: event => {
        diagnostics.push({
          operation: event.operation,
          stage: event.stage,
          status: event.status,
        })
      },
      onIndexableWrite: target => {
        writes.push(target.relativePath)
      },
      nowMs: () => 1_772_000_000_000,
    })

    expect(result).toMatchObject({
      status: 'ok',
      dailyItems: 1,
    })
    expect(fs.readFileSync(workspace.todayPath, 'utf-8')).toContain('用户今天在 gateway 里接入微信')
    expect(writes).toEqual(['memory/2026-06-27.md'])
    expect(diagnostics).toContainEqual({
      operation: 'before-context-compact',
      stage: 'model-request',
      status: 'started',
    })
    expect(diagnostics).toContainEqual({
      operation: 'before-context-compact',
      stage: 'finish',
      status: 'ok',
    })
  })
})
