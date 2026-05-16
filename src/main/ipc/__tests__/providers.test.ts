import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleGetProviderUsage } from '../providers.js'

const mocks = vi.hoisted(() => ({
  refreshTokenIfNeeded: vi.fn(),
  fetchCodexUsage: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
}))

vi.mock('../../auth/auth-service.js', () => ({
  authService: {
    refreshTokenIfNeeded: mocks.refreshTokenIfNeeded,
  },
}))

vi.mock('../../providers/builtin/codex.js', () => ({
  fetchCodexUsage: mocks.fetchCodexUsage,
}))

vi.mock('../../providers/index.js', () => ({
  getAvailableProviders: vi.fn(() => []),
}))

describe('provider usage IPC helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns unsupported for non-Codex providers', async () => {
    const response = await handleGetProviderUsage({} as any, { providerId: 'openai' })

    expect(response).toEqual({ success: true, providerId: 'openai', unsupported: true })
    expect(mocks.refreshTokenIfNeeded).not.toHaveBeenCalled()
    expect(mocks.fetchCodexUsage).not.toHaveBeenCalled()
  })

  it('refreshes Codex auth and returns official usage', async () => {
    const token = {
      accessToken: 'secret-token',
      expiresAt: Date.now() + 60_000,
      tokenType: 'Bearer',
      accountId: 'acct_123',
      email: 'user@example.com',
      planType: 'pro',
      isFedrampAccount: false,
    }
    const usage = {
      planType: 'pro',
      credits: { hasCredits: true, unlimited: false, balance: '10' },
      limits: [{ id: 'codex', primary: { usedPercent: 15 } }],
    }
    mocks.refreshTokenIfNeeded.mockResolvedValue(token)
    mocks.fetchCodexUsage.mockResolvedValue(usage)

    const response = await handleGetProviderUsage({} as any, { providerId: 'codex' })

    expect(mocks.refreshTokenIfNeeded).toHaveBeenCalledWith('codex')
    expect(mocks.fetchCodexUsage).toHaveBeenCalledWith(token)
    expect(response).toMatchObject({
      success: true,
      providerId: 'codex',
      account: {
        id: 'acct_123',
        email: 'user@example.com',
        planType: 'pro',
        isFedramp: false,
      },
      usage,
    })
    expect(response.capturedAt).toEqual(expect.any(Number))
  })

  it('returns a clear error when Codex is not logged in', async () => {
    mocks.refreshTokenIfNeeded.mockRejectedValue(new Error('Not logged in'))

    const response = await handleGetProviderUsage({} as any, { providerId: 'codex' })

    expect(response).toEqual({
      success: false,
      providerId: 'codex',
      error: 'Not logged in',
    })
    expect(mocks.fetchCodexUsage).not.toHaveBeenCalled()
  })
})
