import { describe, expect, it } from 'vitest'
import {
  buildOnethingPrompt,
  buildOnethingSystemPrompt,
} from '../builder.js'

const host = {
  getAgent: () => ({
    name: 'Review Agent',
    systemPrompt: 'Keep answers concise.',
  }),
  getHomeDir: () => '/Users/tester',
  getPlatform: () => 'darwin',
  getMacOSAutomationDocsPath: () => '/Applications/onething/docs/macos-automation.md',
}

describe('onething prompt builder', () => {
  it('injects onething defaults and host supplied agent context', async () => {
    const prompt = await buildOnethingSystemPrompt({
      hasTools: false,
      skills: [],
      host,
    })

    expect(prompt.system).toContain('You are onething')
    expect(prompt.developer.join('\n')).toContain('Keep answers concise.')
    expect(prompt.developer.join('\n')).toContain('/Applications/onething/docs/macos-automation.md')
  })

  it('uses separate developer messages for Codex provider calls', async () => {
    const prompt = await buildOnethingPrompt({
      providerId: 'codex',
      model: 'gpt-5-codex',
      hasTools: false,
      skills: [],
      host,
      historyMessages: [
        { role: 'user', content: 'hello' },
      ],
    })

    expect(prompt.messages.map(message => message.role)).toEqual([
      'system',
      'developer',
      'developer',
      'developer',
      'user',
    ])
    expect(prompt.messages.some(message => (
      message.role === 'developer' &&
      String(message.content).includes('Provider ID: codex') &&
      String(message.content).includes('Model ID: gpt-5-codex')
    ))).toBe(true)
  })

  it('keeps non-Codex providers on a merged system prompt', async () => {
    const prompt = await buildOnethingPrompt({
      providerId: 'deepseek',
      providerConfig: { model: 'deepseek-v4-flash' },
      hasTools: false,
      skills: [],
      host,
      historyMessages: [
        { role: 'user', content: 'hello' },
      ],
    })

    expect(prompt.messages.map(message => message.role)).toEqual(['system', 'user'])
    expect(String(prompt.messages[0]?.content)).toContain('Keep answers concise.')
    expect(String(prompt.messages[0]?.content)).toContain('Provider ID: deepseek')
    expect(String(prompt.messages[0]?.content)).toContain('Model ID: deepseek-v4-flash')
  })
})
