/**
 * The display-side resolver MUST stay rule-for-rule identical with the
 * engine's getEffectiveProviderConfig (packages/onething-runtime/src/
 * providers/provider-config.ts) — these cases mirror the engine tests in
 * src/main/engine/__tests__/core-provider-config.test.ts. Divergence is how
 * "the picker showed deepseek but the request went to codex" happens.
 */
import { describe, expect, it } from 'vitest'
import type { AppSettings } from '@/types'
import { resolveProviderModelSelection } from '../provider-model'

function settings(): AppSettings {
  return {
    ai: {
      provider: 'codex',
      providers: {
        codex: {
          model: 'gpt-5.5',
          selectedModels: ['gpt-5.5'],
        },
        deepseek: {
          model: 'deepseek-chat',
          selectedModels: ['deepseek-chat'],
        },
      },
      customProviders: [],
    },
  } as unknown as AppSettings
}

describe('resolveProviderModelSelection', () => {
  it('shows the session pair as-is when the provider config exists', () => {
    expect(
      resolveProviderModelSelection({
        settings: settings(),
        session: { lastProvider: 'deepseek', lastModel: 'deepseek-v4-pro' },
      }),
    ).toEqual({ providerId: 'deepseek', model: 'deepseek-v4-pro' })
  })

  it('falls back to the provider default model when only lastProvider is set', () => {
    expect(
      resolveProviderModelSelection({
        settings: settings(),
        session: { lastProvider: 'deepseek' },
      }),
    ).toEqual({ providerId: 'deepseek', model: 'deepseek-chat' })
  })

  it('falls back to the global selection when the session provider has no config', () => {
    expect(
      resolveProviderModelSelection({
        settings: settings(),
        session: { lastProvider: 'missing', lastModel: 'whatever' },
      }),
    ).toEqual({ providerId: 'codex', model: 'gpt-5.5' })
  })

  it('ignores a model-only session (no provider inference) and shows global', () => {
    expect(
      resolveProviderModelSelection({
        settings: settings(),
        session: { lastModel: 'deepseek-chat' },
      }),
    ).toEqual({ providerId: 'codex', model: 'gpt-5.5' })
  })

  it('shows global when the session has no selection at all', () => {
    expect(
      resolveProviderModelSelection({ settings: settings(), session: null }),
    ).toEqual({ providerId: 'codex', model: 'gpt-5.5' })
  })

  it('does not repair a mismatched pair — what is shown is what will be sent', () => {
    // The old behavior rerouted the display to whichever provider had the
    // model, while the engine kept using the stored pair; the incident this
    // guards against is the picker and the request disagreeing.
    expect(
      resolveProviderModelSelection({
        settings: settings(),
        session: { lastProvider: 'deepseek', lastModel: 'gpt-5.5' },
      }),
    ).toEqual({ providerId: 'deepseek', model: 'gpt-5.5' })
  })
})
