import { describe, expect, it, vi } from 'vitest'
import {
  getOnethingSettingsForIpc,
  getOnethingSystemThemeForIpc,
  saveOnethingSettingsWithRuntimeEffectsForIpc,
} from '../ipc-operations.js'

interface TestSettings {
  network?: {
    proxy?: { host: string }
  }
  mcp?: { enabled: boolean; servers: string[] }
  acp?: { enabled: boolean; agents: string[] }
}

describe('settings IPC operations', () => {
  it('returns renderer-facing settings from the settings adapter', async () => {
    await expect(getOnethingSettingsForIpc({
      getSettings: () => ({ network: { proxy: { host: '127.0.0.1' } } }),
    })).resolves.toEqual({
      success: true,
      settings: { network: { proxy: { host: '127.0.0.1' } } },
    })
  })

  it('normalizes settings read adapter failures for IPC callers', async () => {
    const logger = { error: vi.fn() }

    await expect(getOnethingSettingsForIpc({
      getSettings: () => {
        throw new Error('read failed')
      },
      logger,
    })).resolves.toEqual({
      success: false,
      error: 'read failed',
    })

    expect(logger.error).toHaveBeenCalled()
  })

  it('saves settings with runtime effects and returns normalized settings', async () => {
    const normalizedSettings: TestSettings = {
      network: { proxy: { host: '127.0.0.1' } },
      mcp: { enabled: true, servers: ['mcp-1'] },
      acp: { enabled: true, agents: ['agent-1'] },
    }
    const saveSettings = vi.fn()

    await expect(saveOnethingSettingsWithRuntimeEffectsForIpc<TestSettings, Partial<TestSettings>>({
      settings: { network: {} },
      saveSettings,
      getSettings: () => normalizedSettings,
      invalidateProviderCache: vi.fn(),
      applyNetworkProxySettings: vi.fn(),
      registerGlobalWindowShortcuts: vi.fn(),
      updateMCPSettings: vi.fn(),
      registerMCPTools: vi.fn(),
      updateACPSettings: vi.fn(),
      defaultMCPSettings: { enabled: true, servers: [] },
      defaultACPSettings: { enabled: true, agents: [] },
    })).resolves.toEqual({
      success: true,
      settings: normalizedSettings,
    })
    expect(saveSettings).toHaveBeenCalledWith({ network: {} })
  })

  it('normalizes settings save failures for IPC callers', async () => {
    const logger = { error: vi.fn() }

    await expect(saveOnethingSettingsWithRuntimeEffectsForIpc<TestSettings, Partial<TestSettings>>({
      settings: {},
      saveSettings: () => {
        throw new Error('save failed')
      },
      getSettings: () => ({}),
      invalidateProviderCache: vi.fn(),
      applyNetworkProxySettings: vi.fn(),
      registerGlobalWindowShortcuts: vi.fn(),
      updateMCPSettings: vi.fn(),
      registerMCPTools: vi.fn(),
      updateACPSettings: vi.fn(),
      defaultMCPSettings: { enabled: true, servers: [] },
      defaultACPSettings: { enabled: true, agents: [] },
      logger,
    })).resolves.toEqual({
      success: false,
      error: 'save failed',
    })

    expect(logger.error).toHaveBeenCalled()
  })

  it('formats system theme for IPC callers', () => {
    expect(getOnethingSystemThemeForIpc(true)).toEqual({
      success: true,
      theme: 'dark',
    })
    expect(getOnethingSystemThemeForIpc(false)).toEqual({
      success: true,
      theme: 'light',
    })
  })
})
