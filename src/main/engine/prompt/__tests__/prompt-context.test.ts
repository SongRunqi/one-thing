import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { BuildPromptContextOptions } from '../context.js'
import {
  buildPromptContext,
  buildRequestMessages,
  initializePromptManager,
  loadAgentsMdInstructions,
  registerPromptContextProvider,
} from '../index.js'
import type { PromptSegment } from '../types.js'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
  },
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
    expect(contextVariableSegments).toHaveLength(2)
    expect(contextVariableSegments[0].reason).toBe('initial')
    expect(contextVariableSegments[0].emittedThisTurn).not.toBe(true)
    expect(contextVariableSegments[1].reason).toBe('changed')
    expect(contextVariableSegments[1].emittedThisTurn).toBe(true)
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
