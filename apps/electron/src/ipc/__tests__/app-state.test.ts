import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

import { registerElectronAppStateIpcHandlers } from '../app-state-controller.js'

describe('electron app-state IPC host', () => {
  it('registers app-state handlers against the provided IPC host', () => {
    const handle = vi.fn()
    const getAppState = vi.fn(() => ({ currentSessionId: 's1', currentWorkspaceId: null }))
    const saveUiState = vi.fn(() => ({ success: true }))

    registerElectronAppStateIpcHandlers({
      channels: {
        getAppState: 'app:get-state',
        saveUiState: 'app:save-ui-state',
      },
      getAppState,
      saveUiState,
      ipcMain: { handle },
    })

    expect(handle).toHaveBeenCalledTimes(2)

    const getHandler = handle.mock.calls[0][1]
    const saveHandler = handle.mock.calls[1][1]
    const uiState = { activeTabIndex: 2, sidebarCollapsed: true }

    expect(getHandler({})).toEqual({ currentSessionId: 's1', currentWorkspaceId: null })
    expect(saveHandler({}, uiState)).toEqual({ success: true })
    expect(getAppState).toHaveBeenCalledTimes(1)
    expect(saveUiState).toHaveBeenCalledWith(uiState)
  })
})
