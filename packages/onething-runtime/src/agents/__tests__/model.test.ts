/**
 * A0 (agent-domain-model.md M1/M2/M3/M7): the three projections and the two
 * classification predicates — including the mirror discipline with the shared
 * layer. The product layer must not import `@shared/ipc` in src, so renderer
 * and product each carry an implementation; this test (tests are outside the
 * boundary rules) pins the two to the same semantics.
 */
import { describe, expect, it } from 'vitest'
import {
  agentCapability,
  agentIdentity,
  agentMind,
  isActiveAgent,
  isColleague,
} from '../model.js'
import type { OnethingAgentDefinition } from '../store.js'
import {
  isActiveAgent as sharedIsActiveAgent,
  isColleague as sharedIsColleague,
} from '@shared/ipc/agents.js'

function fullAgent(): OnethingAgentDefinition {
  return {
    id: 'agent-a',
    name: '小李',
    systemPrompt: 'you are 小李',
    tools: ['bash'],
    createdAt: 1,
    updatedAt: 2,
    title: '工程师',
    avatar: '🛠️',
    avatarImage: 'abc.png',
    color: '#f00',
    description: '写代码',
    model: { providerId: 'claude', modelId: 'sonnet' },
    toolGrants: ['collab-room'],
    permissionMode: 'ask',
    maxTurns: 8,
    kind: 'colleague',
    status: 'active',
    executor: { type: 'external', connectorId: 'claude-code-agent' },
  }
}

describe('classification predicates (M2/M3)', () => {
  it('interprets an absent kind as colleague and an absent status as active', () => {
    expect(isColleague({})).toBe(true)
    expect(isActiveAgent({})).toBe(true)
  })

  it('recognizes explicit values', () => {
    expect(isColleague({ kind: 'colleague' })).toBe(true)
    expect(isColleague({ kind: 'service' })).toBe(false)
    expect(isActiveAgent({ status: 'active' })).toBe(true)
    expect(isActiveAgent({ status: 'retired' })).toBe(false)
  })

  it('mirrors the shared-layer predicates exactly (renderer parity)', () => {
    const cases = [
      {},
      { kind: 'colleague' as const },
      { kind: 'service' as const },
      { status: 'active' as const },
      { status: 'retired' as const },
      { kind: 'service' as const, status: 'retired' as const },
    ]
    for (const agent of cases) {
      expect(sharedIsColleague(agent)).toBe(isColleague(agent))
      expect(sharedIsActiveAgent(agent)).toBe(isActiveAgent(agent))
    }
  })
})

describe('projections (M1)', () => {
  it('identity carries the referenced face only — no mind or capability fields', () => {
    const identity = agentIdentity(fullAgent())
    expect(identity).toEqual({
      id: 'agent-a',
      name: '小李',
      title: '工程师',
      avatar: '🛠️',
      avatarImage: 'abc.png',
      color: '#f00',
      description: '写代码',
      kind: 'colleague',
      status: 'active',
    })
    expect(identity).not.toHaveProperty('systemPrompt')
    expect(identity).not.toHaveProperty('tools')
  })

  it('mind carries what a turn assembles — prompt, model binding, executor', () => {
    expect(agentMind(fullAgent())).toEqual({
      systemPrompt: 'you are 小李',
      model: { providerId: 'claude', modelId: 'sonnet' },
      executor: { type: 'external', connectorId: 'claude-code-agent' },
    })
  })

  it('capability carries the execution guards', () => {
    expect(agentCapability(fullAgent())).toEqual({
      tools: ['bash'],
      toolGrants: ['collab-room'],
      permissionMode: 'ask',
      maxTurns: 8,
    })
  })

  it('resolves the defaults for a legacy row: colleague, active, native executor', () => {
    const legacy: OnethingAgentDefinition = {
      id: 'old',
      name: 'Old',
      systemPrompt: '',
      createdAt: 1,
      updatedAt: 1,
    }
    const identity = agentIdentity(legacy)
    expect(identity.kind).toBe('colleague')
    expect(identity.status).toBe('active')
    expect(agentMind(legacy).executor).toEqual({ type: 'native' })
  })
})
