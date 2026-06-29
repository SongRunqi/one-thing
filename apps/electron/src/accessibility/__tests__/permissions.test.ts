import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  isTrustedAccessibilityClient: vi.fn(() => true),
  openExternal: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('electron', () => ({
  shell: {
    openExternal: mocks.openExternal,
  },
  systemPreferences: {
    isTrustedAccessibilityClient: mocks.isTrustedAccessibilityClient,
  },
}))

import {
  checkElectronAccessibilityPermission,
  getElectronAccessibilityPermissionError,
  getElectronAutomationPermissionStatus,
  openElectronAccessibilitySettings,
} from '../permissions.js'

describe('electron accessibility permissions', () => {
  it('checks macOS accessibility permission through systemPreferences', () => {
    const systemPreferences = {
      isTrustedAccessibilityClient: vi.fn(() => true),
    }

    const granted = checkElectronAccessibilityPermission(true, {
      platform: 'darwin',
      systemPreferences,
    })

    expect(granted).toBe(true)
    expect(systemPreferences.isTrustedAccessibilityClient).toHaveBeenCalledWith(true)
  })

  it('treats non-macOS platforms as permission-granted without prompting', () => {
    const systemPreferences = {
      isTrustedAccessibilityClient: vi.fn(() => false),
    }

    expect(checkElectronAccessibilityPermission(true, {
      platform: 'linux',
      systemPreferences,
    })).toBe(true)
    expect(systemPreferences.isTrustedAccessibilityClient).not.toHaveBeenCalled()
  })

  it('opens the macOS accessibility settings pane', async () => {
    const shell = {
      openExternal: vi.fn().mockResolvedValue(undefined),
    }

    await openElectronAccessibilitySettings({ platform: 'darwin', shell })

    expect(shell.openExternal).toHaveBeenCalledWith(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
    )
  })

  it('does not open accessibility settings on other platforms', async () => {
    const shell = {
      openExternal: vi.fn().mockResolvedValue(undefined),
    }

    await openElectronAccessibilitySettings({ platform: 'win32', shell })

    expect(shell.openExternal).not.toHaveBeenCalled()
  })

  it('reports automation permission status from the host adapter', () => {
    const status = getElectronAutomationPermissionStatus(false, {
      platform: 'darwin',
      systemPreferences: {
        isTrustedAccessibilityClient: vi.fn(() => false),
      },
    })

    expect(status).toEqual({
      accessibility: false,
      screenRecording: true,
      platform: 'darwin',
    })
  })

  it('keeps the platform-specific error copy', () => {
    expect(getElectronAccessibilityPermissionError({ platform: 'darwin' }))
      .toContain('Privacy & Security > Accessibility')
    expect(getElectronAccessibilityPermissionError({ platform: 'linux' }))
      .toBe('Accessibility permission is not available on this platform.')
  })
})
