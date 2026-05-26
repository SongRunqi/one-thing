import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  windows: [] as any[],
  BrowserWindow: vi.fn(),
}))

vi.mock('electron', () => {
  mocks.BrowserWindow.mockImplementation(function BrowserWindowMock() {
    const listeners = new Map<string, () => void>()
    const win = {
      webContents: {
        send: vi.fn(),
      },
      on: vi.fn((event: string, callback: () => void) => {
        listeners.set(event, callback)
      }),
      loadURL: vi.fn(),
      loadFile: vi.fn(),
      isDestroyed: vi.fn(() => false),
      destroy: vi.fn(() => {
        listeners.get('closed')?.()
      }),
    }
    mocks.windows.push(win)
    return win
  })

  return {
    BrowserWindow: mocks.BrowserWindow,
  }
})

describe('voice runtime window command delivery', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.windows.length = 0
    mocks.BrowserWindow.mockClear()
  })

  it('queues commands until the hidden runtime reports ready', async () => {
    const runtime = await import('../runtime-window.js')

    runtime.ensureVoiceRuntimeWindow()
    runtime.sendVoiceRuntimeCommand({ type: 'start-recording', settings: {} as any, sessionId: 'session-1', reason: 'manual' })

    expect(mocks.windows[0].webContents.send).not.toHaveBeenCalled()

    runtime.markVoiceRuntimeReady()
    runtime.flushVoiceRuntimeCommands()

    expect(mocks.windows[0].webContents.send).toHaveBeenCalledWith('voice:runtime-command', {
      type: 'start-recording',
      settings: {},
      sessionId: 'session-1',
      reason: 'manual',
    })
  })

  it('sends commands immediately after the runtime is ready', async () => {
    const runtime = await import('../runtime-window.js')

    runtime.ensureVoiceRuntimeWindow()
    runtime.markVoiceRuntimeReady()
    runtime.sendVoiceRuntimeCommand({ type: 'stop', reason: 'user' })

    expect(mocks.windows[0].webContents.send).toHaveBeenCalledWith('voice:runtime-command', {
      type: 'stop',
      reason: 'user',
    })
  })
})
