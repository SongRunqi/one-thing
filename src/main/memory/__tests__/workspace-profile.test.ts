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

  it('uses channel profile ids as memory workspace ids', () => {
    mocks.getSession.mockReturnValue({
      memoryProfileId: 'channel-wechat-default-user-1',
      memoryScopeId: 'channel:wechat:default:user-1',
      agentId: 'agent-research',
    })

    expect(resolveSessionMemoryProfileId('session-1')).toBe('channel-wechat-default-user-1')
    expect(resolveSessionAgentId('session-1')).toBe('channel-wechat-default-user-1')
  })

  it('keeps the main local profile on the default memory workspace', () => {
    mocks.getSession.mockReturnValue({
      memoryProfileId: 'local-owner',
      memoryScopeId: 'client:local-owner',
    })

    expect(resolveSessionMemoryProfileId('session-1')).toBe('local-owner')
    expect(resolveSessionAgentId('session-1')).toBe('default')
  })
})
