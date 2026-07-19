import { describe, expect, it, vi } from 'vitest'
import { ACPClient } from '../client.js'
import type {
  ACPAgentConfig,
  ACPPermissionBridge,
  ACPPermissionRequestContext,
} from '../types.js'

const config: ACPAgentConfig = {
  id: 'agent-1',
  name: 'Test Agent',
  enabled: true,
  command: '/bin/false',
}

const params = {
  sessionId: 'acp-session-1',
  toolCall: {
    toolCallId: 'tc-1',
    title: 'Run ls',
    kind: 'execute',
    rawInput: { command: 'ls' },
  },
  options: [
    { optionId: 'opt-allow', name: 'Allow', kind: 'allow_once' },
    { optionId: 'opt-reject', name: 'Reject', kind: 'reject_once' },
  ],
} as never

function requestPermission(client: ACPClient, request: unknown = params) {
  return (client as unknown as {
    requestPermission(input: unknown): Promise<{ outcome: { outcome: string; optionId?: string } }>
  }).requestPermission(request)
}

describe('ACPClient permission bridge', () => {
  it('keeps legacy permissionMode resolution when no bridge is registered', async () => {
    const allowClient = new ACPClient({ ...config, permissionMode: 'allow' })
    await expect(requestPermission(allowClient)).resolves.toEqual({
      outcome: { outcome: 'selected', optionId: 'opt-allow' },
    })

    const rejectClient = new ACPClient({ ...config, permissionMode: 'reject' })
    await expect(requestPermission(rejectClient)).resolves.toEqual({
      outcome: { outcome: 'selected', optionId: 'opt-reject' },
    })
  })

  it('routes requests through the bridge and maps allow/reject/select/cancel decisions', async () => {
    const contexts: ACPPermissionRequestContext[] = []
    let decision: Awaited<ReturnType<ACPPermissionBridge>> = { behavior: 'allow' }
    const client = new ACPClient({ ...config, permissionMode: 'reject' }, {
      getPermissionBridge: () => async context => {
        contexts.push(context)
        return decision
      },
    })

    await expect(requestPermission(client)).resolves.toEqual({
      outcome: { outcome: 'selected', optionId: 'opt-allow' },
    })
    expect(contexts[0]).toMatchObject({
      agentId: 'agent-1',
      agentName: 'Test Agent',
      toolCall: { toolCallId: 'tc-1', title: 'Run ls', kind: 'execute', rawInput: { command: 'ls' } },
      options: [
        { optionId: 'opt-allow', name: 'Allow', kind: 'allow_once' },
        { optionId: 'opt-reject', name: 'Reject', kind: 'reject_once' },
      ],
    })

    decision = { behavior: 'reject' }
    await expect(requestPermission(client)).resolves.toEqual({
      outcome: { outcome: 'selected', optionId: 'opt-reject' },
    })

    decision = { behavior: 'select', optionId: 'opt-reject' }
    await expect(requestPermission(client)).resolves.toEqual({
      outcome: { outcome: 'selected', optionId: 'opt-reject' },
    })

    // Unknown optionId falls back to reject, never silent allow.
    decision = { behavior: 'select', optionId: 'missing' }
    await expect(requestPermission(client)).resolves.toEqual({
      outcome: { outcome: 'selected', optionId: 'opt-reject' },
    })

    decision = { behavior: 'cancel' }
    await expect(requestPermission(client)).resolves.toEqual({
      outcome: { outcome: 'cancelled' },
    })
  })

  it('rejects when the bridge throws, regardless of permissionMode allow', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const client = new ACPClient({ ...config, permissionMode: 'allow' }, {
        getPermissionBridge: () => async () => {
          throw new Error('bridge exploded')
        },
      })
      await expect(requestPermission(client)).resolves.toEqual({
        outcome: { outcome: 'selected', optionId: 'opt-reject' },
      })
    } finally {
      warn.mockRestore()
    }
  })

  it('attributes the request to the active prompt context when present', async () => {
    const contexts: ACPPermissionRequestContext[] = []
    const client = new ACPClient(config, {
      getPermissionBridge: () => async context => {
        contexts.push(context)
        return { behavior: 'allow' }
      },
    })
    const promptContexts = (client as unknown as {
      promptContexts: Map<string, { localSessionId: string; messageId?: string; cwd: string }>
    }).promptContexts
    promptContexts.set('acp-session-1', {
      localSessionId: 'local-1',
      messageId: 'msg-9',
      cwd: '/tmp/project',
    })

    await requestPermission(client)
    expect(contexts[0]).toMatchObject({
      localSessionId: 'local-1',
      messageId: 'msg-9',
      cwd: '/tmp/project',
    })
  })
})
