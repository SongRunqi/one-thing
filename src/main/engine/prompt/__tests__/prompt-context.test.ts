import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BuildPromptContextOptions } from '../system-prompt.js'
import {
  buildPrompt,
  loadAgentsMdInstructions,
  registerPromptContextProvider,
} from '../index.js'

const agentStoreMock = vi.hoisted(() => ({
  getAgent: vi.fn(),
}))

vi.mock('../../../agents/index.js', () => ({
  getAgent: agentStoreMock.getAgent,
  DEFAULT_AGENT_ID: 'default',
}))

const tempDirs: string[] = []

function baseOptions(overrides: Partial<BuildPromptContextOptions> = {}): BuildPromptContextOptions {
  return {
    hasTools: true,
    skills: [],
    workingDirectory: undefined,
    contextVariables: undefined,
    activeProject: { hasActive: false },
    knownProjects: { hasAny: false, entries: [] },
    toolNames: ['read'],
    mcpToolNames: [],
    ...overrides,
  }
}

function makeTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-context-'))
  tempDirs.push(dir)
  return dir
}

beforeEach(() => {
  agentStoreMock.getAgent.mockImplementation((agentId?: string) => ({
    id: agentId || 'default',
    name: agentId ? 'Custom Agent' : 'Default Agent',
    systemPrompt: '',
    isDefault: !agentId || undefined,
    createdAt: 1,
    updatedAt: 1,
  }))
})

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('Pi-style prompt builder', () => {
  it('builds a full prompt directly without fragment diff state', async () => {
    const result = await buildPrompt({
      ...baseOptions({
        workingDirectory: '/repo',
        workingDirectoryRoots: ['/repo', '/other'],
        toolNames: ['read', 'edit', 'bash'],
      }),
      providerId: 'openai',
      historyMessages: [{ role: 'user', content: 'hello' }],
    })

    expect(result.systemPrompt).toContain('You are onething')
    expect(result.systemPrompt).not.toContain('Available tools:')
    expect(result.systemPrompt).not.toContain('- read:')
    expect(result.systemPrompt).toContain('Current work directory: /repo')
    expect(result.systemPrompt).toContain('Current date:')
    expect(result.messages[0].role).toBe('system')
    expect(result.messages[result.messages.length - 1]).toEqual({ role: 'user', content: 'hello' })
  })

  it('does not inject todo autonomy or tool usage guidance', async () => {
    const result = await buildPrompt({
      ...baseOptions({
        workingDirectory: '/repo',
        toolNames: ['read', 'todo_plan'],
      }),
      providerId: 'openai',
      historyMessages: [],
    })
    const serialized = JSON.stringify(result.messages)

    expect(serialized).not.toContain('Todo / Notes Autonomy')
    expect(serialized).not.toContain('## Tool Usage')
  })

  it('injects custom Agent system prompts as developer context', async () => {
    agentStoreMock.getAgent.mockReturnValueOnce({
      id: 'agent-research',
      name: 'Research Lead',
      systemPrompt: 'Prioritize crisp, source-backed reasoning.',
      createdAt: 1,
      updatedAt: 1,
    })

    const result = await buildPrompt({
      ...baseOptions({ agentId: 'agent-research' }),
      providerId: 'codex',
      historyMessages: [],
    })

    expect(result.messages.some(message => (
      message.role === 'developer' &&
      String(message.content).includes('Prioritize crisp, source-backed reasoning.')
    ))).toBe(true)
  })

  it('injects speak mode guidance only for voice conversations', async () => {
    const voice = await buildPrompt({
      ...baseOptions({ speakMode: true, voiceConversation: true }),
      providerId: 'codex',
      historyMessages: [],
    })
    const text = await buildPrompt({
      ...baseOptions({ voiceConversation: false }),
      providerId: 'codex',
      historyMessages: [],
    })

    expect(JSON.stringify(voice.messages)).toContain('Voice Speak Mode')
    expect(JSON.stringify(text.messages)).not.toContain('Voice Speak Mode')
  })

  it('includes plugin prompt providers as plain developer sections without diffing', async () => {
    const unregister = registerPromptContextProvider('test-plugin', 'memory', async () => ({
      role: 'developer',
      source: 'plugins/test-plugin/memory',
      content: 'Plugin memory context',
    }))
    const result = await buildPrompt({
      ...baseOptions(),
      providerId: 'codex',
      historyMessages: [],
    })
    unregister()

    expect(result.messages.some(message => String(message.content).includes('Plugin memory context'))).toBe(true)
  })

  it('normalizes plugin user-role context to developer so only real history is user', async () => {
    const unregister = registerPromptContextProvider('soul-memory', 'graph-profile', async () => ({
      role: 'user',
      source: 'plugins/soul-memory/graph-profile',
      content: 'Graph memory context',
    }))
    const result = await buildPrompt({
      ...baseOptions(),
      providerId: 'codex',
      historyMessages: [{ role: 'user', content: 'real user message' }],
    })
    unregister()

    expect(result.messages.filter(message => message.role === 'user')).toEqual([{ role: 'user', content: 'real user message' }])
    expect(result.messages.some(message => message.role === 'developer' && String(message.content).includes('Graph memory context'))).toBe(true)
  })

  it('loads AGENTS instructions from project root to work directory with override priority', () => {
    const root = makeTempProject()
    const nested = path.join(root, 'packages', 'app')
    fs.mkdirSync(path.join(root, '.git'), { recursive: true })
    fs.mkdirSync(nested, { recursive: true })
    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'root instructions')
    fs.writeFileSync(path.join(nested, 'AGENTS.md'), 'nested normal instructions')
    fs.writeFileSync(path.join(nested, 'AGENTS.override.md'), 'nested override instructions')

    const content = loadAgentsMdInstructions(nested)

    expect(content).toContain('<project_context>')
    expect(content).toContain('<project_instructions path=')
    expect(content).toContain('root instructions')
    expect(content).toContain('nested override instructions')
    expect(content).not.toContain('nested normal instructions')
    expect(content!.indexOf('root instructions')).toBeLessThan(content!.indexOf('nested override instructions'))
  })

  it('uses only the current directory when no project root is found', () => {
    const root = makeTempProject()
    const nested = path.join(root, 'packages', 'app')
    fs.mkdirSync(nested, { recursive: true })
    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'root instructions')
    fs.writeFileSync(path.join(nested, 'AGENTS.md'), 'nested instructions')

    const content = loadAgentsMdInstructions(nested)

    expect(content).toContain('nested instructions')
    expect(content).not.toContain('root instructions')
  })

  it('preserves Codex base/developer/user layering', async () => {
    const result = await buildPrompt({
      ...baseOptions({ workingDirectory: '/repo' }),
      providerId: 'codex',
      historyMessages: [{ role: 'user', content: 'hello' }],
    })

    expect(result.messages[0].role).toBe('system')
    expect(result.messages.some(message => message.role === 'developer')).toBe(true)
    expect(result.messages.some(message => message.role === 'developer' && String(message.content).includes('Work Directory'))).toBe(true)
    expect(result.messages.filter(message => message.role === 'user')).toEqual([{ role: 'user', content: 'hello' }])
    expect(result.messages[result.messages.length - 1]).toEqual({ role: 'user', content: 'hello' })
  })

  it('folds developer sections into system for regular providers', async () => {
    const result = await buildPrompt({
      ...baseOptions({ workingDirectory: '/repo' }),
      providerId: 'openai',
      historyMessages: [{ role: 'user', content: 'hello' }],
    })

    expect(result.messages.some(message => message.role === 'developer')).toBe(false)
    expect(result.messages[0].role).toBe('system')
    expect(String(result.messages[0].content)).not.toContain('Permission Context')
    expect(result.messages[result.messages.length - 1]).toEqual({ role: 'user', content: 'hello' })
  })
})
