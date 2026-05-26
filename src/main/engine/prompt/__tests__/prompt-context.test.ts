import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BuildPromptContextOptions } from '../context.js'
import {
  buildPromptContext,
  buildRequestMessages,
  initializePromptManager,
  loadAgentsMdInstructions,
  registerPromptContextProvider,
} from '../index.js'
import type { PromptSegment } from '../types.js'

const agentStoreMock = vi.hoisted(() => ({
  getAgent: vi.fn(),
}))

const todoPlanStoreMock = vi.hoisted(() => ({
  readTodoPlanSnapshot: vi.fn(),
}))

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
  },
}))

vi.mock('../../../agents/index.js', () => ({
  getAgent: agentStoreMock.getAgent,
  DEFAULT_AGENT_ID: 'default',
}))

vi.mock('../../../todo-plan/store.js', () => ({
  readTodoPlanSnapshot: todoPlanStoreMock.readTodoPlanSnapshot,
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

function requestSegments(request: ReturnType<typeof buildRequestMessages>): PromptSegment[] {
  return request.messages.flatMap(message => (message as any).sourceSegments ?? [])
}

function fragmentSegments(request: ReturnType<typeof buildRequestMessages>): PromptSegment[] {
  return requestSegments(request).filter(segment => segment.role !== 'base')
}

beforeAll(async () => {
  await initializePromptManager()
})

beforeEach(() => {
  agentStoreMock.getAgent.mockImplementation((agentId?: string) => ({
    id: agentId || 'default',
    name: agentId ? 'Custom Agent' : 'Default Agent',
    systemPrompt: '',
    isDefault: !agentId || undefined,
    createdAt: 1,
    updatedAt: 1,
  }))
  todoPlanStoreMock.readTodoPlanSnapshot.mockResolvedValue({
    directory: '/tmp/todo-plan',
    userNotes: [{
      id: 'user-note-1',
      scope: 'user-note',
      title: 'Personal Errands',
      role: 'user',
      filePath: '/tmp/todo-plan/user-notes/personal-errands.md',
      content: '# Personal Errands\n\n- [ ] Buy coffee',
      updatedAt: 1,
      totalTasks: 1,
    }],
    workspaceAiTodo: {
      id: 'workspace-ai-todo',
      scope: 'workspace-ai-todo',
      title: 'AI Todo',
      role: 'assistant',
      filePath: '/tmp/todo-plan/workspaces/demo/ai-todo.md',
      content: '# AI Todo\n\n## Now\n- [ ] Ship active todo autonomy\n\n## Later\n- [ ] Tighten heuristics',
      updatedAt: 1,
      totalTasks: 2,
    },
  })
})

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('PromptContextBuilder', () => {
  it('injects the full context when no baseline exists', async () => {
    const result = await buildPromptContext(baseOptions())
    const request = buildRequestMessages({
      providerId: 'codex',
      promptContext: result.state,
      emittedFragments: result.emittedFragments,
      historyMessages: [],
    })
    const segments = fragmentSegments(request)

    expect(result.baseInstructions.source).toBe('partials/base/base')
    expect(result.state.referenceSnapshot).toBeDefined()
    expect(result.emittedFragments.length).toBe(result.activeFragments.length)
    expect(result.emittedFragments.every(item => item.reason === 'initial')).toBe(true)
    expect(result.emittedFragments.some(item => item.role === 'developer')).toBe(true)
    expect(result.emittedFragments.some(item => item.role === 'user')).toBe(true)
    expect(result.emittedFragments.every(item => item.marker.start.startsWith('<'))).toBe(true)
    expect(segments).toHaveLength(result.emittedFragments.length)
    expect(segments.every(segment => segment.reason === 'initial')).toBe(true)
    expect(segments.every(segment => segment.emittedThisTurn === true)).toBe(true)
  })

  it('does not emit new fragments when the snapshot has not changed', async () => {
    const first = await buildPromptContext(baseOptions())
    const second = await buildPromptContext(baseOptions({ previousState: first.state }))
    const request = buildRequestMessages({
      providerId: 'codex',
      promptContext: second.state,
      emittedFragments: second.emittedFragments,
      historyMessages: [],
    })
    const segments = fragmentSegments(request)

    expect(second.emittedFragments).toEqual([])
    expect(second.state.items).toEqual(first.state.items)
    expect(segments.every(segment => segment.reason === 'initial')).toBe(true)
    expect(segments.every(segment => segment.emittedThisTurn !== true)).toBe(true)
  })

  it('emits only changed fragments after the baseline is present', async () => {
    const first = await buildPromptContext(baseOptions({ contextVariables: 'ticket = ABC-1' }))
    const second = await buildPromptContext(baseOptions({
      previousState: first.state,
      contextVariables: 'ticket = ABC-2',
    }))
    const request = buildRequestMessages({
      providerId: 'codex',
      promptContext: second.state,
      emittedFragments: second.emittedFragments,
      historyMessages: [],
    })
    const contextVariableSegments = fragmentSegments(request)
      .filter(segment => segment.source === 'context/context-variables')

    expect(second.emittedFragments.map(item => item.source)).toEqual(['context/context-variables'])
    expect(second.emittedFragments[0].reason).toBe('changed')
    expect(contextVariableSegments).toHaveLength(1)
    expect(contextVariableSegments[0].reason).toBe('changed')
    expect(contextVariableSegments[0].emittedThisTurn).toBe(true)
  })

  it('emits removal markers for context fragments that disappear', async () => {
    const first = await buildPromptContext(baseOptions({ contextVariables: 'ticket = ABC-1' }))
    const second = await buildPromptContext(baseOptions({ previousState: first.state }))
    const request = buildRequestMessages({
      providerId: 'codex',
      promptContext: second.state,
      emittedFragments: second.emittedFragments,
      historyMessages: [],
    })
    const removalSegment = fragmentSegments(request)
      .find(segment => segment.source === 'context/context-variables:removed')

    expect(second.emittedFragments).toHaveLength(1)
    expect(second.emittedFragments[0].source).toBe('context/context-variables:removed')
    expect(second.emittedFragments[0].reason).toBe('removed')
    expect(removalSegment?.reason).toBe('removed')
    expect(removalSegment?.emittedThisTurn).toBe(true)
  })

  it('includes async plugin prompt providers and diffs their removal', async () => {
    const unregister = registerPromptContextProvider('test-plugin', 'memory', async () => ({
      role: 'developer',
      source: 'plugins/test-plugin/memory',
      content: 'Plugin memory context',
    }))
    const first = await buildPromptContext(baseOptions())
    unregister()
    const second = await buildPromptContext(baseOptions({ previousState: first.state }))

    expect(first.activeFragments.some(item => item.source === 'plugins/test-plugin/memory')).toBe(true)
    expect(second.emittedFragments).toHaveLength(1)
    expect(second.emittedFragments[0].source).toBe('plugins/test-plugin/memory:removed')
    expect(second.emittedFragments[0].reason).toBe('removed')
  })

  it('injects custom Agent system prompts as developer fragments', async () => {
    agentStoreMock.getAgent.mockReturnValueOnce({
      id: 'agent-research',
      name: 'Research Lead',
      systemPrompt: 'Prioritize crisp, source-backed reasoning.',
      createdAt: 1,
      updatedAt: 1,
    })

    const result = await buildPromptContext(baseOptions({ agentId: 'agent-research' }))
    const agentFragment = result.activeFragments.find(item => item.source === 'agents/agent-research/system-prompt')
    const request = buildRequestMessages({
      providerId: 'codex',
      promptContext: result.state,
      emittedFragments: result.emittedFragments,
      historyMessages: [],
    })

    expect(result.state.referenceSnapshot?.agentId).toBe('agent-research')
    expect(agentFragment?.role).toBe('developer')
    expect(agentFragment?.content).toContain('# Agent: Research Lead')
    expect(agentFragment?.content).toContain('Prioritize crisp, source-backed reasoning.')
    expect(request.messages.some(message => (
      message.role === 'developer' &&
      String(message.content).includes('Prioritize crisp, source-backed reasoning.')
    ))).toBe(true)
  })

  it('injects speak mode guidance only for voice conversations', async () => {
    const voice = await buildPromptContext(baseOptions({ speakMode: true, voiceConversation: true }))
    const voiceFragment = voice.activeFragments.find(item => item.source === 'context/voice-speak-mode')
    const voiceRequest = buildRequestMessages({
      providerId: 'codex',
      promptContext: voice.state,
      emittedFragments: voice.emittedFragments,
      historyMessages: [],
    })

    expect(voiceFragment?.role).toBe('developer')
    expect(voiceFragment?.content).toContain('The assistant reply will be spoken aloud through TTS.')
    expect(voiceFragment?.content).toContain('Do not output special speech markup tags.')
    expect(voiceRequest.messages.some(message => (
      message.role === 'developer' &&
      String(message.content).includes('Voice Speak Mode')
    ))).toBe(true)

    const text = await buildPromptContext(baseOptions({ voiceConversation: false }))
    expect(text.activeFragments.some(item => item.source === 'context/voice-speak-mode')).toBe(false)
  })

  it('injects active workspace todo context when todo_plan is enabled', async () => {
    const result = await buildPromptContext(baseOptions({
      sessionId: 'session-1',
      workingDirectory: '/repo',
      toolNames: ['read', 'todo_plan'],
      settings: {
        general: {
          todoPlan: {
            enabled: true,
            autonomy: 'active',
          },
        },
      } as any,
    }))
    const todoFragment = result.activeFragments.find(item => item.source === 'context/todo-plan-autonomy')
    const request = buildRequestMessages({
      providerId: 'codex',
      promptContext: result.state,
      emittedFragments: result.emittedFragments,
      historyMessages: [],
    })

    expect(todoPlanStoreMock.readTodoPlanSnapshot).toHaveBeenCalledWith({
      sessionId: 'session-1',
      workingDirectory: '/repo',
    })
    expect(todoFragment?.role).toBe('developer')
    expect(todoFragment?.content).toContain('Mode: active')
    expect(todoFragment?.content).toContain('workspace-ai-todo')
    expect(todoFragment?.content).toContain('User todo capture policy')
    expect(todoFragment?.content).toContain('Personal Errands')
    expect(todoFragment?.content).toContain('Ship active todo autonomy')
    expect(request.messages.some(message => (
      message.role === 'developer' &&
      String(message.content).includes('Todo / Notes Autonomy')
    ))).toBe(true)
  })

  it('skips todo autonomy context when disabled or unavailable', async () => {
    const disabled = await buildPromptContext(baseOptions({
      toolNames: ['read', 'todo_plan'],
      settings: {
        general: {
          todoPlan: {
            enabled: true,
            autonomy: 'off',
          },
        },
      } as any,
    }))
    const withoutTool = await buildPromptContext(baseOptions({
      toolNames: ['read'],
      settings: {
        general: {
          todoPlan: {
            enabled: true,
            autonomy: 'active',
          },
        },
      } as any,
    }))

    expect(disabled.activeFragments.some(item => item.source === 'context/todo-plan-autonomy')).toBe(false)
    expect(withoutTool.activeFragments.some(item => item.source === 'context/todo-plan-autonomy')).toBe(false)
  })

  it('loads AGENTS instructions from project root to working directory with override priority', () => {
    const root = makeTempProject()
    const nested = path.join(root, 'packages', 'app')
    fs.mkdirSync(path.join(root, '.git'), { recursive: true })
    fs.mkdirSync(nested, { recursive: true })
    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'root instructions')
    fs.writeFileSync(path.join(nested, 'AGENTS.md'), 'nested normal instructions')
    fs.writeFileSync(path.join(nested, 'AGENTS.override.md'), 'nested override instructions')

    const content = loadAgentsMdInstructions(nested)

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
    const promptContext = (await buildPromptContext(baseOptions())).state
    const request = buildRequestMessages({
      providerId: 'codex',
      promptContext,
      historyMessages: [{ role: 'user', content: 'hello' }],
    })

    expect(request.messages[0].role).toBe('system')
    expect(request.messages.some(message => message.role === 'developer')).toBe(true)
    expect(request.messages.some(message => message.role === 'user' && String(message.content).includes('<partials_context_working_directory>'))).toBe(true)
    expect(request.messages[request.messages.length - 1]).toEqual({ role: 'user', content: 'hello' })
  })

  it('folds developer fragments into system for regular providers', async () => {
    const promptContext = (await buildPromptContext(baseOptions())).state
    const request = buildRequestMessages({
      providerId: 'openai',
      promptContext,
      historyMessages: [{ role: 'user', content: 'hello' }],
    })

    expect(request.messages.some(message => message.role === 'developer')).toBe(false)
    expect(request.messages[0].role).toBe('system')
    expect(String(request.messages[0].content)).toContain('Permission Context')
    expect(request.systemPromptSegments.some(segment => segment.role === 'developer')).toBe(true)
    expect(request.messages[request.messages.length - 1]).toEqual({ role: 'user', content: 'hello' })
  })
})
