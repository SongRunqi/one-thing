import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildContextCompactPrompt,
} from '@onething/core/engine'
import {
  buildSystemPromptSnapshotWithAdapters,
  mcpToolSnapshot,
  nativeToolSnapshot,
  providerConfigForPrompt,
  skillForInit,
  skillSnapshot,
  toolSnapshot,
} from '@onething/runtime/prompts'
import {
  buildOnethingPrompt as buildPrompt,
  buildOnethingSystemPrompt as buildSystemPrompt,
  clearAllPromptContextProviders,
  collectPluginPromptContext,
  getPromptContextProviderCount,
  normalizePromptContextProviderId,
  registerPromptContextProvider,
} from '@onething/runtime/prompts'

describe('core prompt context helpers', () => {
  afterEach(() => {
    clearAllPromptContextProviders()
  })

  it('builds context compact prompts without main prompt modules', () => {
    const prompt = buildContextCompactPrompt('USER: hello', '{"goal":"old"}')

    expect(prompt).toContain('Return valid JSON only')
    expect(prompt).toContain('Existing summary JSON or text:')
    expect(prompt).toContain('USER: hello')
  })

  it('normalizes provider ids and collects plugin prompt fragments', async () => {
    expect(normalizePromptContextProviderId('/memory')).toBe('memory')
    expect(normalizePromptContextProviderId('   ')).toBe('default')

    const unregister = registerPromptContextProvider('plugin-a', '/memory', () => ({
      role: 'user',
      content: 'Plugin memory context',
    }))
    registerPromptContextProvider('plugin-b', 'summary', () => 'Plugin summary context')

    expect(getPromptContextProviderCount()).toBe(2)
    const fragments = await collectPluginPromptContext({
      hasTools: true,
      skills: [],
    })

    expect(fragments).toEqual([
      {
        role: 'developer',
        source: 'plugins/plugin-a/memory',
        content: 'Plugin memory context',
      },
      {
        role: 'developer',
        source: 'plugins/plugin-b/summary',
        content: 'Plugin summary context',
      },
    ])

    unregister()
    expect(getPromptContextProviderCount()).toBe(1)
  })

  it('reports provider errors through host callback', async () => {
    const onProviderError = vi.fn()
    registerPromptContextProvider('plugin-a', 'bad', () => {
      throw new Error('boom')
    })

    await expect(collectPluginPromptContext({
      hasTools: true,
      skills: [],
    }, { onProviderError })).resolves.toEqual([])

    expect(onProviderError).toHaveBeenCalledWith('plugin-a/bad', expect.any(Error))
  })

  it('assembles onething system prompt messages without main agent or path stores', async () => {
    registerPromptContextProvider('plugin-a', 'memory', () => 'Plugin memory context')

    const prompt = await buildSystemPrompt({
      providerId: 'codex',
      agentName: 'Research Lead',
      agentSystemPrompt: 'Prefer concise source-backed reasoning.',
      hasTools: true,
      skills: [{
        name: 'review-workflow',
        description: 'Use when reviewing code.',
        source: 'user',
        path: '/skills/review-workflow/SKILL.md',
        enabled: true,
      }],
      toolNames: ['read'],
      workingDirectory: '/Users/example/project',
      workingDirectoryRoots: ['/Users/example/project', '/tmp/other'],
      homeDir: '/Users/example',
      platform: 'darwin',
      macOSAutomationDocsPath: '/docs/macos-automation.md',
      now: new Date('2026-06-25T00:00:00Z'),
    })

    expect(prompt.system).toContain('Current date: 2026-06-25')
    expect(prompt.developer.join('\n\n')).toContain('# Agent: Research Lead')
    expect(prompt.developer.join('\n\n')).toContain('Current work directory: ~/project (/Users/example/project)')
    expect(prompt.developer.join('\n\n')).toContain('<name>review-workflow</name>')
    expect(prompt.developer.join('\n\n')).toContain('/docs/macos-automation.md')
    expect(prompt.developer.join('\n\n')).toContain('Plugin memory context')

    const codex = await buildPrompt({
      providerId: 'codex',
      hasTools: true,
      skills: [],
      historyMessages: [{ role: 'user', content: 'hello' }],
      now: new Date('2026-06-25T00:00:00Z'),
    })
    expect(codex.messages[0].role).toBe('system')
    expect(codex.messages[codex.messages.length - 1]).toEqual({ role: 'user', content: 'hello' })

    const regular = await buildPrompt({
      providerId: 'openai',
      hasTools: true,
      skills: [],
      historyMessages: [{ role: 'user', content: 'hello' }],
      now: new Date('2026-06-25T00:00:00Z'),
    })
    expect(regular.messages.some(message => message.role === 'developer')).toBe(false)
    expect(regular.messages[0].role).toBe('system')
  })

  it('maps system prompt snapshot structures without shared IPC types', () => {
    const skill = {
      id: 'skill-1',
      name: 'review-workflow',
      description: 'Use when reviewing.',
      source: 'user' as const,
      category: 'quality',
      tags: ['review'],
      relatedSkills: ['testing'],
      conditions: { requiresTools: ['read'] },
      path: '/skills/review/SKILL.md',
      directoryPath: '/skills/review',
      enabled: true,
      allowedTools: ['read'],
      instructions: 'Read references/checklist.md.',
      files: [{ name: 'SKILL.md', path: '/skills/review/SKILL.md', type: 'markdown' as const }],
    }

    expect(skillForInit(skill)).toMatchObject({
      id: 'skill-1',
      name: 'review-workflow',
      files: [{ name: 'SKILL.md', type: 'markdown' }],
    })
    expect(skillSnapshot(skill)).toMatchObject({
      id: 'skill-1',
      allowedTools: ['read'],
      files: [{ name: 'SKILL.md', type: 'markdown' }],
    })

    expect(toolSnapshot({
      id: 'custom-tool',
      name: 'custom-tool',
      description: 'Custom tool',
      category: 'custom',
      enabled: true,
      autoExecute: false,
      parameters: [],
    })).toMatchObject({
      source: 'plugin',
      modelFacingName: 'custom-tool',
    })

    expect(mcpToolSnapshot('server__search', {
      description: 'Search',
      parameters: [{ name: 'query', type: 'mystery', description: 'Query' }],
    }).parameters?.[0].type).toBe('string')
    expect(nativeToolSnapshot('image_generation')).toMatchObject({
      source: 'native-provider',
      description: 'Native image output',
    })
    expect(providerConfigForPrompt({ apiKey: 'secret', baseUrl: 'https://example.test' }))
      .toEqual({ apiKey: 'secret', baseUrl: 'https://example.test' })
  })

  it('builds system prompt snapshots through host adapters', async () => {
    const skill = {
      id: 'skill-1',
      name: 'review-workflow',
      description: 'Use when reviewing.',
      source: 'user' as const,
      path: '/skills/review/SKILL.md',
      directoryPath: '/skills/review',
      enabled: true,
      instructions: 'Review carefully.',
    }
    const builtinTool = {
      id: 'read',
      name: 'read',
      description: 'Read files',
      category: 'builtin' as const,
      enabled: true,
      autoExecute: false,
      parameters: [],
    }
    const mcpRouterTool = {
      id: 'mcp_search',
      name: 'mcp_search',
      description: 'Search MCP servers',
      category: 'builtin' as const,
      enabled: true,
      autoExecute: false,
      parameters: [],
    }
    const initializeTools = vi.fn()

    const snapshot = await buildSystemPromptSnapshotWithAdapters({
      sessionId: 'session-1',
      getSession: () => ({
        agentId: 'agent-1',
        workingDirectory: '/tmp/project',
        workingDirectoryRoots: ['/tmp/project'],
      }),
      getSettings: () => ({
        skills: { enableSkills: true },
        tools: {
          enableToolCalls: true,
          tools: {
            mcp_search: { enabled: true },
          },
        },
      }),
      resolveProvider: async () => ({
        providerId: 'deepseek',
        model: 'deepseek-chat',
        providerConfig: {
          apiKey: 'secret',
          baseUrl: 'https://api.deepseek.test',
          model: 'deepseek-chat',
        },
        providerSupported: true,
        credentialsReady: true,
      }),
      resolveAgentLoopStreamRoute: () => ({
        enabled: true,
        enabledBy: 'settings',
        providerSupported: true,
        active: true,
        supportedProviderIds: ['deepseek'],
      }),
      getSkills: () => [skill],
      initializeTools,
      getEnabledTools: () => [builtinTool],
      getMCPRouterTool: () => mcpRouterTool,
      sourceToolsToModelDefinitions: tools => Object.fromEntries(tools.map(tool => [
        tool.id,
        {
          description: tool.description,
          parameters: tool.parameters,
        },
      ])),
      resolveModelSupportsTools: () => true,
      getNativeProviderTools: () => ['image_generation'],
      buildProjectDirsPromptVars: () => ({
        active: {
          hasActive: true,
          path: '/tmp/project',
          displayPath: '/tmp/project',
          description: 'project',
        },
        known: {
          hasAny: true,
          entries: [{
            path: '/tmp/project',
            displayPath: '/tmp/project',
            description: 'project',
          }],
        },
      }),
      getAgent: () => ({
        id: 'agent-1',
        name: 'Agent One',
      }),
      buildContextVariablesPromptText: () => 'vars',
      buildPrompt: input => {
        expect(input.hasTools).toBe(true)
        expect(input.toolNames).toEqual(['read', 'image_generation'])
        expect(input.mcpToolNames).toEqual(['mcp_search'])
        expect(input.contextVariables).toBe('vars')
        return {
          systemPrompt: '# Skills\nUse review-workflow.',
        }
      },
      now: () => 123,
    })

    expect(initializeTools).toHaveBeenCalledWith(expect.objectContaining({
      skills: [expect.objectContaining({ id: 'skill-1', name: 'review-workflow' })],
      providerId: 'deepseek',
      workingDirectory: '/tmp/project',
    }))
    expect(snapshot).toMatchObject({
      sessionId: 'session-1',
      generatedAt: 123,
      providerId: 'deepseek',
      model: 'deepseek-chat',
      providerSupported: true,
      credentialsReady: true,
      agentName: 'Agent One',
      systemPromptChars: 29,
      tools: {
        enableToolCalls: true,
        modelSupportsTools: true,
        hasTools: true,
        configuredCount: 3,
        modelFacingCount: 3,
      },
      skills: {
        enabled: true,
        includedInPrompt: true,
        count: 1,
      },
    })
    expect(snapshot.tools.builtin).toHaveLength(1)
    expect(snapshot.tools.mcp).toHaveLength(1)
    expect(snapshot.tools.nativeProvider).toHaveLength(1)
    expect(snapshot.skills.items[0]).toMatchObject({ id: 'skill-1' })
  })
})
