import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildDreamingExistingMemorySummary,
  collectDailyDreamingSources,
  runMemoryDreamingSweep,
} from '../dreaming.js'
import {
  closeMemoryDatabase,
} from '../database.js'
import type {
  MemoryWorkspace,
  ResolvedSoulMemorySettings,
} from '../types.js'

const tempDirs: string[] = []

function makeWorkspace(): MemoryWorkspace {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-memory-dreaming-'))
  tempDirs.push(root)
  const settings = {
    enabled: true,
    dreaming: {
      enabled: true,
      frequency: '0 3 * * *',
      timezone: 'UTC',
      lookbackDays: 9999,
      maxSourceFiles: 5,
      maxInputChars: 1500,
      maxPromotions: 5,
      minScore: 0.6,
      timeoutMs: 1000,
    },
    canonicalMemory: {
      enabled: false,
      store: 'sqlite',
      highConfidenceThreshold: 0.6,
      semanticDedupeThreshold: 0.92,
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
  closeMemoryDatabase()
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('runtime memory dreaming operations', () => {
  it('collects daily dreaming sources inside the runtime', async () => {
    const workspace = makeWorkspace()
    fs.mkdirSync(workspace.memoryDir, { recursive: true })
    fs.writeFileSync(path.join(workspace.memoryDir, '2026-06-27.md'), '# 2026-06-27\n\n- 用户在 gateway 接入微信。\n')

    const sources = await collectDailyDreamingSources(workspace)

    expect(sources).toHaveLength(1)
    expect(sources[0]).toMatchObject({
      relativePath: 'memory/2026-06-27.md',
      sourceType: 'daily',
    })
    expect(sources[0]?.content).toContain('用户在 gateway 接入微信。')
  })

  it('builds existing memory summary inside the runtime', async () => {
    const workspace = makeWorkspace()
    fs.writeFileSync(workspace.memoryPath, '# MEMORY\n\n- 用户喜欢中文回答。\n')

    const summary = await buildDreamingExistingMemorySummary(workspace)

    expect(summary).toContain('## Existing MEMORY.md')
    expect(summary).toContain('用户喜欢中文回答。')
  })

  it('runs dreaming sweep orchestration inside the runtime', async () => {
    const workspace = makeWorkspace()
    fs.mkdirSync(workspace.memoryDir, { recursive: true })
    fs.writeFileSync(workspace.memoryPath, '# MEMORY\n')
    fs.writeFileSync(path.join(workspace.memoryDir, '2026-06-27.md'), '# 2026-06-27\n\n- 用户正在把 onething 拆成 headless runtime。\n')
    const diagnostics: Array<{ operation: string; stage: string; status: string }> = []
    const writes: string[] = []
    const statusMutations: unknown[] = []

    const result = await runMemoryDreamingSweep<{ id: string }>({
      workspace,
      reason: 'manual',
      force: true,
      now: new Date('2026-06-27T03:00:00.000Z'),
      getNextRunAt: () => ({ nextRunAt: Date.parse('2026-06-28T03:00:00.000Z') }),
      resolveProvider: () => ({
        provider: { id: 'mock-provider' },
        modelRef: 'mock/mock-dreaming',
        source: 'test',
      }),
      generateDreaming: () => JSON.stringify({
        action: 'dream',
        confidence: 0.9,
        memories: [
          {
            action: 'add',
            confidence: 0.9,
            content: '用户正在把 onething 拆成 headless runtime。',
          },
        ],
        memory: '- 用户正在把 onething 拆成 headless runtime。',
      }),
      applyStatusMutation: plan => {
        statusMutations.push(plan)
      },
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
      status: 'applied',
      applied: 1,
      sourceFiles: ['memory/2026-06-27.md'],
      nextRunAt: Date.parse('2026-06-28T03:00:00.000Z'),
    })
    expect(fs.readFileSync(workspace.memoryPath, 'utf-8')).toContain('用户正在把 onething 拆成 headless runtime。')
    expect(writes).toEqual(['MEMORY.md'])
    expect(statusMutations.length).toBeGreaterThan(0)
    expect(diagnostics).toContainEqual({
      operation: 'model-sweep',
      stage: 'request',
      status: 'started',
    })
    expect(diagnostics).toContainEqual({
      operation: 'sweep',
      stage: 'finish',
      status: 'ok',
    })
  })
})
