import { describe, expect, it, vi } from 'vitest'
import {
  getOnethingProviderUsage,
  onethingProviderUsageAccountFromToken,
} from '../provider-usage.js'

describe('provider usage runtime', () => {
  it('returns unsupported for non-Codex providers without touching auth or network adapters', async () => {
    const refreshTokenIfNeeded = vi.fn()
    const fetchCodexUsage = vi.fn()

    await expect(getOnethingProviderUsage({
      providerId: 'openai',
      canonicalCodexProviderId: 'codex',
      refreshTokenIfNeeded,
      fetchCodexUsage,
    })).resolves.toEqual({
      success: true,
      providerId: 'openai',
      unsupported: true,
    })

    expect(refreshTokenIfNeeded).not.toHaveBeenCalled()
    expect(fetchCodexUsage).not.toHaveBeenCalled()
  })

  it('refreshes Codex auth, fetches usage, and projects account details', async () => {
    const token = {
      accessToken: 'token',
      accountId: 'acct-1',
      email: 'user@example.com',
      planType: 'plus',
      isFedrampAccount: false,
    }
    const usage = { limits: [{ id: 'limit-1' }] }
    const fetchCodexUsage = vi.fn(() => usage)

    await expect(getOnethingProviderUsage({
      providerId: 'codex',
      canonicalCodexProviderId: 'codex',
      refreshTokenIfNeeded: vi.fn(() => token),
      fetchCodexUsage,
      now: () => 123,
    })).resolves.toEqual({
      success: true,
      providerId: 'codex',
      capturedAt: 123,
      account: {
        id: 'acct-1',
        email: 'user@example.com',
        planType: 'plus',
        isFedramp: false,
      },
      usage,
    })

    expect(fetchCodexUsage).toHaveBeenCalledWith(token)
  })

  it('uses the canonical Codex provider id for auth and error responses', async () => {
    await expect(getOnethingProviderUsage({
      providerId: 'codex-alias',
      codexProviderIds: ['codex', 'codex-alias'],
      canonicalCodexProviderId: 'codex',
      refreshTokenIfNeeded: vi.fn(async () => {
        throw new Error('expired')
      }),
      fetchCodexUsage: vi.fn(),
    })).resolves.toEqual({
      success: false,
      providerId: 'codex',
      error: 'expired',
    })
  })

  it('maps token account fields without requiring provider-specific token types', () => {
    expect(onethingProviderUsageAccountFromToken({
      accountId: 'acct-1',
      email: 'user@example.com',
      planType: 'team',
      isFedrampAccount: true,
    })).toEqual({
      id: 'acct-1',
      email: 'user@example.com',
      planType: 'team',
      isFedramp: true,
    })
  })
})
