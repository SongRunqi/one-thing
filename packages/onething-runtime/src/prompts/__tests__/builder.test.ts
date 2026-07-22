import { describe, expect, it } from 'vitest'
import {
  buildOnethingPrompt,
  buildOnethingSystemPrompt,
} from '../builder.js'
import { ONETHING_DEFAULT_SYSTEM_PROMPT } from '../system-prompt.js'

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

    expect(prompt.system).toContain(ONETHING_DEFAULT_SYSTEM_PROMPT)
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
      // context-update-convention section (always-on constant)
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

  // The prompt naming the file is what scopes the AI todo to a session: a
  // session can only name its own path, so two sessions cannot collide.
  describe('todo section', () => {
    const todoHost = { ...host, getTodoPlanDirectory: () => '/Users/tester/.onething/todo-plan' }

    it('points the session at its own AI todo file and the shared user notes', async () => {
      const { developer } = await buildOnethingSystemPrompt({
        sessionId: 'session-abc',
        hasTools: true,
        skills: [],
        host: todoHost,
      })

      const todo = developer.find(section => section.startsWith('# Todo'))
      expect(todo).toContain('~/.onething/todo-plan/sessions/session-abc/ai-todo.md')
      expect(todo).toContain('~/.onething/todo-plan/user-notes')
    })

    it('gives two sessions different todo paths', async () => {
      const build = (sessionId: string) => buildOnethingSystemPrompt({
        sessionId,
        hasTools: true,
        skills: [],
        host: todoHost,
      })

      const a = (await build('session-a')).developer.find(s => s.startsWith('# Todo'))
      const b = (await build('session-b')).developer.find(s => s.startsWith('# Todo'))

      expect(a).toContain('sessions/session-a/ai-todo.md')
      expect(a).not.toContain('session-b')
      expect(b).toContain('sessions/session-b/ai-todo.md')
      expect(b).not.toContain('session-a')
    })

    it('is omitted without a session or without tools', async () => {
      const noSession = await buildOnethingSystemPrompt({
        hasTools: true,
        skills: [],
        host: todoHost,
      })
      const noTools = await buildOnethingSystemPrompt({
        sessionId: 'session-abc',
        hasTools: false,
        skills: [],
        host: todoHost,
      })

      expect(noSession.developer.find(s => s.startsWith('# Todo'))).toBeUndefined()
      expect(noTools.developer.find(s => s.startsWith('# Todo'))).toBeUndefined()
    })
  })
})
