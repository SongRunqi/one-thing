import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

import { registerElectronMarkdownIpcHandlers } from '../markdown.js'

describe('electron markdown IPC host', () => {
  it('registers markdown handlers against the provided IPC host', async () => {
    const handle = vi.fn()
    const resolveAsset = vi.fn().mockResolvedValue({
      success: true,
      asset: { kind: 'image', rawTarget: 'image.png' },
    })
    const saveAttachments = vi.fn().mockResolvedValue({
      success: true,
      insertText: '![image](image.png)',
    })

    registerElectronMarkdownIpcHandlers({
      channels: {
        resolveAsset: 'markdown:resolve-asset',
        saveAttachments: 'markdown:save-attachments',
      },
      resolveAsset,
      saveAttachments,
      ipcMain: { handle },
    })

    expect(handle).toHaveBeenCalledTimes(2)
    expect(handle.mock.calls.map(call => call[0])).toEqual([
      'markdown:resolve-asset',
      'markdown:save-attachments',
    ])

    const resolveRequest = {
      documentPath: '/notes/a.md',
      rawTarget: 'image.png',
    }
    const saveRequest = {
      documentPath: '/notes/a.md',
      files: [{ fileName: 'image.png', mimeType: 'image/png', base64Data: 'abc' }],
    }

    await expect(handle.mock.calls[0][1]({}, resolveRequest)).resolves.toEqual({
      success: true,
      asset: { kind: 'image', rawTarget: 'image.png' },
    })
    await expect(handle.mock.calls[1][1]({}, saveRequest)).resolves.toEqual({
      success: true,
      insertText: '![image](image.png)',
    })

    expect(resolveAsset).toHaveBeenCalledWith(resolveRequest)
    expect(saveAttachments).toHaveBeenCalledWith(saveRequest)
  })
})
