import { describe, expect, it, vi } from 'vitest'
import { createElectronMainWindowActivationController } from '../activation.js'

function windowMock(overrides: Record<string, unknown> = {}) {
  return {
    isDestroyed: vi.fn(() => false),
    isMinimized: vi.fn(() => false),
    isVisible: vi.fn(() => false),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    ...overrides,
  } as any
}

describe('electron main window activation', () => {
  it('suppresses activation only on macOS after auxiliary window interactions', () => {
    let currentTime = 1000
    const controller = createElectronMainWindowActivationController({
      platform: () => 'darwin',
      now: () => currentTime,
      suppressionMs: 2500,
    })

    expect(controller.shouldSuppressActivation()).toBe(false)
    controller.suppressFromAuxiliaryWindow()
    expect(controller.shouldSuppressActivation()).toBe(true)
    currentTime = 4000
    expect(controller.shouldSuppressActivation()).toBe(false)
  })

  it('does not suppress activation on non-macOS platforms', () => {
    const controller = createElectronMainWindowActivationController({
      platform: () => 'linux',
      now: () => 1000,
    })

    controller.suppressFromAuxiliaryWindow()

    expect(controller.shouldSuppressActivation()).toBe(false)
  })

  it('activates a valid main window and restores minimized windows first', () => {
    const controller = createElectronMainWindowActivationController()
    const win = windowMock({ isMinimized: vi.fn(() => true) })

    expect(controller.activateMainWindow(win)).toBe(true)
    expect(win.restore).toHaveBeenCalledTimes(1)
    expect(win.show).toHaveBeenCalledTimes(1)
    expect(win.focus).toHaveBeenCalledTimes(1)
  })

  it('focuses visible main windows without showing them again', () => {
    const controller = createElectronMainWindowActivationController()
    const win = windowMock({ isVisible: vi.fn(() => true) })

    expect(controller.activateMainWindow(win)).toBe(true)
    expect(win.show).not.toHaveBeenCalled()
    expect(win.focus).toHaveBeenCalledTimes(1)
  })

  it('does not activate destroyed or currently suppressed windows', () => {
    let currentTime = 1000
    const controller = createElectronMainWindowActivationController({
      platform: () => 'darwin',
      now: () => currentTime,
    })
    const destroyed = windowMock({ isDestroyed: vi.fn(() => true) })
    const normal = windowMock()

    expect(controller.activateMainWindow(destroyed)).toBe(false)
    controller.suppressFromAuxiliaryWindow()
    expect(controller.activateMainWindow(normal)).toBe(false)

    currentTime = 5000
    expect(controller.activateMainWindow(normal)).toBe(true)
  })
})
