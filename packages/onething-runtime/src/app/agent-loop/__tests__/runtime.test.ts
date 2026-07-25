import { describe, expect, it } from 'vitest'
import { agentEventToChunk, runAgentLoop } from '@onething/core/agent-loop'
import { buildAgentLoopRuntime } from '../runtime.js'
import type { AgentMessage, AgentMessageContent, AgentProvider, AgentToolChoice } from '@onething/core/agent-loop'

interface SeenRuntimeRequest {
  messages: AgentMessage[]
  tools?: Array<{ name: string }>
  toolChoice?: AgentToolChoice
}

describe('agent loop runtime builder', () => {
  it('assembles provider, tools, skills, prompt injectors, and tool policy', async () => {
    const seen: SeenRuntimeRequest[] = []
    const provider: AgentProvider = {
      id: 'runtime-provider',
      capabilities: {
        capabilities: ['text-input', 'text-output', 'streaming', 'tool-calls'],
        inputModalities: ['text'],
        outputModalities: ['text'],
        supportsStreaming: true,
        supportsTools: true,
      },
      async *streamTurn(request) {
        seen.push({
          messages: request.messages.map(message => ({ ...message })),
          tools: request.tools?.map(tool => ({ name: tool.name })),
          toolChoice: request.toolChoice,
        })
        yield { type: 'text-delta', turn: request.turn, delta: 'runtime-ok' }
        yield { type: 'finish', turn: request.turn, finishReason: 'stop' }
      },
    }

    const runtime = await buildAgentLoopRuntime({
      provider,
      model: 'runtime-model',
      messages: [{ role: 'user', content: 'hello' }],
      sessionId: 's1',
      messageId: 'm1',
      tools: {
        tools: [
          {
            name: 'read',
            parameters: { type: 'object', properties: {}, required: [] },
            execute: async () => ({ content: 'read' }),
          },
          {
            name: 'write',
            parameters: { type: 'object', properties: {}, required: [] },
            execute: async () => ({ content: 'write' }),
          },
        ],
        policy: {
          allowedToolNames: ['read', 'write'],
          blockedToolNames: ['write'],
        },
      },
      skills: [{
        name: 'repo-skill',
        description: 'Repo workflow',
        instructions: 'Do not inject this body automatically.',
        location: '/skills/repo/SKILL.md',
      }],
      prompt: {
        systemPrompt: 'system base',
        injectors: [() => [{ role: 'system', content: 'dynamic extra' }]],
      },
    })

    const result = await runAgentLoop(runtime)

    expect(result.text).toBe('runtime-ok')
    expect(seen[0].tools).toEqual([{ name: 'read' }])
    expect(seen[0].toolChoice).toBe('auto')
    expect(seen[0].messages.map(message => message.content)).toEqual([
      expect.stringContaining('repo-skill'),
      'system base',
      'dynamic extra',
      'hello',
    ])
    expect(seen[0].messages[0].content).toContain('<available_skills>')
    expect(seen[0].messages[0].content).toContain('<location>/skills/repo/SKILL.md</location>')
    expect(seen[0].messages[0].content).not.toContain('Do not inject this body automatically.')
  })

  it('can preserve skill context without injecting a duplicate skill prompt', async () => {
    const seen: AgentMessageContent[][] = []
    const provider: AgentProvider = {
      id: 'runtime-provider',
      async *streamTurn(request) {
        seen.push(request.messages.map(message => message.content))
        yield { type: 'text-delta', turn: request.turn, delta: 'ok' }
        yield { type: 'finish', turn: request.turn, finishReason: 'stop' }
      },
    }

    const runtime = await buildAgentLoopRuntime({
      provider,
      model: 'runtime-model',
      messages: [
        { role: 'system', content: 'existing skill-aware prompt' },
        { role: 'user', content: 'hello' },
      ],
      sessionId: 's1',
      messageId: 'm1',
      skills: [{ name: 'repo-skill', description: 'Repo workflow' }],
      prompt: { injectSkills: false },
      beforeTurn: () => undefined,
    })

    expect(runtime.skills).toEqual([{ name: 'repo-skill', description: 'Repo workflow' }])
    expect(runtime.beforeTurn).toBeTypeOf('function')
    await runAgentLoop(runtime)

    expect(seen[0]).toEqual([
      'existing skill-aware prompt',
      'hello',
    ])
  })
})

describe('agent event chunk adapter', () => {
  it('maps agent stream events into provider-neutral chunks', () => {
    expect(agentEventToChunk({ type: 'text-delta', turn: 2, delta: 'hi' })).toEqual({
      type: 'text',
      turn: 2,
      text: 'hi',
    })
    expect(agentEventToChunk({
      type: 'tool-call-done',
      turn: 2,
      toolCall: { id: 'call_1', name: 'read', arguments: '{"path":"a"}' },
    })).toEqual({
      type: 'tool-call',
      turn: 2,
      toolCall: { id: 'call_1', name: 'read', arguments: '{"path":"a"}' },
    })
    expect(agentEventToChunk({
      type: 'turn-end',
      turn: 2,
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    })).toEqual({
      type: 'turn-end',
      turn: 2,
      finishReason: 'stop',
      usage: { inputTokens: 1, outputTokens: 2, totalTokens: 3 },
    })
    expect(agentEventToChunk({
      type: 'tool-metadata',
      turn: 2,
      toolCall: { id: 'call_1', name: 'edit', arguments: '{}' },
      update: { title: 'Preview edit', metadata: { path: '/tmp/a.txt' } },
    })).toEqual({
      type: 'tool-metadata',
      turn: 2,
      toolCall: { id: 'call_1', name: 'edit', arguments: '{}' },
      update: { title: 'Preview edit', metadata: { path: '/tmp/a.txt' } },
    })
    expect(agentEventToChunk({
      type: 'tool-partial-result',
      turn: 2,
      toolCall: { id: 'call_1', name: 'edit', arguments: '{}' },
      update: { content: [{ type: 'text', text: 'halfway' }] },
    })).toEqual({
      type: 'tool-partial-result',
      turn: 2,
      toolCall: { id: 'call_1', name: 'edit', arguments: '{}' },
      update: { content: [{ type: 'text', text: 'halfway' }] },
    })
    expect(agentEventToChunk({
      type: 'provider-data',
      turn: 2,
      providerData: {
        provider: 'codex',
        type: 'encrypted-reasoning',
        encryptedContent: 'encrypted-payload',
      },
    })).toEqual({
      type: 'provider-data',
      turn: 2,
      providerData: {
        provider: 'codex',
        type: 'encrypted-reasoning',
        encryptedContent: 'encrypted-payload',
      },
    })
  })
})
