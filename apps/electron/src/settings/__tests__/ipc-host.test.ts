import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  allWindows: [] as any[],
  focusedWindow: null as any,
  showOpenDialog: vi.fn(),
  nativeThemeUpdated: vi.fn(),
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => mocks.allWindows),
    getFocusedWindow: vi.fn(() => mocks.focusedWindow),
  },
  dialog: {
    showOpenDialog: mocks.showOpenDialog,
  },
  ipcMain: {
    handle: vi.fn(),
  },
  nativeTheme: {
    shouldUseDarkColors: false,
    on: mocks.nativeThemeUpdated,
  },
}))

import {
  broadcastElectronSettingsChanged,
  broadcastElectronSystemThemeChanged,
  registerElectronSettingsIpcHandlers,
  registerElectronSystemThemeChangedBroadcast,
  showElectronOpenDialog,
} from '../ipc-host.js'

function windowMock(id: number, destroyed = false) {
  return {
    isDestroyed: vi.fn(() => destroyed),
    webContents: {
      id,
      send: vi.fn(),
    },
  }
}

describe('electron settings IPC host', () => {
  it('broadcasts system theme changes to live windows', () => {
    const first = windowMock(1)
    const destroyed = windowMock(2, true)

    broadcastElectronSystemThemeChanged({
      channel: 'system-theme-changed',
      getShouldUseDarkColors: () => true,
      getAllWindows: () => [first, destroyed],
    })

    expect(first.webContents.send).toHaveBeenCalledWith('system-theme-changed', 'dark')
    expect(destroyed.webContents.send).not.toHaveBeenCalled()
  })

  it('registers a native theme update callback', () => {
    const onUpdated = vi.fn()

    registerElectronSystemThemeChangedBroadcast({
      channel: 'system-theme-changed',
      onUpdated,
    })

    expect(onUpdated).toHaveBeenCalledWith(expect.any(Function))
  })

  it('broadcasts settings changes except to the sender webContents', () => {
    const sender = windowMock(1)
    const other = windowMock(2)
    const settings = { theme: 'dark' }

    broadcastElectronSettingsChanged({
      channel: 'settings-changed',
      settings,
      exceptWebContentsId: 1,
      getAllWindows: () => [sender, other],
    })

    expect(sender.webContents.send).not.toHaveBeenCalled()
    expect(other.webContents.send).toHaveBeenCalledWith('settings-changed', settings)
  })

  it('shows an open dialog attached to the focused window when available', async () => {
    const focusedWindow = {}
    const showOpenDialog = vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/tmp'] })

    await showElectronOpenDialog(
      { properties: ['openDirectory'] },
      {
        getFocusedWindow: () => focusedWindow as any,
        showOpenDialog: showOpenDialog as any,
      },
    )

    expect(showOpenDialog).toHaveBeenCalledWith(focusedWindow, { properties: ['openDirectory'] })
  })

  it('shows an unattached open dialog when there is no focused window', async () => {
    const showOpenDialog = vi.fn().mockResolvedValue({ canceled: true, filePaths: [] })

    await showElectronOpenDialog(
      { title: 'Pick a file' },
      {
        getFocusedWindow: () => null,
        showOpenDialog: showOpenDialog as any,
      },
    )

    expect(showOpenDialog).toHaveBeenCalledWith({ title: 'Pick a file' })
  })

  it('registers settings handlers against the provided IPC host', async () => {
    const handle = vi.fn()
    const openSettingsWindow = vi.fn().mockReturnValue({ success: true })
    const getSettings = vi.fn().mockResolvedValue({ success: true, settings: { theme: 'dark' } })
    const getSystemTheme = vi.fn().mockReturnValue({ success: true, theme: 'light' })
    const saveSettings = vi.fn().mockResolvedValue({ success: true, settings: { theme: 'light' } })
    const testProxy = vi.fn().mockResolvedValue({ success: true })
    const showOpenDialog = vi.fn().mockResolvedValue({ canceled: false, filePaths: ['/tmp'] })

    registerElectronSettingsIpcHandlers({
      channels: {
        openWindow: 'settings:open-window',
        getSettings: 'settings:get',
        getSystemTheme: 'settings:get-system-theme',
        saveSettings: 'settings:save',
        testProxy: 'network:test-proxy',
        showOpenDialog: 'dialog:show-open',
      },
      openSettingsWindow,
      getSettings,
      getSystemTheme,
      saveSettings,
      testProxy,
      showOpenDialog,
      ipcMain: { handle },
    })

    expect(handle).toHaveBeenCalledTimes(6)
    expect(handle.mock.calls.map(call => call[0])).toEqual([
      'settings:open-window',
      'settings:get',
      'settings:get-system-theme',
      'settings:save',
      'network:test-proxy',
      'dialog:show-open',
    ])

    const event = { sender: { id: 42 } }
    const settings = { theme: 'light' }
    const proxyRequest = { proxy: { enabled: true } }
    const dialogOptions = { properties: ['openDirectory'] }

    expect(handle.mock.calls[0][1]({})).toEqual({ success: true })
    await expect(handle.mock.calls[1][1]({})).resolves.toEqual({ success: true, settings: { theme: 'dark' } })
    expect(handle.mock.calls[2][1]({})).toEqual({ success: true, theme: 'light' })
    await expect(handle.mock.calls[3][1](event, settings)).resolves.toEqual({ success: true, settings: { theme: 'light' } })
    await expect(handle.mock.calls[4][1]({}, proxyRequest)).resolves.toEqual({ success: true })
    await expect(handle.mock.calls[5][1]({}, dialogOptions)).resolves.toEqual({
      canceled: false,
      filePaths: ['/tmp'],
    })

    expect(openSettingsWindow).toHaveBeenCalledWith()
    expect(getSettings).toHaveBeenCalledWith()
    expect(getSystemTheme).toHaveBeenCalledWith()
    expect(saveSettings).toHaveBeenCalledWith(settings, event)
    expect(testProxy).toHaveBeenCalledWith(proxyRequest)
    expect(showOpenDialog).toHaveBeenCalledWith(dialogOptions)
  })
})
