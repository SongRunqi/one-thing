import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

import { registerElectronSessionIpcHandlers } from '../sessions.js'

describe('electron sessions IPC host', () => {
  it('registers session handlers from definitions against the provided IPC host', async () => {
    const handle = vi.fn()
    const getSessions = vi.fn().mockResolvedValue({ success: true, sessions: [] })
    const activateSession = vi.fn().mockResolvedValue({ success: true, session: {} })

    registerElectronSessionIpcHandlers({
      handlers: [
        { channel: 'sessions:get-all', handle: getSessions },
        { channel: 'sessions:activate', handle: activateSession },
      ],
      ipcMain: { handle },
    })

    expect(handle).toHaveBeenCalledTimes(2)
    expect(handle.mock.calls.map(call => call[0])).toEqual([
      'sessions:get-all',
      'sessions:activate',
    ])

    const request = { sessionId: 'session-1' }
    await expect(handle.mock.calls[0][1]({})).resolves.toEqual({ success: true, sessions: [] })
    await expect(handle.mock.calls[1][1]({}, request)).resolves.toEqual({ success: true, session: {} })
    expect(getSessions).toHaveBeenCalledTimes(1)
    expect(activateSession).toHaveBeenCalledWith(request)
  })
})
