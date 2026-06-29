import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn(),
  },
  shell: {
    openExternal: vi.fn(),
    openPath: vi.fn(),
    showItemInFolder: vi.fn(),
  },
}))

import { registerElectronShellIpcHandlers } from '../shell-controller.js'

describe('electron shell IPC host', () => {
  it('registers shell handlers against the provided IPC host', async () => {
    const handle = vi.fn()
    const sender = {} as any
    const operations = {
      openPath: vi.fn().mockResolvedValue(''),
      openExternal: vi.fn().mockResolvedValue({ success: true }),
      setWindowButtonVisibility: vi.fn(),
    }

    registerElectronShellIpcHandlers({
      getDataPath: () => '/home/test/.onething',
      ipcMain: { handle },
      operations,
    })

    expect(handle).toHaveBeenCalledTimes(4)
    expect(handle.mock.calls.map(call => call[0])).toEqual([
      'shell:open-path',
      'shell:open-external',
      'app:get-data-path',
      'window:set-button-visibility',
    ])

    await expect(handle.mock.calls[0][1]({ sender }, '/tmp/file.txt')).resolves.toBe('')
    await expect(handle.mock.calls[1][1]({ sender }, 'https://example.com')).resolves.toEqual({ success: true })
    expect(handle.mock.calls[2][1]({ sender })).toBe('/home/test/.onething')
    expect(handle.mock.calls[3][1]({ sender }, false)).toBeUndefined()

    expect(operations.openPath).toHaveBeenCalledWith('/tmp/file.txt')
    expect(operations.openExternal).toHaveBeenCalledWith('https://example.com')
    expect(operations.setWindowButtonVisibility).toHaveBeenCalledWith(sender, false)
  })
})
