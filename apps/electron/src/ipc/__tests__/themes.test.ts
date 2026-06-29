import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}))

import { registerElectronThemesIpcHandlers } from '../themes.js'

describe('electron themes IPC host', () => {
  it('registers theme handlers against the provided IPC host', async () => {
    const handle = vi.fn()
    const openPath = vi.fn().mockResolvedValue('')
    const listThemes = vi.fn().mockResolvedValue({ success: true, themes: [] })
    const getTheme = vi.fn().mockResolvedValue({ success: true, theme: { id: 'theme-1' } })
    const applyTheme = vi.fn().mockResolvedValue({ success: true, cssVariables: { '--bg': '#000' } })
    const refreshThemes = vi.fn().mockResolvedValue({ success: true, themes: [] })
    const openThemesFolder = vi.fn(async opener => {
      await opener('/themes')
      return { success: true }
    })

    registerElectronThemesIpcHandlers({
      channels: {
        list: 'themes:get-all',
        get: 'themes:get',
        apply: 'themes:apply',
        refresh: 'themes:refresh',
        openFolder: 'themes:open-folder',
      },
      listThemes,
      getTheme,
      applyTheme,
      refreshThemes,
      openThemesFolder,
      openPath,
      ipcMain: { handle },
    })

    expect(handle).toHaveBeenCalledTimes(5)
    expect(handle.mock.calls.map(call => call[0])).toEqual([
      'themes:get-all',
      'themes:get',
      'themes:apply',
      'themes:refresh',
      'themes:open-folder',
    ])

    await expect(handle.mock.calls[0][1]({})).resolves.toEqual({ success: true, themes: [] })
    await expect(handle.mock.calls[1][1]({}, 'theme-1')).resolves.toEqual({ success: true, theme: { id: 'theme-1' } })
    await expect(handle.mock.calls[2][1]({}, 'theme-1', 'dark')).resolves.toEqual({
      success: true,
      cssVariables: { '--bg': '#000' },
    })
    await expect(handle.mock.calls[3][1]({}, '/repo')).resolves.toEqual({ success: true, themes: [] })
    await expect(handle.mock.calls[4][1]({})).resolves.toEqual({ success: true })

    expect(listThemes).toHaveBeenCalledWith()
    expect(getTheme).toHaveBeenCalledWith('theme-1')
    expect(applyTheme).toHaveBeenCalledWith('theme-1', 'dark')
    expect(refreshThemes).toHaveBeenCalledWith('/repo')
    expect(openThemesFolder).toHaveBeenCalledWith(openPath)
    expect(openPath).toHaveBeenCalledWith('/themes')
  })
})
