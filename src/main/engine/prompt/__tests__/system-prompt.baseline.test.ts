import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BuildPromptContextOptions } from '../system-prompt.js'
import { buildPrompt } from '../index.js'

// Baseline snapshot lock: captures the exact assembled prompt TEXT for a range
// of scenarios so the single-file refactor can be proven byte-identical.
// Date is frozen so the "Current date" line stays stable across runs.

const agentStoreMock = vi.hoisted(() => ({ getAgent: vi.fn() }))
vi.mock('../../../agents/index.js', () => ({
  getAgent: agentStoreMock.getAgent,
  DEFAULT_AGENT_ID: 'default',
}))

function baseOptions(overrides: Partial<BuildPromptContextOptions> = {}): BuildPromptContextOptions {
  return {
    hasTools: true,
    skills: [],
    activeProject: { hasActive: false },
    knownProjects: { hasAny: false, entries: [] },
    toolNames: ['read'],
    mcpToolNames: [],
    ...overrides,
  }
}

beforeAll(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-09T12:00:00Z'))
})
afterAll(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  agentStoreMock.getAgent.mockImplementation((agentId?: string) => ({
    id: agentId || 'default',
    name: agentId ? 'Custom Agent' : 'Default Agent',
    systemPrompt: agentId === 'agent-x' ? 'Be precise and cite sources.' : '',
    isDefault: !agentId || undefined,
    createdAt: 1,
    updatedAt: 1,
  }))
})

function shape(messages: Array<{ role: string; content: unknown }>) {
  return messages.map(m => ({ role: m.role, content: m.content }))
}

describe('system prompt baseline', () => {
  it('openai full context', async () => {
    const result = await buildPrompt({
      ...baseOptions({
        workingDirectory: '/repo',
        workingDirectoryRoots: ['/repo', '/other'],
        toolNames: ['read', 'edit', 'bash'],
        mcpToolNames: ['mcp_search'],
        contextVariables: 'foo=bar',
        activeProject: { hasActive: true, path: '/repo', displayPath: '/repo', description: 'main repo' },
        knownProjects: { hasAny: true, entries: [{ path: '/p1', displayPath: '/p1', description: 'proj one' }] },
        skills: [{ name: 'demo', description: 'demo skill', source: 'builtin', directoryPath: '/skills/demo', files: [], instructions: 'do x' } as never],
      }),
      providerId: 'openai',
      historyMessages: [{ role: 'user', content: 'hello' }],
    })
    expect(result.systemPrompt).toMatchSnapshot('openai-systemPrompt')
    expect(shape(result.messages)).toMatchSnapshot('openai-messages')
  })

  it('codex full context (system/developer split)', async () => {
    const result = await buildPrompt({
      ...baseOptions({ workingDirectory: '/repo', toolNames: ['read', 'edit'] }),
      providerId: 'codex',
      historyMessages: [{ role: 'user', content: 'hello' }],
    })
    expect(result.systemPrompt).toMatchSnapshot('codex-systemPrompt')
    expect(shape(result.messages)).toMatchSnapshot('codex-messages')
  })

  it('no tools', async () => {
    const result = await buildPrompt({
      ...baseOptions({ hasTools: false, toolNames: [], workingDirectory: '/repo' }),
      providerId: 'openai',
      historyMessages: [],
    })
    expect(result.systemPrompt).toMatchSnapshot('no-tools-systemPrompt')
  })

  it('voice speak mode', async () => {
    const result = await buildPrompt({
      ...baseOptions({ speakMode: true, voiceConversation: true }),
      providerId: 'openai',
      historyMessages: [],
    })
    expect(result.systemPrompt).toMatchSnapshot('voice-systemPrompt')
  })

  it('custom agent prompt', async () => {
    const result = await buildPrompt({
      ...baseOptions({ agentId: 'agent-x' }),
      providerId: 'openai',
      historyMessages: [],
    })
    expect(result.systemPrompt).toMatchSnapshot('agent-systemPrompt')
  })

  it('includes compact skill index when the skill tool is available', async () => {
    const result = await buildPrompt({
      ...baseOptions({
        toolNames: ['read', 'skill'],
        skills: [{
          id: 'user:writing/docs',
          name: 'docs-polish',
          description: 'Improve documentation writing',
          source: 'user',
          category: 'writing',
          tags: ['docs'],
          path: '/skills/writing/docs/SKILL.md',
          directoryPath: '/skills/writing/docs',
          enabled: true,
          instructions: 'Write clearly.',
          files: [],
        } as never],
      }),
      providerId: 'openai',
      historyMessages: [],
    })

    expect(result.systemPrompt).toContain('# Skills')
    expect(result.systemPrompt).toContain('docs-polish [writing]: Improve documentation writing (tags=docs)')
    expect(result.systemPrompt).toContain('action="load"')
  })
})
