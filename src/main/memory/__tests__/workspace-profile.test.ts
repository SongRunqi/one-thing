import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
}))

vi.mock('../../store.js', () => ({
  getSession: mocks.getSession,
}))

const {
  resolveSessionAgentId,
  resolveSessionMemoryProfileId,
} = await import('../workspace.js')

describe('main memory workspace profile routing', () => {
  beforeEach(() => {
    mocks.getSession.mockReset()
  })

  it('never maps channel profile ids to agent workspaces', () => {
    mocks.getSession.mockReturnValue({
      memoryProfileId: 'channel-wechat-default-user-1',
      agentId: 'agent-research',
    })

    expect(resolveSessionMemoryProfileId('session-1')).toBe('channel-wechat-default-user-1')
    // Channel users route to <memoryRoot>/users/<profileId>; the agent
    // workspace id must stay driven by session.agentId alone.
    expect(resolveSessionAgentId('session-1')).toBe('agent-research')
  })

  it('keeps the main local profile on the default memory workspace', () => {
    mocks.getSession.mockReturnValue({
      memoryProfileId: 'local-owner',
    })

    expect(resolveSessionMemoryProfileId('session-1')).toBe('local-owner')
    expect(resolveSessionAgentId('session-1')).toBe('default')
  })

  it('keeps custom agent sessions on their agent workspace', () => {
    mocks.getSession.mockReturnValue({
      agentId: 'agent-research',
    })

    expect(resolveSessionMemoryProfileId('session-1')).toBe('default')
    expect(resolveSessionAgentId('session-1')).toBe('agent-research')
  })
})
