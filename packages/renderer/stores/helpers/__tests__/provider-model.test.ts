/**
 * The display-side resolver MUST stay rule-for-rule identical with the
 * engine's getEffectiveProviderConfig (packages/onething-runtime/src/
 * providers/provider-config.ts) — these cases mirror the engine tests in
 * apps/electron/src/main/engine/__tests__/core-provider-config.test.ts. Divergence is how
 * "the picker showed deepseek but the request went to codex" happens.
 */
import { describe, expect, it } from 'vitest'
import type { AppSettings } from '@/types'
import { resolveProviderModelSelection } from '../provider-model'
import {
  resolveAgentProfile,
  type OnethingAgentDefinition,
} from '@onething/runtime/agents'
import { getEffectiveProviderConfig } from '@onething/runtime/providers/provider-config'

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

  it('shows the agent binding over a session model the user never picked', () => {
    expect(
      resolveProviderModelSelection({
        settings: settings(),
        // lastProvider here is the auto-stamp every assistant message writes.
        session: { lastProvider: 'codex', lastModel: 'gpt-5.5' },
        agentModel: { providerId: 'deepseek', modelId: 'deepseek-chat' },
      }),
    ).toEqual({ providerId: 'deepseek', model: 'deepseek-chat' })
  })

  it('lets a pinned session model outrank the agent binding', () => {
    expect(
      resolveProviderModelSelection({
        settings: settings(),
        session: { lastProvider: 'codex', lastModel: 'gpt-5.5', modelPinned: true },
        agentModel: { providerId: 'deepseek', modelId: 'deepseek-chat' },
      }),
    ).toEqual({ providerId: 'codex', model: 'gpt-5.5' })
  })

  it('falls back to the binding provider default when it pins no model', () => {
    expect(
      resolveProviderModelSelection({
        settings: settings(),
        session: null,
        agentModel: { providerId: 'deepseek' },
      }),
    ).toEqual({ providerId: 'deepseek', model: 'deepseek-chat' })
  })

  it('ignores a binding whose provider has no config', () => {
    expect(
      resolveProviderModelSelection({
        settings: settings(),
        session: { lastProvider: 'deepseek', lastModel: 'deepseek-chat' },
        agentModel: { providerId: 'gone' },
      }),
    ).toEqual({ providerId: 'deepseek', model: 'deepseek-chat' })
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

/**
 * Not a re-statement of the rule — the engine's own functions are run here and
 * the two answers are compared. The agent binding gave the picker a second
 * input, and a second input is a second chance to diverge.
 */
describe('display resolver mirrors the engine', () => {
  function engineSelection(input: {
    session: { lastProvider?: string; lastModel?: string; modelPinned?: boolean } | null
    agent: Partial<OnethingAgentDefinition>
  }) {
    const agent: OnethingAgentDefinition = {
      id: 'agent-a',
      name: 'A',
      systemPrompt: '',
      createdAt: 0,
      updatedAt: 0,
      ...input.agent,
    }
    // What StreamEngine.withAgentModelBinding stamps onto the command…
    const binding = resolveAgentProfile({
      agent,
      session: { modelPinned: input.session?.modelPinned },
    }).model
    // …and what the engine then resolves it to.
    const resolved = getEffectiveProviderConfig(
      settings() as never,
      input.session,
      binding?.providerId
        ? { providerId: binding.providerId, model: binding.modelId }
        : null,
    )
    return { providerId: resolved.providerId, model: resolved.model }
  }

  const cases: Array<{
    name: string
    session: { lastProvider?: string; lastModel?: string; modelPinned?: boolean } | null
    agent: Partial<OnethingAgentDefinition>
  }> = [
    { name: 'no binding, no session', session: null, agent: {} },
    { name: 'no binding, session pair', session: { lastProvider: 'deepseek', lastModel: 'deepseek-chat' }, agent: {} },
    { name: 'binding, no session', session: null, agent: { model: { providerId: 'deepseek', modelId: 'deepseek-chat' } } },
    {
      name: 'binding over an auto-stamped session',
      session: { lastProvider: 'codex', lastModel: 'gpt-5.5' },
      agent: { model: { providerId: 'deepseek', modelId: 'deepseek-chat' } },
    },
    {
      name: 'pinned session over a binding',
      session: { lastProvider: 'codex', lastModel: 'gpt-5.5', modelPinned: true },
      agent: { model: { providerId: 'deepseek', modelId: 'deepseek-chat' } },
    },
    {
      name: 'binding with no model pinned',
      session: null,
      agent: { model: { providerId: 'deepseek' } },
    },
    {
      name: 'binding at a provider with no config',
      session: { lastProvider: 'deepseek', lastModel: 'deepseek-chat' },
      agent: { model: { providerId: 'gone' } },
    },
  ]

  for (const testCase of cases) {
    it(testCase.name, () => {
      expect(
        resolveProviderModelSelection({
          settings: settings(),
          session: testCase.session,
          agentModel: testCase.agent.model ?? null,
        }),
      ).toEqual(engineSelection(testCase))
    })
  }
})
