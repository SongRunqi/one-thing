import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

import { registerElectronSessionCommandIpcHandler } from '../session-command.js'

describe('electron session-command IPC host', () => {
  it('registers the session command handler against the provided IPC host', async () => {
    const handle = vi.fn()
    const handleCommand = vi.fn().mockResolvedValue({ success: true, result: undefined })

    registerElectronSessionCommandIpcHandler({
      channel: 'session:command',
      handleCommand,
      ipcMain: { handle },
    })

    expect(handle).toHaveBeenCalledTimes(1)
    expect(handle.mock.calls[0][0]).toBe('session:command')

    const request = {
      sessionId: 'session-1',
      command: { type: 'command:send-message', content: 'hello' },
    }

    await expect(handle.mock.calls[0][1]({}, request)).resolves.toEqual({
      success: true,
      result: undefined,
    })
    expect(handleCommand).toHaveBeenCalledWith(request)
  })
})
