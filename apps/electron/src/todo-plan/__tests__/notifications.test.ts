import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAllWindows: vi.fn(() => [] as any[]),
  openPath: vi.fn(),
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: mocks.getAllWindows,
  },
  shell: {
    openPath: mocks.openPath,
  },
}))

function windowMock(destroyed = false) {
  return {
    isDestroyed: vi.fn(() => destroyed),
    webContents: {
      send: vi.fn(),
    },
  }
}

describe('electron todo-plan notifications', () => {
  beforeEach(() => {
    mocks.getAllWindows.mockReset()
    mocks.getAllWindows.mockReturnValue([])
    mocks.openPath.mockReset()
    mocks.openPath.mockResolvedValue('')
  })

  it('broadcasts todo-plan changes to live windows', async () => {
    const { broadcastElectronTodoPlanChanged } = await import('../notifications.js')
    const liveWindow = windowMock()
    const destroyedWindow = windowMock(true)
    const payload = { scope: 'global-user' as const }
    mocks.getAllWindows.mockReturnValue([liveWindow, destroyedWindow])

    broadcastElectronTodoPlanChanged({
      channel: 'todo-plan:changed',
      payload,
    })

    expect(liveWindow.webContents.send).toHaveBeenCalledWith('todo-plan:changed', payload)
    expect(destroyedWindow.webContents.send).not.toHaveBeenCalled()
  })

  it('opens the todo-plan directory through Electron shell', async () => {
    const { revealElectronTodoPlanDirectory } = await import('../notifications.js')

    await expect(revealElectronTodoPlanDirectory('/tmp/todo-plan')).resolves.toBe('')

    expect(mocks.openPath).toHaveBeenCalledWith('/tmp/todo-plan')
  })
})
