import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  on: vi.fn(),
  getFocusedWindow: vi.fn(),
}))

vi.mock('electron', () => ({
  app: {
    on: mocks.on,
  },
  BrowserWindow: {
    getFocusedWindow: mocks.getFocusedWindow,
  },
}))

describe('electron did-become-active handler', () => {
  it('activates the main window when the todo panel is focused', async () => {
    const { registerElectronDidBecomeActiveHandler } = await import('../did-become-active.js')
    const app = { on: vi.fn() }
    const mainWindow = { isDestroyed: () => false } as any
    const focusedWindow = { id: 'todo' } as any
    const activateMainWindow = vi.fn()

    registerElectronDidBecomeActiveHandler({
      app,
      browserWindow: { getFocusedWindow: () => focusedWindow },
      defer: callback => callback(),
      getMainWindow: () => mainWindow,
      isTodoPlanWindow: window => window === focusedWindow,
      activateMainWindow,
    })
    app.on.mock.calls[0][1]()

    expect(app.on).toHaveBeenCalledWith('did-become-active', expect.any(Function))
    expect(activateMainWindow).toHaveBeenCalledWith(mainWindow)
  })

  it('skips missing, destroyed, and non-todo focused windows', async () => {
    const { registerElectronDidBecomeActiveHandler } = await import('../did-become-active.js')
    const app = { on: vi.fn() }
    const activateMainWindow = vi.fn()
    const windows = [
      null,
      { isDestroyed: () => true },
      { isDestroyed: () => false },
    ] as any[]

    registerElectronDidBecomeActiveHandler({
      app,
      browserWindow: { getFocusedWindow: () => ({ id: 'main' }) as any },
      defer: callback => callback(),
      getMainWindow: () => windows.shift() ?? null,
      isTodoPlanWindow: () => false,
      activateMainWindow,
    })

    app.on.mock.calls[0][1]()
    app.on.mock.calls[0][1]()
    app.on.mock.calls[0][1]()

    expect(activateMainWindow).not.toHaveBeenCalled()
  })

  it('uses Electron app and BrowserWindow by default', async () => {
    const { registerElectronDidBecomeActiveHandler } = await import('../did-become-active.js')

    registerElectronDidBecomeActiveHandler({
      defer: callback => callback(),
      getMainWindow: () => ({ isDestroyed: () => false }) as any,
      isTodoPlanWindow: () => false,
      activateMainWindow: vi.fn(),
    })

    expect(mocks.on).toHaveBeenCalledWith('did-become-active', expect.any(Function))
    mocks.on.mock.calls.at(-1)?.[1]()
    expect(mocks.getFocusedWindow).toHaveBeenCalledTimes(1)
  })
})
