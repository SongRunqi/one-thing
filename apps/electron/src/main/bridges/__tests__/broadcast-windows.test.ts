import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] } }))

import { broadcastToAllWindows } from '../ipc-bridge-lifecycle.js'

describe('broadcastToAllWindows', () => {
  it('sends to every live window and skips destroyed ones', () => {
    const live = { isDestroyed: () => false, webContents: { send: vi.fn() } }
    const dead = { isDestroyed: () => true, webContents: { send: vi.fn() } }
    const settingsWindow = { isDestroyed: () => false, webContents: { send: vi.fn() } }

    broadcastToAllWindows('plugins:notification', { pluginId: 'p' }, () => [live, dead, settingsWindow])

    expect(live.webContents.send).toHaveBeenCalledWith('plugins:notification', { pluginId: 'p' })
    expect(settingsWindow.webContents.send).toHaveBeenCalledWith('plugins:notification', { pluginId: 'p' })
    expect(dead.webContents.send).not.toHaveBeenCalled()
  })

  it('one window closing mid-broadcast does not stop the others', () => {
    const closing = {
      isDestroyed: () => false,
      webContents: { send: vi.fn(() => { throw new Error('Object has been destroyed') }) },
    }
    const other = { isDestroyed: () => false, webContents: { send: vi.fn() } }

    expect(() => broadcastToAllWindows('c', 1, () => [closing, other])).not.toThrow()
    expect(other.webContents.send).toHaveBeenCalledWith('c', 1)
  })
})
