import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getAllWindows: vi.fn(() => []),
}))

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: mocks.getAllWindows,
  },
}))

import {
  broadcastElectronOAuthTokenExpired,
  broadcastElectronOAuthTokenRefreshed,
} from '../events.js'

describe('electron OAuth events', () => {
  it('broadcasts token refresh events to all live windows', () => {
    const first = {
      isDestroyed: vi.fn(() => false),
      webContents: { send: vi.fn() },
    }
    const second = {
      isDestroyed: vi.fn(() => false),
      webContents: { send: vi.fn() },
    }

    broadcastElectronOAuthTokenRefreshed({
      channel: 'oauth:token-refreshed',
      providerId: 'codex',
      getAllWindows: () => [first, second],
    })

    expect(first.webContents.send).toHaveBeenCalledWith('oauth:token-refreshed', {
      providerId: 'codex',
    })
    expect(second.webContents.send).toHaveBeenCalledWith('oauth:token-refreshed', {
      providerId: 'codex',
    })
  })

  it('broadcasts token expiry events with optional error details', () => {
    const win = {
      isDestroyed: vi.fn(() => false),
      webContents: { send: vi.fn() },
    }

    broadcastElectronOAuthTokenExpired({
      channel: 'oauth:token-expired',
      providerId: 'codex',
      error: 'refresh failed',
      getAllWindows: () => [win],
    })

    expect(win.webContents.send).toHaveBeenCalledWith('oauth:token-expired', {
      providerId: 'codex',
      error: 'refresh failed',
    })
  })

  it('skips destroyed windows', () => {
    const destroyed = {
      isDestroyed: vi.fn(() => true),
      webContents: { send: vi.fn() },
    }

    broadcastElectronOAuthTokenRefreshed({
      channel: 'oauth:token-refreshed',
      providerId: 'codex',
      getAllWindows: () => [destroyed],
    })

    expect(destroyed.webContents.send).not.toHaveBeenCalled()
  })
})
