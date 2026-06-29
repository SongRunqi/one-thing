import { describe, expect, it, vi } from 'vitest'
import {
  captureElectronMainWindowVisibility,
  isElectronMainAppWindow,
  restoreElectronHiddenMainWindows,
} from '../window-visibility.js'

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
}))

function windowMock(url: string, visible: boolean, overrides: Record<string, unknown> = {}) {
  return {
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => visible),
    hide: vi.fn(() => undefined),
    webContents: {
      getURL: vi.fn(() => url),
    },
    ...overrides,
  } as any
}

describe('electron main window visibility snapshots', () => {
  it('identifies main app windows using the injected URL predicate', () => {
    const main = windowMock('app://local/#/chat', true)
    const auxiliary = windowMock('app://local/#/settings', true)
    const destroyed = windowMock('app://local/#/chat', true, {
      isDestroyed: vi.fn(() => true),
    })

    expect(isElectronMainAppWindow(main, {
      isMainWindowUrl: url => url.includes('#/chat'),
    })).toBe(true)
    expect(isElectronMainAppWindow(auxiliary, {
      isMainWindowUrl: url => url.includes('#/chat'),
    })).toBe(false)
    expect(isElectronMainAppWindow(destroyed, {
      isMainWindowUrl: () => true,
    })).toBe(false)
  })

  it('captures visibility only for main app windows', () => {
    const main = windowMock('app://local/#/chat', false)
    const settings = windowMock('app://local/#/settings', true)

    expect(captureElectronMainWindowVisibility({
      getAllWindows: () => [main, settings],
      isMainWindowUrl: url => url.includes('#/chat'),
    })).toEqual([
      { window: main, visible: false },
    ])
  })

  it('restores hidden main windows across retry delays', () => {
    const hidden = windowMock('app://local/#/chat', true)
    const visible = windowMock('app://local/#/chat', true)
    const scheduled: Array<{ callback: () => void; delay: number }> = []

    restoreElectronHiddenMainWindows([
      { window: hidden, visible: false },
      { window: visible, visible: true },
    ], {
      restoreDelaysMs: [0, 80],
      schedule: (callback, delay) => {
        scheduled.push({ callback, delay })
      },
    })

    expect(scheduled.map(item => item.delay)).toEqual([0, 80])
    scheduled[0].callback()
    scheduled[1].callback()

    expect(hidden.hide).toHaveBeenCalledTimes(2)
    expect(visible.hide).not.toHaveBeenCalled()
  })
})
