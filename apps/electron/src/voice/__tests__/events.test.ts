import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAllWindows: vi.fn(() => [] as any[]),
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: mocks.getAllWindows,
  },
}))

function windowMock(id: number, destroyed = false) {
  return {
    isDestroyed: vi.fn(() => destroyed),
    webContents: {
      id,
      send: vi.fn(),
    },
  }
}

describe('electron voice event broadcasting', () => {
  beforeEach(() => {
    mocks.getAllWindows.mockReset()
    mocks.getAllWindows.mockReturnValue([])
  })

  it('broadcasts payloads to all live windows except the sender', async () => {
    const { broadcastElectronVoiceMessage } = await import('../events.js')
    const sender = windowMock(1)
    const recipient = windowMock(2)
    const destroyed = windowMock(3, true)
    mocks.getAllWindows.mockReturnValue([sender, recipient, destroyed])

    broadcastElectronVoiceMessage({
      channel: 'voice:event',
      payload: { type: 'state' },
      exceptWebContentsId: 1,
    })

    expect(sender.webContents.send).not.toHaveBeenCalled()
    expect(destroyed.webContents.send).not.toHaveBeenCalled()
    expect(recipient.webContents.send).toHaveBeenCalledWith('voice:event', { type: 'state' })
  })

  it('sends a payload to a specific live window', async () => {
    const { sendElectronVoiceMessageToWindow } = await import('../events.js')
    const target = windowMock(7)

    expect(sendElectronVoiceMessageToWindow(target, 'voice:event', { type: 'runtime-ready' })).toBe(true)
    expect(target.webContents.send).toHaveBeenCalledWith('voice:event', { type: 'runtime-ready' })
  })

  it('skips destroyed or missing target windows', async () => {
    const { sendElectronVoiceMessageToWindow } = await import('../events.js')

    expect(sendElectronVoiceMessageToWindow(null, 'voice:event', {})).toBe(false)
    expect(sendElectronVoiceMessageToWindow(windowMock(8, true), 'voice:event', {})).toBe(false)
  })

  it('extracts sender webContents ids', async () => {
    const { getElectronWebContentsId } = await import('../events.js')

    expect(getElectronWebContentsId({ id: 42 })).toBe(42)
    expect(getElectronWebContentsId(null)).toBeUndefined()
  })
})
