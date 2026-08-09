/**
 * N7-b —— 受管 LLM 调用口的**装配层**验收。
 *
 * 打的是"只有装配层知道的事实"那一半:受管三要素的真实行为 —— 计费进账本
 * (source = plugin:<id>)、配额超限抛错、硬超时抛错、maxTokens 钳制、provider
 * 未配置时的 unsupported。声明门与输入校验在 core 那一份(core/plugins llm.test.ts)。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PLUGIN_LLM_COMPLETE_TIMEOUT_MS, PLUGIN_LLM_RATE_LIMIT } from '@onething/core/plugins'

const settingsRef: { current: any } = { current: null }
const generateChatResponse = vi.fn()
const recordUsage = vi.fn()

vi.mock('../../stores/settings.js', () => ({
  getSettings: () => settingsRef.current,
}))
vi.mock('../../providers/env.js', () => ({
  resolveProviderApiKey: (_id: string, config: { apiKey?: string }) => config?.apiKey ?? 'resolved-key',
}))
vi.mock('../../providers/index.js', () => ({
  generateChatResponse: (...args: unknown[]) => generateChatResponse(...args),
}))
vi.mock('../../usage/index.js', () => ({
  recordUsage: (...args: unknown[]) => recordUsage(...args),
}))

import { pluginLlmComplete, resetPluginLlmLedgers } from '../llm.js'

function withProvider() {
  settingsRef.current = {
    ai: {
      provider: 'openai',
      providers: { openai: { model: 'gpt-x', apiKey: 'sk-secret' } },
    },
  }
}

beforeEach(() => {
  resetPluginLlmLedgers()
  generateChatResponse.mockReset()
  recordUsage.mockReset()
  withProvider()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('pluginLlmComplete (受管三要素)', () => {
  it('计费:每次调用记进账本,source = plugin:<id>', async () => {
    generateChatResponse.mockImplementation(async (_p, _c, _m, opts: any) => {
      opts.onUsage({ inputTokens: 100, outputTokens: 40, totalTokens: 140 })
      return 'the answer'
    })
    const result = await pluginLlmComplete('smart-compact', {
      messages: [{ role: 'user', content: 'summarize' }],
    })
    expect(result).toEqual({ text: 'the answer' })
    expect(recordUsage).toHaveBeenCalledTimes(1)
    expect(recordUsage.mock.calls[0][0]).toMatchObject({
      providerId: 'openai',
      modelId: 'gpt-x',
      source: 'plugin:smart-compact',
      usage: { inputTokens: 100, outputTokens: 40, totalTokens: 140 },
    })
  })

  it('provider 解析:apiKey 进入 config 交给宿主,但从不出境给插件', async () => {
    generateChatResponse.mockResolvedValue('ok')
    await pluginLlmComplete('p', { messages: [{ role: 'user', content: 'x' }] })
    const [providerId, config] = generateChatResponse.mock.calls[0]
    expect(providerId).toBe('openai')
    // apiKey 只在宿主→provider 的 config 里,插件的返回值 { text } 里没有它。
    expect(config.apiKey).toBe('sk-secret')
  })

  it('maxTokens 钳制:越界值被钳进硬顶', async () => {
    generateChatResponse.mockResolvedValue('ok')
    await pluginLlmComplete('p', { messages: [{ role: 'user', content: 'x' }], maxTokens: 1_000_000 })
    expect(generateChatResponse.mock.calls[0][3].maxTokens).toBe(8192)
  })

  it('配额:超过每插件窗口上限 → 抛 quota', async () => {
    generateChatResponse.mockResolvedValue('ok')
    for (let i = 0; i < PLUGIN_LLM_RATE_LIMIT; i++) {
      await pluginLlmComplete('greedy', { messages: [{ role: 'user', content: 'x' }] })
    }
    await expect(pluginLlmComplete('greedy', { messages: [{ role: 'user', content: 'x' }] }))
      .rejects.toMatchObject({ code: 'quota' })
    // 另一个插件不受它的额度影响(按插件隔离)。
    await expect(pluginLlmComplete('other', { messages: [{ role: 'user', content: 'x' }] }))
      .resolves.toEqual({ text: 'ok' })
  })

  it('超时:硬超时触发 abort → 抛 timeout', async () => {
    vi.useFakeTimers()
    // provider 挂到被 abort 才 reject —— 模拟一次真实的慢调用。
    generateChatResponse.mockImplementation((_p: unknown, _c: unknown, _m: unknown, opts: any) =>
      new Promise((_resolve, reject) => {
        opts.abortSignal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      }))
    const promise = pluginLlmComplete('slow', { messages: [{ role: 'user', content: 'x' }] })
    const assertion = expect(promise).rejects.toMatchObject({ code: 'timeout' })
    await vi.advanceTimersByTimeAsync(PLUGIN_LLM_COMPLETE_TIMEOUT_MS + 10)
    await assertion
  })

  it('provider 未配置 → 抛 unsupported', async () => {
    settingsRef.current = { ai: { provider: undefined, providers: {} } }
    await expect(pluginLlmComplete('p', { messages: [{ role: 'user', content: 'x' }] }))
      .rejects.toMatchObject({ code: 'unsupported' })
  })

  it('provider 抛错 → 归一为 provider-error', async () => {
    generateChatResponse.mockRejectedValue(new Error('401 unauthorized'))
    await expect(pluginLlmComplete('p', { messages: [{ role: 'user', content: 'x' }] }))
      .rejects.toMatchObject({ code: 'provider-error' })
  })
})
