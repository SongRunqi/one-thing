import { describe, expect, it, vi } from 'vitest'
import { MAIN_TRAFFIC_LIGHT_POSITION } from '../../window/main-window.js'

const mocks = vi.hoisted(() => ({
  openExternal: vi.fn().mockResolvedValue(undefined),
  openPath: vi.fn().mockResolvedValue(''),
  showItemInFolder: vi.fn(),
  fromWebContents: vi.fn(),
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: mocks.fromWebContents,
  },
  shell: {
    openExternal: mocks.openExternal,
    openPath: mocks.openPath,
    showItemInFolder: mocks.showItemInFolder,
  },
}))

import {
  openElectronExternal,
  openElectronPath,
  revealElectronPath,
  setElectronWindowButtonVisibility,
} from '../operations.js'

describe('electron shell operations', () => {
  it('opens a path through Electron shell', async () => {
    const shell = {
      openExternal: vi.fn(),
      openPath: vi.fn().mockResolvedValue(''),
      showItemInFolder: vi.fn(),
    }

    await expect(openElectronPath('/tmp/file.txt', { shell })).resolves.toBe('')

    expect(shell.openPath).toHaveBeenCalledWith('/tmp/file.txt')
  })

  it('opens an external URL and returns the IPC success shape', async () => {
    const shell = {
      openExternal: vi.fn().mockResolvedValue(undefined),
      openPath: vi.fn(),
      showItemInFolder: vi.fn(),
    }

    await expect(openElectronExternal('https://example.com', { shell }))
      .resolves.toEqual({ success: true })

    expect(shell.openExternal).toHaveBeenCalledWith('https://example.com')
  })

  it('reveals a path through Electron shell', () => {
    const shell = {
      openExternal: vi.fn(),
      openPath: vi.fn(),
      showItemInFolder: vi.fn(),
    }

    revealElectronPath('/tmp/file.txt', { shell })

    expect(shell.showItemInFolder).toHaveBeenCalledWith('/tmp/file.txt')
  })

  it('sets macOS traffic light visibility and restores position when visible', () => {
    const win = {
      setWindowButtonVisibility: vi.fn(),
      setWindowButtonPosition: vi.fn(),
    }
    const browserWindow = {
      fromWebContents: vi.fn(() => win),
    }
    const sender = {} as any

    setElectronWindowButtonVisibility(sender, true, {
      platform: 'darwin',
      browserWindow,
    })

    expect(browserWindow.fromWebContents).toHaveBeenCalledWith(sender)
    expect(win.setWindowButtonVisibility).toHaveBeenCalledWith(true)
    // 引用常量而非字面量:这里和建窗时的 trafficLightPosition 必须同值
    expect(win.setWindowButtonPosition).toHaveBeenCalledWith({ ...MAIN_TRAFFIC_LIGHT_POSITION })
  })

  it('does not restore traffic light position when hiding buttons', () => {
    const win = {
      setWindowButtonVisibility: vi.fn(),
      setWindowButtonPosition: vi.fn(),
    }

    setElectronWindowButtonVisibility({} as any, false, {
      platform: 'darwin',
      browserWindow: {
        fromWebContents: vi.fn(() => win),
      },
    })

    expect(win.setWindowButtonVisibility).toHaveBeenCalledWith(false)
    expect(win.setWindowButtonPosition).not.toHaveBeenCalled()
  })

  it('ignores window button visibility changes outside macOS', () => {
    const browserWindow = {
      fromWebContents: vi.fn(),
    }

    setElectronWindowButtonVisibility({} as any, true, {
      platform: 'linux',
      browserWindow,
    })

    expect(browserWindow.fromWebContents).not.toHaveBeenCalled()
  })
})
