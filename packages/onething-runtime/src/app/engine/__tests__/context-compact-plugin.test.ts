/**
 * N7-a —— beforeContextCompact 替换摘要的**装配层消费**验收。
 *
 * 打的是 compactSessionContext 的分支:某插件返回了替换摘要 → **跳过宿主的
 * summarizeInChunks**,直接把它写进会话摘要;无人返回(或 fail-open 回落)→
 * 宿主自压照常。协议层(第一个胜出 / 空串无效 / fail-open)在 core 那一份
 * (core/plugins lifecycle-compact.test.ts)。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage, ChatSession } from '@shared/ipc.js'

const runBeforeContextCompactHooks = vi.fn()
const generateChatResponse = vi.fn()
const summaryWrites: Array<{ summary: string; cutoff: string }> = []

vi.mock('../../plugins/lifecycle.js', () => ({
  runBeforeContextCompactHooks: (...args: unknown[]) => runBeforeContextCompactHooks(...args),
}))
vi.mock('../../providers/index.js', () => ({
  generateChatResponse: (...args: unknown[]) => generateChatResponse(...args),
}))
vi.mock('../../providers/model-registry.js', () => ({
  getModelContextLength: async () => 200_000,
  getModelMaxOutputTokens: async () => 8_192,
}))
vi.mock('../stream/message-helpers.js', () => ({
  buildHistoryMessages: () => [],
}))

const sessionRef: { current: ChatSession } = { current: null as unknown as ChatSession }

vi.mock('../../store.js', () => ({
  getSession: () => sessionRef.current,
  insertMessageAfter: () => {},
  updateSessionSummary: (_sessionId: string, summary: string, cutoff: string) => {
    summaryWrites.push({ summary, cutoff })
  },
  updateMessageContent: () => {},
  updateSessionContextSize: () => {},
}))

import { compactSessionContext } from '../context-compact.js'

function message(index: number, role: 'user' | 'assistant'): ChatMessage {
  return { id: `${role}-${index}`, role, content: `${role} ${index}`, timestamp: index }
}

function makeSession(): ChatSession {
  return {
    id: 's1',
    name: 'Test',
    createdAt: 0,
    updatedAt: 0,
    contextSize: 1000,
    messages: [
      message(1, 'user'), message(2, 'assistant'),
      message(3, 'user'), message(4, 'assistant'),
      message(5, 'user'), message(6, 'assistant'),
      message(7, 'user'), message(8, 'assistant'),
    ],
  } as ChatSession
}

const baseOptions = {
  sessionId: 's1',
  providerId: 'openai',
  configWithApiKey: { model: 'gpt-x', apiKey: 'sk' } as any,
  settings: { chat: {} } as any,
  keepRecentTurns: 2,
}

beforeEach(() => {
  runBeforeContextCompactHooks.mockReset()
  generateChatResponse.mockReset()
  generateChatResponse.mockResolvedValue('HOST SUMMARY')
  summaryWrites.length = 0
  sessionRef.current = makeSession()
})

afterEach(() => vi.clearAllMocks())

describe('compactSessionContext + N7-a replacement', () => {
  it('a plugin replacement summary is used and the host summarizer is skipped', async () => {
    runBeforeContextCompactHooks.mockResolvedValue({
      summary: 'TODO-highlighted structured summary',
      pluginId: 'smart-compact',
      hookId: 'compact',
    })

    const result = await compactSessionContext(baseOptions)

    expect(result.success).toBe(true)
    expect(result.summary).toBe('TODO-highlighted structured summary')
    // 宿主自压被跳过 —— 一次 provider 调用都没有。
    expect(generateChatResponse).not.toHaveBeenCalled()
    expect(summaryWrites[0]?.summary).toBe('TODO-highlighted structured summary')
  })

  it('falls back to host compaction when no plugin returns a summary', async () => {
    runBeforeContextCompactHooks.mockResolvedValue(undefined)

    const result = await compactSessionContext(baseOptions)

    expect(result.success).toBe(true)
    expect(result.summary).toBe('HOST SUMMARY')
    // 无人替换 → 宿主的 summarizeInChunks 真的跑了。
    expect(generateChatResponse).toHaveBeenCalled()
    expect(summaryWrites[0]?.summary).toBe('HOST SUMMARY')
  })
})
