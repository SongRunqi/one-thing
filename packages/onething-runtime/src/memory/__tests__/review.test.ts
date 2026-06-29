import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildMemoryReviewInput,
  formatMemoryReviewConversation,
  getMemoryReviewProgress,
  runMemoryReview,
  parseMemoryReviewModelResult,
  type MemoryReviewCandidate,
  type MemoryReviewMessageLike,
} from '../review.js'
import type {
  MemoryWorkspace,
  ResolvedSoulMemorySettings,
} from '../types.js'

const tempDirs: string[] = []

function makeWorkspace(): MemoryWorkspace {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-memory-review-'))
  tempDirs.push(root)
  const settings = {
    enabled: true,
    review: {
      enabled: true,
      interval: 1,
      maxInputChars: 1500,
      timeoutMs: 1000,
      maxCandidates: 5,
      minConfidence: 0.6,
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

function userMessage(index: number): MemoryReviewMessageLike {
  return {
    role: 'user',
    content: `question ${index}`,
  }
}

function assistantMessage(index: number): MemoryReviewMessageLike {
  return {
    role: 'assistant',
    content: `answer ${index}`,
  }
}

function conversation(userTurns: number): MemoryReviewMessageLike[] {
  const messages: MemoryReviewMessageLike[] = []
  for (let index = 1; index <= userTurns; index += 1) {
    messages.push(userMessage(index), assistantMessage(index))
  }
  return messages
}

describe('runtime memory review helpers', () => {
  it('triggers every fixed number of user turns', () => {
    expect(getMemoryReviewProgress({
      messages: conversation(9),
      interval: 10,
    })).toMatchObject({
      userTurns: 9,
      turnsSinceReview: 9,
      turnsUntilReview: 1,
      shouldReview: false,
    })

    expect(getMemoryReviewProgress({
      messages: conversation(10),
      interval: 10,
    })).toMatchObject({
      userTurns: 10,
      turnsSinceReview: 0,
      turnsUntilReview: 0,
      shouldReview: true,
    })
  })

  it('parses soul and dreams review targets', () => {
    const parsed = parseMemoryReviewModelResult(JSON.stringify({
      action: 'review',
      confidence: 0.86,
      memories: [
        {
          action: 'replace',
          target: 'soul',
          oldText: 'Keep replies formal.',
          newText: 'Keep replies warm and precise.',
          confidence: 0.9,
        },
        {
          action: 'remove',
          target: 'dreams',
          text: 'Maybe revisit tone later.',
          confidence: 0.88,
        },
      ],
    }))

    expect(parsed?.candidates).toEqual([
      {
        action: 'replace',
        target: 'soul',
        confidence: 0.9,
        content: 'Keep replies formal.',
        oldText: 'Keep replies formal.',
        newText: 'Keep replies warm and precise.',
        text: 'Keep replies formal.',
      },
      {
        action: 'remove',
        target: 'dreams',
        confidence: 0.88,
        content: 'Maybe revisit tone later.',
        text: 'Maybe revisit tone later.',
      },
    ])
  })

  it('keeps the latest conversation tail when compacting', () => {
    const formatted = formatMemoryReviewConversation(conversation(80), 220)

    expect(formatted).toContain('[Older conversation omitted]')
    expect(formatted).toContain('User: question 80')
    expect(formatted).toContain('Assistant: answer 80')
  })

  it('builds memory review input inside the runtime', async () => {
    const workspace = makeWorkspace()
    fs.writeFileSync(workspace.soulPath, '# SOUL\n\nKeep replies warm.\n')
    fs.writeFileSync(workspace.dreamsPath, '# DREAMS\n')
    fs.writeFileSync(workspace.userPath, '# USER\n\n- 用户喜欢中文回答。\n')
    fs.writeFileSync(workspace.memoryPath, '# MEMORY\n')

    const input = await buildMemoryReviewInput({
      workspace,
      messages: conversation(2),
      maxChars: 1500,
    })

    expect(input).toContain('# Existing SOUL.md')
    expect(input).toContain('Keep replies warm.')
    expect(input).toContain('# Existing USER.md')
    expect(input).toContain('用户喜欢中文回答。')
    expect(input).toContain('# Conversation snapshot')
  })

  it('runs memory review orchestration inside the runtime', async () => {
    const workspace = makeWorkspace()
    fs.writeFileSync(workspace.soulPath, '# SOUL\n')
    fs.writeFileSync(workspace.dreamsPath, '# DREAMS\n')
    fs.writeFileSync(workspace.userPath, '# USER\n')
    fs.writeFileSync(workspace.memoryPath, '# MEMORY\n')
    const diagnostics: Array<{ operation: string; stage: string; status: string }> = []
    const writes: string[] = []
    const statusMutations: unknown[] = []
    const notifications: string[] = []

    const candidate: MemoryReviewCandidate = {
      action: 'add',
      target: 'memory',
      confidence: 0.9,
      content: '用户正在把 onething 拆成 headless runtime。',
      text: '用户正在把 onething 拆成 headless runtime。',
    }

    const result = await runMemoryReview<{ id: string }>({
      workspace,
      sessionId: 'session-a',
      assistantMessageId: 'assistant-a',
      messages: conversation(1),
      lastUserMessage: '继续拆 headless runtime',
      lastAssistantMessage: '我会继续迁移 memory review。',
      force: true,
      resolveProvider: () => ({
        provider: { id: 'mock-provider' },
        providerId: 'mock',
        model: 'mock-review',
        source: 'test',
      }),
      generateReview: () => JSON.stringify({
        action: 'review',
        confidence: 0.9,
        memories: [candidate],
      }),
      applyStatusMutation: plan => {
        statusMutations.push(plan)
      },
      notify: message => {
        notifications.push(message)
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
      now: () => 1_772_000_000_000,
    })

    expect(result).toMatchObject({
      status: 'applied',
      applied: 1,
      skipped: 0,
      paths: ['MEMORY.md'],
    })
    expect(fs.readFileSync(workspace.memoryPath, 'utf-8')).toContain('用户正在把 onething 拆成 headless runtime。')
    expect(writes).toEqual(['MEMORY.md'])
    expect(statusMutations.length).toBeGreaterThan(0)
    expect(notifications[0]).toContain('Memory Review saved 1 update')
    expect(diagnostics).toContainEqual({
      operation: 'model-review',
      stage: 'request',
      status: 'started',
    })
    expect(diagnostics).toContainEqual({
      operation: 'after-assistant-response',
      stage: 'finish',
      status: 'ok',
    })
  })
})
