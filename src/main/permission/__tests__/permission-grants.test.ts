import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../stores/paths.js', () => {
  let data: any = { grants: [] }
  return {
    getPermissionsDir: () => '/tmp/onething-permissions-test',
    getSettingsPath: () => '/tmp/onething-permissions-test/settings.json',
    getFileMutationsDir: () => '/tmp/onething-permissions-test/file-mutations',
    getToolOutputsDir: () => '/tmp/onething-permissions-test/tool-outputs',
    getMCPToolsCatalogPath: () => '/tmp/onething-permissions-test/mcp-tools.json',
    ensureDir: () => undefined,
    readJsonFile: (_path: string, defaultValue: any) => _path.endsWith('workspace-grants.json') ? data : defaultValue,
    writeJsonFile: (_path: string, next: any) => { if (_path.endsWith('workspace-grants.json')) data = next },
  }
})

describe('permission grants', () => {
  beforeEach(async () => {
    const { resetPermissionGrantsForTests } = await import('../permission-grants')
    resetPermissionGrantsForTests()
  })

  it('matches session grants only within the same session', async () => {
    const { addGrant, matchGrant } = await import('../permission-grants')
    const grant = addGrant({
      scope: 'session',
      type: 'bash',
      pattern: 'git status *',
      sessionId: 's1',
      createdFrom: { messageId: 'm1', title: 'git status' },
    })

    expect(matchGrant({ type: 'bash', pattern: 'git status --short', sessionId: 's1' })?.id).toBe(grant.id)
    expect(matchGrant({ type: 'bash', pattern: 'git status --short', sessionId: 's2' })).toBeUndefined()
  })

  it('matches workspace grants only within the same workspace', async () => {
    const { addGrant, matchGrant } = await import('../permission-grants')
    const grant = addGrant({
      scope: 'workspace',
      type: 'file_write',
      pattern: '/repo/*',
      workspaceRoot: '/repo',
      createdFrom: { messageId: 'm1', title: 'write' },
    })

    expect(matchGrant({ type: 'file_write', pattern: '/repo/a.ts', workspaceRoot: '/repo' })?.id).toBe(grant.id)
    expect(matchGrant({ type: 'file_write', pattern: '/repo/a.ts', workspaceRoot: '/other' })).toBeUndefined()
  })

  it('supports revoke and clear session grants', async () => {
    const { addGrant, clearSessionGrants, listSessionGrants, matchGrant, revokeGrant } = await import('../permission-grants')
    const grant = addGrant({
      scope: 'session',
      type: 'mcp',
      pattern: 'mcp:foo',
      sessionId: 's1',
      createdFrom: { messageId: 'm1', title: 'mcp' },
    })

    expect(matchGrant({ type: 'mcp', pattern: 'mcp:foo', sessionId: 's1' })).toBeTruthy()
    expect(revokeGrant(grant.id)).toBe(true)
    expect(matchGrant({ type: 'mcp', pattern: 'mcp:foo', sessionId: 's1' })).toBeUndefined()

    addGrant({
      scope: 'session',
      type: 'mcp',
      pattern: 'mcp:bar',
      sessionId: 's1',
      createdFrom: { messageId: 'm2', title: 'mcp' },
    })
    expect(listSessionGrants('s1')).toHaveLength(2)
    clearSessionGrants('s1')
    expect(listSessionGrants('s1')).toHaveLength(0)
  })
})
