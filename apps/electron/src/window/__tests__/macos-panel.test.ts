import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  configureNonActivatingPanel,
  hideNonActivatingPanel,
  isNonActivatingPanelFrontmost,
  setNonActivatingPanelPinned,
  showNonActivatingPanel,
} from '../macos-panel.js'

vi.mock('electron', () => ({
  app: {
    getAppPath: vi.fn(() => '/mock/app'),
  },
  BrowserWindow: class MockBrowserWindow {},
}))

const originalPlatform = process.platform

function stubPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  })
}

describe('electron macOS panel bridge', () => {
  afterEach(() => {
    stubPlatform(originalPlatform)
  })

  it('does not touch the native bridge on non-macOS platforms', () => {
    stubPlatform('linux')
    const window = {
      getNativeWindowHandle: vi.fn(() => Buffer.from([])),
    } as any

    expect(configureNonActivatingPanel(window)).toBe(false)
    expect(showNonActivatingPanel(window)).toBe(false)
    expect(hideNonActivatingPanel(window)).toBe(false)
    expect(isNonActivatingPanelFrontmost(window)).toBe(false)
    expect(setNonActivatingPanelPinned(window, true)).toBe(false)
    expect(window.getNativeWindowHandle).not.toHaveBeenCalled()
  })
})
