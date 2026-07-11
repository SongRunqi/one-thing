import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  focusedWindow: null as any,
  allWindows: [] as any[],
  fromWebContents: vi.fn(),
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: mocks.fromWebContents,
    getFocusedWindow: vi.fn(() => mocks.focusedWindow),
    getAllWindows: vi.fn(() => mocks.allWindows),
  },
  ipcMain: {
    handle: vi.fn(),
  },
}))

function windowMock(url: string, options: { destroyed?: boolean, parent?: any } = {}) {
  return {
    isDestroyed: vi.fn(() => Boolean(options.destroyed)),
    focus: vi.fn(),
    getParentWindow: vi.fn(() => options.parent ?? null),
    webContents: {
      getURL: vi.fn(() => url),
      send: vi.fn(),
    },
  }
}

const isMainWindowUrl = (url: string) => url.includes('#/chat') || url.endsWith('#theme=dark')

describe('electron search window actions', () => {
  beforeEach(() => {
    mocks.focusedWindow = null
    mocks.allWindows = []
    mocks.fromWebContents.mockReset()
  })

  it('resolves a BrowserWindow from IPC sender webContents', async () => {
    const { getElectronSearchWindowFromWebContents } = await import('../window-actions.js')
    const source = windowMock('app://index.html#/search')
    const sender = {} as any
    mocks.fromWebContents.mockReturnValue(source)

    expect(getElectronSearchWindowFromWebContents(sender)).toBe(source)
    expect(mocks.fromWebContents).toHaveBeenCalledWith(sender)
  })

  it('finds the main window from source, parent, focus, then all windows', async () => {
    const { findElectronMainSearchWindow } = await import('../window-actions.js')
    const main = windowMock('app://index.html#/chat')
    const child = windowMock('app://index.html#/search', { parent: main })

    expect(findElectronMainSearchWindow(main, { isMainWindowUrl })).toBe(main)
    expect(findElectronMainSearchWindow(child, { isMainWindowUrl })).toBe(main)

    mocks.focusedWindow = main
    expect(findElectronMainSearchWindow(null, { isMainWindowUrl })).toBe(main)

    mocks.focusedWindow = null
    mocks.allWindows = [windowMock('app://index.html#/settings'), main]
    expect(findElectronMainSearchWindow(null, { isMainWindowUrl })).toBe(main)
  })

  it('toggles search only when a main window can be found', async () => {
    const { toggleElectronSearchWindowFrom } = await import('../window-actions.js')
    const main = windowMock('app://index.html#/chat')
    const toggleSearchWindow = vi.fn()

    expect(toggleElectronSearchWindowFrom({
      sourceWindow: main,
      isMainWindowUrl,
      toggleSearchWindow,
    })).toEqual({ success: true })
    expect(toggleSearchWindow).toHaveBeenCalledWith(main, undefined)

    toggleSearchWindow.mockClear()
    const openOptions = { intent: { type: 'split-panel', panelId: 'main' } }
    expect(toggleElectronSearchWindowFrom({
      sourceWindow: main,
      openOptions,
      isMainWindowUrl,
      toggleSearchWindow,
    })).toEqual({ success: true })
    expect(toggleSearchWindow).toHaveBeenCalledWith(main, openOptions)

    toggleSearchWindow.mockClear()
    expect(toggleElectronSearchWindowFrom({
      sourceWindow: null,
      isMainWindowUrl,
      getAllWindows: () => [],
      toggleSearchWindow,
    })).toEqual({ success: false })
    expect(toggleSearchWindow).not.toHaveBeenCalled()
  })

  it('closes search, resolves business actions, dispatches to the main window, and focuses it', async () => {
    const { executeElectronSearchActionFrom } = await import('../window-actions.js')
    const main = windowMock('app://index.html#/chat')
    const closeSearchWindow = vi.fn()
    const resolveActionId = vi.fn(async () => 'open-file:/tmp/today.md')

    await expect(executeElectronSearchActionFrom({
      sourceWindow: main,
      actionId: 'create-daily-note:%2Ftmp%2Ftoday.md',
      actionChannel: 'search:action',
      isMainWindowUrl,
      closeSearchWindow,
      resolveActionId,
    })).resolves.toEqual({ success: true })

    expect(closeSearchWindow).toHaveBeenCalledTimes(1)
    expect(resolveActionId).toHaveBeenCalledWith('create-daily-note:%2Ftmp%2Ftoday.md')
    expect(main.webContents.send).toHaveBeenCalledWith('search:action', 'open-file:/tmp/today.md')
    expect(main.focus).toHaveBeenCalledTimes(1)
  })

  it('warns when executing an action without a main window', async () => {
    const { executeElectronSearchActionFrom } = await import('../window-actions.js')
    const logger = { warn: vi.fn() }

    await expect(executeElectronSearchActionFrom({
      sourceWindow: null,
      actionId: 'open-file:/tmp/today.md',
      actionChannel: 'search:action',
      isMainWindowUrl,
      closeSearchWindow: vi.fn(),
      resolveActionId: async actionId => actionId,
      getAllWindows: () => [],
      logger,
    })).resolves.toEqual({ success: false })

    expect(logger.warn).toHaveBeenCalledWith('[Search] No main app window found for action:', 'open-file:/tmp/today.md')
  })

  it('registers search IPC handlers and resolves source windows from sender webContents', async () => {
    const { registerElectronSearchIpcHandlers } = await import('../window-actions.js')
    const handle = vi.fn()
    const source = windowMock('app://index.html#/search')
    const sender = {} as any
    const toggleWindow = vi.fn().mockReturnValue({ success: true })
    const closeWindow = vi.fn().mockReturnValue({ success: true })
    const query = vi.fn().mockResolvedValue({ success: true, results: [] })
    const executeAction = vi.fn().mockResolvedValue({ success: true })
    const setAnchor = vi.fn().mockReturnValue({ success: true })
    mocks.fromWebContents.mockReturnValue(source)

    registerElectronSearchIpcHandlers({
      channels: {
        toggleWindow: 'search-window:toggle',
        closeWindow: 'search-window:close',
        query: 'search:query',
        executeAction: 'search:execute-action',
        setAnchor: 'search-window:set-anchor',
      },
      toggleWindow,
      closeWindow,
      query,
      executeAction,
      setAnchor,
      ipcMain: { handle },
    })

    expect(handle).toHaveBeenCalledTimes(5)
    expect(handle.mock.calls.map(call => call[0])).toEqual([
      'search-window:toggle',
      'search-window:set-anchor',
      'search-window:close',
      'search:query',
      'search:execute-action',
    ])

    const openOptions = { intent: { type: 'split-panel', panelId: 'main' } }
    expect(handle.mock.calls[0][1]({ sender }, openOptions)).toEqual({ success: true })
    expect(toggleWindow).toHaveBeenCalledWith(source, openOptions)
    expect(mocks.fromWebContents).toHaveBeenCalledWith(sender)

    const anchor = { x: 240, y: 0, width: 960, height: 800 }
    expect(handle.mock.calls[1][1]({}, anchor)).toEqual({ success: true })
    expect(setAnchor).toHaveBeenCalledWith(anchor)

    expect(handle.mock.calls[2][1]({})).toEqual({ success: true })

    const request = { query: 'abc' }
    await expect(handle.mock.calls[3][1]({}, request)).resolves.toEqual({ success: true, results: [] })
    expect(query).toHaveBeenCalledWith(request)

    await expect(handle.mock.calls[4][1]({ sender }, 'open-settings')).resolves.toEqual({ success: true })
    expect(executeAction).toHaveBeenCalledWith(source, 'open-settings')
  })
})
