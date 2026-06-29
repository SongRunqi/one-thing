import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

import { registerElectronPermissionIpcHandlers } from '../permission.js'

describe('electron permission IPC host', () => {
  it('registers permission handlers against the provided IPC host', async () => {
    const handle = vi.fn()
    const getPending = vi.fn().mockResolvedValue({ success: true, pending: [] })
    const clearSession = vi.fn().mockResolvedValue({ success: true })
    const listGrants = vi.fn().mockResolvedValue({ success: true, sessionGrants: [], workspaceGrants: [] })
    const revokeGrant = vi.fn().mockResolvedValue({ success: true })
    const clearSessionGrants = vi.fn().mockResolvedValue({ success: true })
    const clearWorkspaceGrants = vi.fn().mockResolvedValue({ success: true })

    registerElectronPermissionIpcHandlers({
      channels: {
        getPending: 'permission:get-pending',
        clearSession: 'permission:clear-session',
        listGrants: 'permission:list-grants',
        revokeGrant: 'permission:revoke-grant',
        clearSessionGrants: 'permission:clear-session-grants',
        clearWorkspaceGrants: 'permission:clear-workspace-grants',
      },
      getPending,
      clearSession,
      listGrants,
      revokeGrant,
      clearSessionGrants,
      clearWorkspaceGrants,
      ipcMain: { handle },
    })

    expect(handle).toHaveBeenCalledTimes(6)
    expect(handle.mock.calls.map(call => call[0])).toEqual([
      'permission:get-pending',
      'permission:list-grants',
      'permission:revoke-grant',
      'permission:clear-session-grants',
      'permission:clear-workspace-grants',
      'permission:clear-session',
    ])

    const listRequest = { sessionId: 'session-1', workspaceRoot: '/repo' }
    const revokeRequest = { id: 'grant-1' }
    const clearSessionGrantsRequest = { sessionId: 'session-1' }
    const clearWorkspaceGrantsRequest = { workspaceRoot: '/repo' }

    await expect(handle.mock.calls[0][1]({}, 'session-1')).resolves.toEqual({ success: true, pending: [] })
    await expect(handle.mock.calls[1][1]({}, listRequest)).resolves.toEqual({
      success: true,
      sessionGrants: [],
      workspaceGrants: [],
    })
    await expect(handle.mock.calls[2][1]({}, revokeRequest)).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[3][1]({}, clearSessionGrantsRequest)).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[4][1]({}, clearWorkspaceGrantsRequest)).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[5][1]({}, 'session-1')).resolves.toEqual({ success: true })

    expect(getPending).toHaveBeenCalledWith('session-1')
    expect(listGrants).toHaveBeenCalledWith(listRequest)
    expect(revokeGrant).toHaveBeenCalledWith(revokeRequest)
    expect(clearSessionGrants).toHaveBeenCalledWith(clearSessionGrantsRequest)
    expect(clearWorkspaceGrants).toHaveBeenCalledWith(clearWorkspaceGrantsRequest)
    expect(clearSession).toHaveBeenCalledWith('session-1')
  })
})
