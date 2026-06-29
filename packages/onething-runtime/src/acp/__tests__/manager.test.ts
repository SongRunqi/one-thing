import { afterEach, describe, expect, it } from 'vitest'
import { ACPManager } from '../manager.js'

afterEach(async () => {
  await ACPManager.shutdown()
})

describe('runtime ACP manager', () => {
  it('projects configured agents without starting host-specific code', () => {
    ACPManager.initialize({
      enabled: true,
      agents: [{
        id: 'agent-1',
        name: 'Test Agent',
        enabled: true,
        command: 'test-command',
        args: ['--model', 'test'],
        env: { TEST_ENV: '1' },
      }],
    })

    expect(ACPManager.getAgentStates()).toEqual([{
      config: {
        id: 'agent-1',
        name: 'Test Agent',
        enabled: true,
        command: 'test-command',
        args: ['--model', 'test'],
        env: { TEST_ENV: '1' },
      },
      status: 'disconnected',
      sessionCount: 0,
      activePromptCount: 0,
    }])
  })

  it('returns settings copies so callers cannot mutate manager state', () => {
    ACPManager.initialize({
      enabled: true,
      agents: [{
        id: 'agent-1',
        name: 'Test Agent',
        enabled: true,
        command: 'test-command',
        args: ['a'],
        env: { A: '1' },
      }],
    })

    const settings = ACPManager.getSettings()
    settings.agents[0].args?.push('mutated')
    settings.agents[0].env!.A = 'mutated'

    expect(ACPManager.getSettings().agents[0]).toMatchObject({
      args: ['a'],
      env: { A: '1' },
    })
  })
})
